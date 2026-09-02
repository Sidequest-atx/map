import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useKeepAwake } from "expo-keep-awake";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { collapseBatch, findDuplicates, likelyDuplicate } from "../ai/dedup";
import { TrailMap } from "../components/Maps";
import { deleteIfExists } from "../data/fs";
import { nearestNeighborhood } from "../data/places";
import { getPrefs, setPrefs, usePrefs, useSession } from "../data/session";
import { getStore } from "../data/store";
import { findWalkPhotos, placementNote, rematch, type WalkPhoto } from "../glasses/match";
import { appendPoint, clearWalk, getActiveWalk, readTrail, startWalk, stopWalk, type ActiveWalk } from "../glasses/trail";
import { fmtDuration, shortTime, uuid } from "../lib/format";
import { trailPointsMiles, type LngLat } from "../lib/geo";
import { guessPlace, useLiveGps } from "../lib/location";
import { processCapture, saveToAlbum } from "../lib/photos";
import type { ScreenProps } from "../nav";
import { C, R, SP } from "../theme";
import { HAZARD_ORDER, HAZARD_SHORT, SEVERITY_LABELS, SEVERITY_ORDER, type HazardReport, type HazardType, type Severity, type TrailPoint } from "../types";
import { Badge, Button, Card, Chip, Empty, H1, H2, KPI, Notice, P, Row, Screen, SevBadge, Small, Stack } from "../ui";

type Phase = "idle" | "walking" | "finding" | "review" | "importing" | "done";

interface Candidate extends WalkPhoto {
  selected: boolean;
  type: HazardType;
  severity: Severity;
  dupOf?: string;
  dupDist?: number;
}

export function GlassesWalkScreen({ navigation }: ScreenProps<"GlassesWalk">) {
  const session = useSession();
  const prefs = usePrefs();
  const [phase, setPhase] = useState<Phase>(() => (getActiveWalk() ? "walking" : "idle"));
  const [walk, setWalk] = useState<ActiveWalk | null>(() => getActiveWalk());
  const [trail, setTrail] = useState<TrailPoint[]>(() => readTrail());
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [findNote, setFindNote] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [submitted, setSubmitted] = useState<{ count: number; miles: number } | null>(null);
  const lastType = useRef<HazardType>("crack");

  // Foreground GPS only when background updates were not granted (the OS task handles the rest).
  const foregroundOnly = phase === "walking" && walk != null && !walk.background;
  const gps = useLiveGps(foregroundOnly);
  useKeepAwake();

  useEffect(() => {
    if (!foregroundOnly || !gps.fix) return;
    appendPoint({ lng: gps.fix.lng, lat: gps.fix.lat, t: gps.fix.at, accuracyM: gps.fix.accuracyM });
  }, [foregroundOnly, gps.fix]);

  // Poll the trail file while walking (the background task writes it).
  useEffect(() => {
    if (phase !== "walking") return;
    const t = setInterval(() => {
      setTrail(readTrail());
      setNow(Date.now());
    }, 2000);
    return () => clearInterval(t);
  }, [phase]);

  const miles = useMemo(() => trailPointsMiles(trail), [trail]);
  const lastAcc = trail.length ? trail[trail.length - 1].accuracyM : null;

  async function begin() {
    if (!session) return;
    const res = await startWalk(session.name, uuid());
    if (!res.ok) {
      Alert.alert("Could not start", res.reason);
      return;
    }
    setWalk(res.walk);
    setTrail([]);
    setPhase("walking");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (!res.walk.background) {
      Alert.alert("Background location not granted", "The trail records only while SideQuest is open on screen. For pocket walks, allow \"Always\" in Settings → SideQuest → Location.");
    }
  }

  async function end() {
    const { trail: t } = await stopWalk();
    setTrail(t);
    setEndedAt(Date.now());
    setPhase("finding");
    await findPhotos(t, Date.now());
  }

  const findPhotos = useCallback(
    async (t: TrailPoint[], endMs: number) => {
      if (!walk) return;
      setFindNote(null);
      const startMs = new Date(walk.startedAt).getTime();
      const res = await findWalkPhotos(t, { startMs, endMs }, getPrefs().glassesClockOffsetS);
      if (!res.ok) {
        setFindNote(res.reason);
        setCandidates([]);
        setPhase("review");
        return;
      }
      const existing = getStore().list();
      const withDup = res.photos.map((p) => {
        const m = likelyDuplicate(findDuplicates({ lngLat: [p.lng, p.lat], type: lastType.current }, existing));
        return { ...p, selected: true, type: lastType.current, severity: "moderate" as Severity, dupOf: m?.report.ref, dupDist: m?.distanceM };
      });
      setCandidates(withDup);
      setPhase("review");
    },
    [walk],
  );

  async function pickManually() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 0, exif: true, quality: 1, orderedSelection: true });
    if (res.canceled) return;
    const startMs = walk ? new Date(walk.startedAt).getTime() : 0;
    const picked: Candidate[] = res.assets.map((a, i) => {
      const ex = (a.exif ?? {}) as Record<string, unknown>;
      const dto = ex.DateTimeOriginal as string | undefined;
      let takenAt = startMs + i * 60_000;
      if (dto && /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/.test(dto)) {
        const [d, t] = dto.split(" ");
        const [Y, M, D] = d.split(":").map(Number);
        const [h, m, s] = t.split(":").map(Number);
        takenAt = new Date(Y, M - 1, D, h, m, s).getTime();
      }
      const base: WalkPhoto = {
        assetId: a.assetId ?? uuid(),
        uri: a.uri,
        filename: a.fileName ?? "photo.jpg",
        width: a.width,
        height: a.height,
        takenAt,
        exifLocation: null,
        onTrail: { lng: 0, lat: 0, gapS: Infinity, accuracyM: null, how: "none" },
        lat: 0,
        lng: 0,
        method: "trail-interpolated",
        external: true,
      };
      return { ...rematch([base], trail, prefs.glassesClockOffsetS)[0], selected: true, type: lastType.current, severity: "moderate" as Severity };
    });
    setCandidates(picked);
    setFindNote(null);
    setPhase("review");
  }

  function nudgeOffset(delta: number) {
    const next = prefs.glassesClockOffsetS + delta;
    setPrefs({ glassesClockOffsetS: next });
    setCandidates((cs) => rematch(cs, trail, next).map((p, i) => ({ ...cs[i], ...p })));
  }

  async function importSelected() {
    if (!session || !walk) return;
    const chosen = candidates.filter((c) => c.selected);
    if (!chosen.length) {
      Alert.alert("Nothing selected", "Select at least one photo, or discard the walk.");
      return;
    }
    setPhase("importing");
    setProgress(0);
    const rows: Omit<HazardReport, "ref">[] = [];
    const created: { id: string; photoUri: string; thumbUri: string }[] = [];
    for (let i = 0; i < chosen.length; i++) {
      const c = chosen[i];
      const id = uuid();
      const takenAt = new Date(c.takenAt);
      try {
        const stored = await processCapture(
          c.uri,
          { width: c.width, height: c.height },
          { lat: c.lat, lng: c.lng, accuracyM: c.onTrail.accuracyM, takenAt, description: "SideQuest ATX Glasses Walk photo", software: "SideQuest ATX", userComment: JSON.stringify({ sq: id, method: c.method, gapS: Math.round(c.onTrail.gapS) }) },
          { id },
        );
        const place = await guessPlace([c.lng, c.lat]);
        rows.push({
          id,
          type: c.type,
          severity: c.severity,
          status: "open",
          source: "glasses",
          lng: c.lng,
          lat: c.lat,
          place: place.place,
          neighborhood: place.neighborhood || nearestNeighborhood([c.lng, c.lat]),
          description: `Captured on a Glasses Walk. ${placementNote(c)}`,
          photoUri: stored.photoUri,
          thumbUri: stored.thumbUri,
          fix: { accuracyM: c.onTrail.accuracyM, altitudeM: null, headingDeg: null, speedMps: null, fixAt: c.takenAt, method: c.method },
          reporter: session.name,
          walkId: walk.id,
          duplicateOf: c.dupOf ? getStore().get(c.dupOf)?.id : undefined,
          createdAt: takenAt.toISOString(),
          updatedAt: new Date().toISOString(),
        });
        created.push({ id, photoUri: stored.photoUri, thumbUri: stored.thumbUri });
      } catch (e) {
        console.warn("[walk] import failed for", c.filename, e);
      }
      setProgress((i + 1) / chosen.length);
    }
    const { kept } = collapseBatch(rows.map((r) => ({ ...r, lngLat: [r.lng, r.lat] as LngLat })));
    const keptIds = new Set(kept.map((k) => k.id));
    const finalRows = rows.filter((r) => keptIds.has(r.id));
    // Photos were written before the batch collapse ran; the ones it dropped are
    // referenced by nothing, so they would sit in the documents folder forever.
    for (const c of created) {
      if (keptIds.has(c.id)) continue;
      deleteIfExists(c.photoUri);
      deleteIfExists(c.thumbUri);
    }
    const end = endedAt ?? Date.now();
    getStore().addMany(finalRows, {
      walk: {
        id: walk.id,
        walker: session.name,
        startedAt: walk.startedAt,
        endedAt: new Date(end).toISOString(),
        trail,
        photosImported: chosen.length,
        reports: finalRows.length,
        miles: Math.round(miles * 100) / 100,
      },
    });
    clearWalk();
    setWalk(null);
    setSubmitted({ count: finalRows.length, miles });
    setPhase("done");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (getPrefs().saveToPhotos) {
      (async () => {
        for (const r of created) {
          if (!keptIds.has(r.id)) continue;
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

  function discard() {
    Alert.alert("Discard this walk?", "The trail is deleted. Photos stay in your camera roll.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: async () => {
          await stopWalk();
          clearWalk();
          setWalk(null);
          setCandidates([]);
          setTrail([]);
          setPhase("idle");
        },
      },
    ]);
  }

  /* ---------------- render ---------------- */

  if (phase === "idle") {
    return (
      <Screen>
        <Stack gap={SP.lg}>
          <View>
            <H1>Glasses Walk.</H1>
            <P soft>The glasses shoot; the phone in your pocket keeps the GPS trail. Every photo lands on the map where you stood.</P>
          </View>
          <Card>
            <H2>How it works</H2>
            <Stack gap={6}>
              <P>1. Start the walk, pocket the phone.</P>
              <P>2. Press the glasses' capture button at every hazard.</P>
              <P>3. End the walk, then open the Meta AI app so the photos import.</P>
              <P>4. The photos appear here, placed on your trail. Confirm each one.</P>
            </Stack>
          </Card>
          <Notice>
            <P>iOS will ask for location "Always". It is only used while a walk is active.</P>
          </Notice>
          <Button title="Start a walk" variant="primary" size="lg" block onPress={() => void begin()} />
          <Small>Works with any camera that lacks GPS, not just glasses.</Small>
        </Stack>
      </Screen>
    );
  }

  if (phase === "walking" && walk) {
    const elapsed = now - new Date(walk.startedAt).getTime();
    return (
      <Screen bottom={<Button title="End the walk and find photos" variant="primary" size="lg" block onPress={() => void end()} />}>
        <Stack gap={SP.lg}>
          <Row justify="space-between">
            <H1>Walking.</H1>
            <Badge tone={walk.background ? "ok" : "warn"}>{walk.background ? "Background trail on" : "Keep app open"}</Badge>
          </Row>
          <Row gap={SP.sm} align="stretch">
            <KPI value={fmtDuration(elapsed)} label={`since ${shortTime(walk.startedAt)}`} />
            <KPI value={miles.toFixed(2)} label="miles" />
            <KPI value={String(trail.length)} label="breadcrumbs" />
            <KPI value={lastAcc != null ? `±${Math.round(lastAcc)}m` : "…"} label="last fix" />
          </Row>
          <TrailMap trail={trail} height={280} />
          {trail.length === 0 ? <Notice tone="warn">No breadcrumbs yet. Step outside; the first fix can take 10 to 30 seconds.</Notice> : null}
          <Card tone="field">
            <P>Snap with the glasses at every hazard. The phone stays in your pocket until the end.</P>
          </Card>
          <Button title="Discard walk" variant="ghost" size="sm" onPress={discard} />
        </Stack>
      </Screen>
    );
  }

  if (phase === "finding" || phase === "importing") {
    return (
      <Screen>
        <Stack gap={SP.lg} style={{ alignItems: "center", paddingTop: SP.xxl }}>
          <ActivityIndicator color={C.olive600} size="large" />
          <H2>{phase === "finding" ? "Finding photos from the walk…" : `Importing… ${Math.round(progress * 100)}%`}</H2>
          <Small style={{ textAlign: "center" }}>{phase === "finding" ? "Looking in your camera roll for pictures taken between the start and the end of the walk." : "Resizing, writing the trail position into each file, and saving to the album."}</Small>
        </Stack>
      </Screen>
    );
  }

  if (phase === "review") {
    const selected = candidates.filter((c) => c.selected).length;
    return (
      <Screen
        bottom={
          <Row gap={SP.sm}>
            <Button title="Discard" variant="danger" onPress={discard} />
            <Button title={`Import ${selected} photo${selected === 1 ? "" : "s"}`} variant="primary" style={{ flex: 1 }} disabled={!selected} onPress={() => void importSelected()} />
          </Row>
        }
      >
        <Stack gap={SP.lg}>
          <View>
            <H1>{candidates.length ? `${candidates.length} photos from the walk.` : "No photos found yet."}</H1>
            <P soft>
              {candidates.length
                ? "Each is placed on the trail by its timestamp. Set the type for each, uncheck anything that is not a hazard."
                : "Open the Meta AI app so the glasses captures import to the camera roll, then search again. Or pick them by hand."}
            </P>
          </View>
          {findNote ? <Notice tone="warn">{findNote}</Notice> : null}
          <Row gap={SP.sm} align="stretch">
            <KPI value={miles.toFixed(2)} label="miles walked" />
            <KPI value={String(trail.length)} label="breadcrumbs" />
            <KPI value={String(candidates.length)} label="photos" />
          </Row>
          <TrailMap trail={trail} height={200} follow={false} points={candidates.filter((c) => c.selected).map((c) => ({ lngLat: [c.lng, c.lat] as LngLat, label: HAZARD_SHORT[c.type], color: C.sevModerate }))} />
          <Row justify="space-between">
            <Row>
              <Button title="Search again" size="sm" onPress={() => void findPhotos(trail, endedAt ?? Date.now())} />
              <Button title="Pick by hand" size="sm" onPress={() => void pickManually()} />
            </Row>
          </Row>
          <Card>
            <Row justify="space-between">
              <View style={{ flex: 1 }}>
                <P>Clock offset {prefs.glassesClockOffsetS}s</P>
                <Small>If every pin sits a little before or after where you stood, shift the glasses' clock.</Small>
              </View>
              <Row gap={4}>
                <Button title="−5" size="sm" onPress={() => nudgeOffset(-5)} />
                <Button title="+5" size="sm" onPress={() => nudgeOffset(5)} />
              </Row>
            </Row>
          </Card>
          {candidates.length === 0 ? (
            <Empty title="Nothing in the window." body="Photos need a creation time inside the walk (± 3 minutes)." />
          ) : (
            candidates.map((c) => (
              <Card key={c.assetId} style={{ opacity: c.selected ? 1 : 0.6 }}>
                <Row align="flex-start">
                  <Image source={{ uri: c.uri }} style={{ width: 88, height: 88, borderRadius: R.md, backgroundColor: C.field3 }} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Row justify="space-between">
                      <Row gap={6}>
                        <Switch value={c.selected} onValueChange={(v) => setCandidates((cs) => cs.map((x) => (x.assetId === c.assetId ? { ...x, selected: v } : x)))} trackColor={{ true: C.olive600 }} />
                        <Text style={{ fontWeight: "700", color: C.ink }}>{shortTime(c.takenAt)}</Text>
                      </Row>
                      <SevBadge s={c.severity} />
                    </Row>
                    <Small>{placementNote(c)}</Small>
                    {c.dupOf ? <Small style={{ color: C.sevModerate }}>Near {c.dupOf} ({c.dupDist} m); will be added to it.</Small> : null}
                  </View>
                </Row>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {HAZARD_ORDER.map((t) => (
                    <Chip
                      key={t}
                      label={HAZARD_SHORT[t]}
                      on={c.type === t}
                      onPress={() => {
                        lastType.current = t;
                        setCandidates((cs) => cs.map((x) => (x.assetId === c.assetId ? { ...x, type: t } : x)));
                      }}
                    />
                  ))}
                </ScrollView>
                <Row gap={6}>
                  {SEVERITY_ORDER.map((s) => (
                    <Chip key={s} label={SEVERITY_LABELS[s]} on={c.severity === s} onPress={() => setCandidates((cs) => cs.map((x) => (x.assetId === c.assetId ? { ...x, severity: s } : x)))} />
                  ))}
                </Row>
              </Card>
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
        <H1>Walk logged.</H1>
        <P soft style={{ textAlign: "center" }}>
          {submitted?.count} reports over {submitted?.miles.toFixed(2)} miles, placed on the trail from your glasses.
        </P>
        <Button title="See the reports" variant="primary" size="lg" block onPress={() => navigation.replace("Reports")} />
        <Button title="Another walk" block onPress={() => setPhase("idle")} />
        <Button title="Home" variant="ghost" block onPress={() => navigation.popToTop()} />
      </Stack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  doneCheck: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.olive600, alignItems: "center", justifyContent: "center" },
});
