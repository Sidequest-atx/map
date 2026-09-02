import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { classifierAvailable, classifyHazardPhoto } from "../ai/classify";
import { collapseBatch, findDuplicates, likelyDuplicate } from "../ai/dedup";
import { GpsHud } from "../components/GpsHud";
import { TrailMap } from "../components/Maps";
import { readBase64 } from "../data/fs";
import { nearestNeighborhood, nearestPlace } from "../data/places";
import { getPrefs, useSession } from "../data/session";
import { getStore } from "../data/store";
import { uuid } from "../lib/format";
import { haversine, trailMiles, type LngLat } from "../lib/geo";
import { useLiveGps } from "../lib/location";
import { processCapture, saveToAlbum } from "../lib/photos";
import type { ScreenProps } from "../nav";
import { C, R, SP, T } from "../theme";
import { HAZARD_ORDER, HAZARD_SHORT, SEVERITY_ORDER, SEVERITY_LABELS, type HazardReport, type HazardType, type Severity } from "../types";
import { Button, Card, Chip, Empty, H1, H2, KPI, Notice, P, Row, Screen, Segmented, SevBadge, Small, Stack } from "../ui";
import { loadDriveQueue, saveDriveQueue, type DriveFrame } from "./driveQueue";

type Phase = "idle" | "capturing" | "processing" | "review" | "done";

export function DriveScreen({ navigation }: ScreenProps<"Drive">) {
  useKeepAwake();
  const session = useSession();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("idle");
  const [camPerm, requestCam] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [camReady, setCamReady] = useState(false);
  const gps = useLiveGps(phase === "capturing");
  const [intervalS, setIntervalS] = useState<0 | 5 | 10>(getPrefs().driveIntervalS);
  const [frames, setFrames] = useState<DriveFrame[]>([]);
  const [trail, setTrail] = useState<LngLat[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [resumable, setResumable] = useState(() => loadDriveQueue());
  const [submitted, setSubmitted] = useState<{ count: number; miles: number } | null>(null);
  const [flash, setFlash] = useState(false);
  const capturing = useRef(false);
  const frameCount = useRef(0);
  const captureTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (camPerm && !camPerm.granted && camPerm.canAskAgain) void requestCam();
  }, [camPerm, requestCam]);

  // Trail from the live GPS
  useEffect(() => {
    const f = gps.fix;
    if (!f || phase !== "capturing") return;
    const pt: LngLat = [f.lng, f.lat];
    setTrail((t) => (t.length && haversine(t[t.length - 1], pt) < 4 ? t : [...t, pt]));
  }, [gps.fix, phase]);

  // Persist the queue so an interrupted drive can be reviewed later
  useEffect(() => {
    if (phase === "done" || phase === "idle") return;
    if (!frames.length) return;
    saveDriveQueue({ frames, trail, startedAt: startedAt ?? new Date().toISOString(), frameCount: frameCount.current });
  }, [frames, trail, startedAt, phase]);

  const capture = useCallback(async () => {
    if (!cam.current || !camReady || capturing.current) return;
    capturing.current = true;
    const snap = gps.snapshot();
    const at = new Date();
    try {
      const pic = await cam.current.takePictureAsync({ quality: 0.8, exif: false, shutterSound: false });
      if (!pic) return;
      setFlash(true);
      setTimeout(() => setFlash(false), 200);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const id = uuid();
      const fix = snap?.fix ?? null;
      const stored = await processCapture(
        pic.uri,
        { width: pic.width, height: pic.height },
        fix
          ? { lat: fix.lat, lng: fix.lng, altitudeM: fix.altitudeM, headingDeg: snap?.headingDeg ?? null, accuracyM: fix.accuracyM, takenAt: at, description: "SideQuest ATX Quest Drive frame", software: "SideQuest ATX" }
          : null,
        { id, longEdge: 1600 },
      );
      frameCount.current += 1;
      const lngLat: LngLat = fix ? [fix.lng, fix.lat] : trail[trail.length - 1] ?? [-97.7985, 30.4505];
      setFrames((f) => [...f, { id, photoUri: stored.photoUri, thumbUri: stored.thumbUri, lngLat, accuracyM: fix?.accuracyM ?? null, headingDeg: snap?.headingDeg ?? null, at: at.toISOString() }]);
    } catch (e) {
      console.warn("[drive] capture failed", e);
    } finally {
      capturing.current = false;
    }
  }, [camReady, gps, trail]);

  // `capture` is a new function on every render (useLiveGps returns a fresh object each
  // time), so the interval must not depend on it: re-running this effect once a second
  // would clear the timer before it ever reached 5 s and no frame would be taken.
  const captureRef = useRef(capture);
  useEffect(() => {
    captureRef.current = capture;
  }, [capture]);

  useEffect(() => {
    if (captureTimer.current) clearInterval(captureTimer.current);
    captureTimer.current = null;
    if (phase === "capturing" && intervalS > 0) captureTimer.current = setInterval(() => void captureRef.current(), intervalS * 1000);
    return () => {
      if (captureTimer.current) clearInterval(captureTimer.current);
      captureTimer.current = null;
    };
  }, [phase, intervalS]);

  function begin() {
    setResumable(null);
    saveDriveQueue(null);
    setFrames([]);
    setTrail([]);
    frameCount.current = 0;
    setStartedAt(new Date().toISOString());
    setPhase("capturing");
  }

  function resume() {
    const q = loadDriveQueue();
    if (!q) return;
    setFrames(q.frames);
    setTrail(q.trail);
    setStartedAt(q.startedAt);
    frameCount.current = q.frameCount;
    setResumable(null);
    if (q.frames.some((f) => f.type)) setPhase("review");
    else void process(q.frames);
  }

  async function stop() {
    if (captureTimer.current) clearInterval(captureTimer.current);
    if (!frames.length) {
      setPhase("idle");
      saveDriveQueue(null);
      Alert.alert("No frames captured", "Nothing to review.");
      return;
    }
    await process(frames);
  }

  async function process(input: DriveFrame[]) {
    setPhase("processing");
    setProgress(0);
    const out: DriveFrame[] = [];
    const useAi = classifierAvailable();
    for (let i = 0; i < input.length; i++) {
      const f = input[i];
      let ai = f.ai;
      if (useAi && ai === undefined) {
        try {
          ai = await classifyHazardPhoto(await readBase64(f.photoUri));
        } catch {
          ai = null;
        }
      }
      out.push({ ...f, ai: ai ?? null, type: f.type ?? ai?.label ?? "crack", severity: f.severity ?? ai?.severity ?? "moderate" });
      setProgress((i + 1) / input.length);
    }
    // With a model: drop confident "nothing here" reads. Without one: every frame is a candidate the captain triages.
    const candidates = useAi ? out.filter((f) => !(f.ai && f.ai.label === "other" && f.ai.confidence < 0.6)) : out;
    const typed = candidates.map((f) => ({ ...f, type: f.type as HazardType }));
    const { kept } = collapseBatch(typed);
    const existing = getStore().list();
    const reviewed: DriveFrame[] = kept.map((f) => {
      const m = likelyDuplicate(findDuplicates({ lngLat: f.lngLat, type: f.type }, existing));
      return { ...f, accepted: !m, dupOf: m?.report.ref, dupDist: m?.distanceM };
    });
    setFrames(reviewed);
    setPhase("review");
  }

  function submitAll() {
    if (!session) return;
    const accepted = frames.filter((f) => f.accepted);
    if (!accepted.length) {
      Alert.alert("Nothing accepted", "Accept at least one frame, or discard the drive.");
      return;
    }
    const driveId = uuid();
    const now = new Date().toISOString();
    const miles = trailMiles(trail);
    const rows: Omit<HazardReport, "ref">[] = accepted.map((f) => ({
      id: f.id,
      type: f.type ?? "other",
      severity: f.severity ?? "moderate",
      status: "open",
      source: "drive",
      lng: f.lngLat[0],
      lat: f.lngLat[1],
      place: placeName(f.lngLat),
      neighborhood: nearestNeighborhood(f.lngLat),
      description: f.ai?.reason ? `Captured on a Quest Drive. ${f.ai.reason}` : "Captured on a Quest Drive.",
      photoUri: f.photoUri,
      thumbUri: f.thumbUri,
      fix: { accuracyM: f.accuracyM, altitudeM: null, headingDeg: f.headingDeg, speedMps: null, fixAt: new Date(f.at).getTime(), method: "gps-at-shutter" },
      ai: f.ai ? { label: f.ai.label, severity: f.ai.severity, confidence: f.ai.confidence, model: f.ai.model } : undefined,
      reporter: session.name,
      driveId,
      createdAt: f.at,
      updatedAt: now,
    }));
    const created = getStore().addMany(rows, {
      drive: { id: driveId, captain: session.name, startedAt: startedAt ?? now, endedAt: now, trail, frames: frameCount.current || frames.length, reports: rows.length, miles: Math.round(miles * 100) / 100 },
    });
    saveDriveQueue(null);
    setSubmitted({ count: rows.length, miles });
    setPhase("done");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (getPrefs().saveToPhotos) {
      (async () => {
        for (const r of created) {
          if (!r.photoUri) continue;
          try {
            const { assetId } = await saveToAlbum(r.photoUri);
            if (assetId) getStore().update(r.id, { photoAssetId: assetId });
          } catch {
            /* best effort */
          }
        }
      })();
    }
  }

  function discardAll() {
    if (captureTimer.current) clearInterval(captureTimer.current);
    saveDriveQueue(null);
    setFrames([]);
    setTrail([]);
    setPhase("idle");
    setSubmitted(null);
  }

  const miles = useMemo(() => trailMiles(trail), [trail]);
  const acceptedCount = frames.filter((f) => f.accepted).length;

  if (phase === "idle") {
    return (
      <Screen>
        <Stack gap={SP.lg}>
          <View>
            <H1>Quest Drive.</H1>
            <P soft>Shoot from the passenger seat while someone else drives. You review every frame before anything reaches the map.</P>
          </View>
          {resumable ? (
            <Notice tone="warn">
              <P>
                <Text style={{ fontWeight: "700" }}>Unfinished drive on this phone:</Text> {resumable.frames.length} frames from {new Date(resumable.startedAt).toLocaleString()}.
              </P>
              <Row>
                <Button title="Resume review" size="sm" variant="primary" onPress={resume} />
                <Button
                  title="Discard"
                  size="sm"
                  onPress={() => {
                    saveDriveQueue(null);
                    setResumable(null);
                  }}
                />
              </Row>
            </Notice>
          ) : null}
          <Notice tone="warn">
            <P>
              <Text style={{ fontWeight: "700" }}>Passenger only.</Text> The driver drives. Under 25 mph keeps the frames usable.
            </P>
          </Notice>
          <Card>
            <H2>Auto-capture</H2>
            <Segmented
              options={[
                { key: "0", label: "Tap only" },
                { key: "5", label: "Every 5 s" },
                { key: "10", label: "Every 10 s" },
              ]}
              value={String(intervalS) as "0" | "5" | "10"}
              onChange={(k) => setIntervalS(Number(k) as 0 | 5 | 10)}
            />
          </Card>
          <Button title="Start the drive" variant="primary" size="lg" block onPress={begin} />
          <Small>Drive captures are confirmed on foot before anything goes to 311.</Small>
        </Stack>
      </Screen>
    );
  }

  if (phase === "capturing" || phase === "processing") {
    return (
      <View style={{ flex: 1, backgroundColor: C.black }}>
        <View style={{ flex: 1 }}>
          {camPerm?.granted ? <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="back" mode="picture" onCameraReady={() => setCamReady(true)} animateShutter={false} /> : null}
          {flash ? <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.5)" }]} /> : null}
          <View style={styles.hudTop}>
            <Row justify="space-between">
              <View style={styles.pill}>
                {phase === "capturing" ? <View style={[styles.dot, { backgroundColor: C.sevSevere }]} /> : null}
                <Text style={styles.pillText}>{phase === "capturing" ? "Capturing" : "Stopped"}</Text>
              </View>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{miles.toFixed(2)} mi</Text>
              </View>
            </Row>
            <GpsHud gps={gps} compact />
          </View>
          <View style={styles.hudBottom}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>{frames.length} frames</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>{intervalS ? `every ${intervalS}s` : "tap to capture"}</Text>
            </View>
          </View>
        </View>
        <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, SP.md) }]}>
          {phase === "capturing" ? (
            <>
              <Row justify="space-between">
                <Segmented
                  options={[
                    { key: "0", label: "Tap" },
                    { key: "5", label: "5s" },
                    { key: "10", label: "10s" },
                  ]}
                  value={String(intervalS) as "0" | "5" | "10"}
                  onChange={(k) => setIntervalS(Number(k) as 0 | 5 | 10)}
                />
                <Button title="Stop and review" variant="danger" onPress={() => void stop()} />
              </Row>
              <Row justify="space-between" style={{ marginTop: SP.md }}>
                <View style={{ width: 72 }} />
                <Pressable onPress={() => void capture()} style={({ pressed }) => [styles.shutter, pressed ? { transform: [{ scale: 0.94 }] } : null]} accessibilityLabel="Capture frame">
                  <View style={styles.shutterInner} />
                </Pressable>
                <View style={{ width: 72 }} />
              </Row>
              {frames.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: SP.md }}>
                  {frames.slice(-12).map((f) => (
                    <Image key={f.id} source={{ uri: f.thumbUri }} style={{ width: 56, height: 56, borderRadius: R.sm }} />
                  ))}
                </ScrollView>
              ) : null}
              <TrailMap trail={trail} height={140} style={{ marginTop: SP.md }} />
            </>
          ) : (
            <Card>
              <Row justify="space-between">
                <H2>{classifierAvailable() ? "Classifying" : "Preparing"} {frames.length} frames</H2>
                <Text style={T.mono}>{Math.round(progress * 100)}%</Text>
              </Row>
              <ActivityIndicator color={C.olive600} />
              <Small>Duplicates get removed next. Nothing is posted yet.</Small>
            </Card>
          )}
        </View>
      </View>
    );
  }

  if (phase === "review") {
    return (
      <Screen
        bottom={
          <Row gap={SP.sm}>
            <Button title="Discard drive" variant="danger" onPress={() => Alert.alert("Discard this drive?", "Frames stay in the app's photo folder until the next cleanup.", [{ text: "Cancel", style: "cancel" }, { text: "Discard", style: "destructive", onPress: discardAll }])} />
            <Button title={`Submit ${acceptedCount} report${acceptedCount === 1 ? "" : "s"}`} variant="primary" style={{ flex: 1 }} disabled={!acceptedCount} onPress={submitAll} />
          </Row>
        }
      >
        <Stack gap={SP.lg}>
          <View>
            <H1>Review {frames.length} candidates.</H1>
            <P soft>{acceptedCount} accepted. Frames matching an existing report start unchecked.</P>
          </View>
          <Row gap={SP.sm} align="stretch">
            <KPI value={miles.toFixed(2)} label="miles covered" />
            <KPI value={String(frameCount.current || frames.length)} label="frames captured" />
            <KPI value={String(frames.length)} label="after dedup" />
          </Row>
          <Row>
            <Button title="Accept all" size="sm" onPress={() => setFrames((fs) => fs.map((f) => ({ ...f, accepted: true })))} />
            <Button title="Reject all" size="sm" onPress={() => setFrames((fs) => fs.map((f) => ({ ...f, accepted: false })))} />
          </Row>
          {frames.length === 0 ? (
            <Empty title="No usable frames." body="Every frame read as empty pavement. Try a slower street or tap-capture at the defects." action={<Button title="Start another drive" variant="primary" size="sm" onPress={discardAll} />} />
          ) : (
            frames.map((f) => (
              <FrameRow key={f.id} f={f} onChange={(patch) => setFrames((fs) => fs.map((x) => (x.id === f.id ? { ...x, ...patch } : x)))} />
            ))
          )}
        </Stack>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack gap={SP.lg} style={{ alignItems: "center", paddingTop: SP.xl }}>
        <View style={styles.doneCheck}>
          <Text style={{ color: C.inkOnDark, fontSize: 30 }}>✓</Text>
        </View>
        <H1>Drive logged.</H1>
        <P soft style={{ textAlign: "center" }}>
          {submitted?.count} reports over {submitted?.miles.toFixed(2)} miles, marked as Quest Drive captures.
        </P>
        <Button title="See the reports" variant="primary" size="lg" block onPress={() => navigation.replace("Reports")} />
        <Button title="Another drive" block onPress={discardAll} />
        <Button title="Home" variant="ghost" block onPress={() => navigation.popToTop()} />
      </Stack>
    </Screen>
  );
}

export function FrameRow({ f, onChange }: { f: DriveFrame; onChange: (patch: Partial<DriveFrame>) => void }) {
  return (
    <Card style={{ opacity: f.accepted ? 1 : 0.6 }}>
      <Row align="flex-start">
        <Image source={{ uri: f.thumbUri }} style={{ width: 88, height: 88, borderRadius: R.md, backgroundColor: C.field3 }} />
        <View style={{ flex: 1, gap: 6 }}>
          <Row justify="space-between">
            <Row gap={6}>
              <Switch value={Boolean(f.accepted)} onValueChange={(v) => onChange({ accepted: v })} trackColor={{ true: C.olive600 }} />
              <Text style={{ fontWeight: "700", color: C.ink }}>Accept</Text>
            </Row>
            {f.severity ? <SevBadge s={f.severity} /> : null}
          </Row>
          <Small>{f.dupOf ? `Matches ${f.dupOf} (${f.dupDist} m)` : f.ai?.reason ? f.ai.reason : f.accuracyM != null ? `GPS ±${Math.round(f.accuracyM)} m` : "No GPS fix for this frame"}</Small>
        </View>
      </Row>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {HAZARD_ORDER.map((t) => (
          <Chip key={t} label={HAZARD_SHORT[t]} on={f.type === t} onPress={() => onChange({ type: t })} />
        ))}
      </ScrollView>
      <Row gap={6}>
        {SEVERITY_ORDER.map((s: Severity) => (
          <Chip key={s} label={SEVERITY_LABELS[s]} on={f.severity === s} onPress={() => onChange({ severity: s })} />
        ))}
      </Row>
    </Card>
  );
}

function placeName(c: LngLat): string {
  const { place, distanceM } = nearestPlace(c);
  return distanceM < 400 ? `Near ${place.name}` : `${nearestNeighborhood(c)}, ${c[1].toFixed(4)}, ${c[0].toFixed(4)}`;
}

const styles = StyleSheet.create({
  hudTop: { position: "absolute", top: SP.sm, left: SP.md, right: SP.md, gap: 6 },
  hudBottom: { position: "absolute", bottom: SP.sm, left: SP.md, right: SP.md, flexDirection: "row", justifyContent: "space-between" },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(38,40,28,0.72)", paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999 },
  pillText: { color: C.inkOnDark, fontSize: 12.5, fontWeight: "600", fontVariant: ["tabular-nums"] },
  dot: { width: 8, height: 8, borderRadius: 4 },
  controls: { backgroundColor: C.field, padding: SP.md },
  shutter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: C.olive800, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.olive800 },
  doneCheck: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.olive600, alignItems: "center", justifyContent: "center" },
});
