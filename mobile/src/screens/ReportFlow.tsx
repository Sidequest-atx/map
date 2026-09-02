import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useKeepAwake } from "expo-keep-awake";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { classifierAvailable, classifyHazardPhoto, type ClassificationResult } from "../ai/classify";
import { findDuplicates, likelyDuplicate } from "../ai/dedup";
import { GpsHud, cardinal } from "../components/GpsHud";
import { PinPicker } from "../components/Maps";
import { nearestNeighborhood } from "../data/places";
import { getPrefs, useSession } from "../data/session";
import { getStore, useReports } from "../data/store";
import { readBase64 } from "../data/fs";
import type { ExifGeo } from "../lib/exif";
import { uuid } from "../lib/format";
import { fmtCoord, haversine, type LngLat } from "../lib/geo";
import { getOneFix, guessPlace, useLiveGps, type LiveFix } from "../lib/location";
import { processCapture, rewriteExif, saveToAlbum, type StoredPhoto } from "../lib/photos";
import type { ScreenProps } from "../nav";
import { C, R, SEV_COLOR, SP, T } from "../theme";
import { fixPath, HAZARD_LABELS, HAZARD_ORDER, HAZARD_SHORT, SEVERITY_HINT, SEVERITY_LABELS, SEVERITY_ORDER, type CaptureFix, type HazardReport, type HazardType, type Severity } from "../types";
import { Badge, Button, Card, Field, H1, H2, Input, Notice, OptionGrid, P, Row, Screen, Segmented, SevBadge, Small, Stack } from "../ui";

type Step = "capture" | "saving" | "classify" | "locate" | "details" | "done";
const STEP_INDEX: Record<Step, number> = { capture: 0, saving: 0, classify: 1, locate: 2, details: 3, done: 4 };

interface Draft {
  id: string;
  photo: StoredPhoto | null;
  takenAt: Date;
  fix: LiveFix | null;
  headingDeg: number | null;
  /** where the shutter fix put us (for change detection) */
  origin: LngLat | null;
  coords: LngLat;
  method: CaptureFix["method"];
  exifEmbedded: boolean;
}

export function ReportFlowScreen({ navigation }: ScreenProps<"Report">) {
  useKeepAwake();
  const session = useSession();
  const reports = useReports();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("capture");
  const gps = useLiveGps(step === "capture" || step === "locate" || step === "saving");
  const [camPerm, requestCam] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [camReady, setCamReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [ai, setAi] = useState<ClassificationResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [type, setType] = useState<HazardType | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [place, setPlace] = useState("");
  const [placeAuto, setPlaceAuto] = useState<string | null>(null);
  const [neighborhood, setNeighborhood] = useState("Austin");
  const [description, setDescription] = useState("");
  const [dupChoice, setDupChoice] = useState<"new" | "merge">("merge");
  const [submitted, setSubmitted] = useState<HazardReport | null>(null);
  const [albumNote, setAlbumNote] = useState<string | null>(null);

  useEffect(() => {
    if (camPerm && !camPerm.granted && camPerm.canAskAgain) void requestCam();
  }, [camPerm, requestCam]);

  useEffect(() => {
    navigation.setOptions({ title: step === "done" ? "Submitted" : `Report · step ${Math.min(STEP_INDEX[step] + 1, 4)} of 4` });
  }, [navigation, step]);

  /* ---------- capture ---------- */

  const beginWith = useCallback(
    async (srcUri: string, size: { width: number; height: number }, seed: { fix: LiveFix | null; headingDeg: number | null; takenAt: Date; method: CaptureFix["method"]; exifCoords?: LngLat }) => {
      setStep("saving");
      setBusy("Saving with location…");
      setError(null);
      const id = uuid();
      const coords: LngLat = seed.exifCoords ?? (seed.fix ? [seed.fix.lng, seed.fix.lat] : [-97.7985, 30.4505]);
      const geo: ExifGeo | null =
        seed.exifCoords || seed.fix
          ? {
              lat: coords[1],
              lng: coords[0],
              altitudeM: seed.fix?.altitudeM ?? null,
              headingDeg: seed.headingDeg,
              accuracyM: seed.fix?.accuracyM ?? null,
              takenAt: seed.takenAt,
              description: "SideQuest ATX sidewalk hazard photo",
              software: "SideQuest ATX",
              userComment: JSON.stringify({ sq: id, method: seed.method, fixAt: seed.fix?.at ?? null }),
            }
          : null;
      try {
        const photo = await processCapture(srcUri, size, geo, { id });
        setDraft({ id, photo, takenAt: seed.takenAt, fix: seed.fix, headingDeg: seed.headingDeg, origin: geo ? coords : null, coords, method: seed.method, exifEmbedded: Boolean(geo) });
        setAi(null);
        setType(null);
        setSeverity(null);
        setStep("classify");
        if (classifierAvailable()) {
          setAiBusy(true);
          try {
            const b64 = await readBase64(photo.photoUri);
            const res = await classifyHazardPhoto(b64);
            if (res) {
              setAi(res);
              setType(res.label);
              setSeverity(res.severity);
            }
          } catch {
            /* the reporter picks */
          } finally {
            setAiBusy(false);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save that photo.");
        setStep("capture");
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  async function shutter() {
    if (!cam.current || !camReady || busy) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const snap = gps.snapshot();
    const takenAt = new Date();
    try {
      const pic = await cam.current.takePictureAsync({ quality: 0.92, exif: false, shutterSound: false });
      if (!pic) throw new Error("The camera returned nothing.");
      await beginWith(pic.uri, { width: pic.width, height: pic.height }, { fix: snap?.fix ?? null, headingDeg: snap?.headingDeg ?? null, takenAt, method: snap ? "gps-at-shutter" : "manual" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not take the picture.");
    }
  }

  async function pickFromLibrary() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], exif: true, quality: 1, allowsMultipleSelection: false });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    const ex = (a.exif ?? {}) as Record<string, unknown>;
    const gpsBlock = (ex["{GPS}"] as Record<string, unknown> | undefined) ?? ex;
    const latRaw = Number(gpsBlock.GPSLatitude ?? gpsBlock.Latitude);
    const lngRaw = Number(gpsBlock.GPSLongitude ?? gpsBlock.Longitude);
    let exifCoords: LngLat | undefined;
    if (isFinite(latRaw) && isFinite(lngRaw) && (latRaw !== 0 || lngRaw !== 0)) {
      const latRef = String(gpsBlock.GPSLatitudeRef ?? gpsBlock.LatitudeRef ?? "N");
      const lngRef = String(gpsBlock.GPSLongitudeRef ?? gpsBlock.LongitudeRef ?? "W");
      exifCoords = [Math.abs(lngRaw) * (lngRef === "W" ? -1 : 1), Math.abs(latRaw) * (latRef === "S" ? -1 : 1)];
    }
    const dto = ex.DateTimeOriginal as string | undefined;
    let takenAt = new Date();
    if (dto && /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/.test(dto)) {
      const [d, t] = dto.split(" ");
      const [Y, M, D] = d.split(":").map(Number);
      const [h, m, s] = t.split(":").map(Number);
      takenAt = new Date(Y, M - 1, D, h, m, s);
    }
    const fix = exifCoords ? null : gps.snapshot()?.fix ?? (await getOneFix());
    await beginWith(a.uri, { width: a.width, height: a.height }, { fix, headingDeg: null, takenAt, method: exifCoords ? "photo-exif" : "manual", exifCoords });
  }

  /* ---------- locate ---------- */

  const coords = draft?.coords ?? null;
  const dups = useMemo(() => (type && coords ? findDuplicates({ lngLat: coords, type }, reports) : []), [type, coords, reports]);
  const strongDup = likelyDuplicate(dups);

  useEffect(() => {
    if (step !== "locate" || !coords) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const g = await guessPlace(coords);
      if (cancelled) return;
      setPlaceAuto(g.place);
      setNeighborhood(g.neighborhood);
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [step, coords]);

  const setCoords = useCallback((c: LngLat) => {
    setDraft((d) => (d ? { ...d, coords: c } : d));
  }, []);

  const recenterToGps = () => {
    const s = gps.snapshot();
    if (!s) return;
    setDraft((d) => (d ? { ...d, coords: [s.fix.lng, s.fix.lat], fix: s.fix, headingDeg: s.headingDeg ?? d.headingDeg, origin: [s.fix.lng, s.fix.lat], method: "gps-at-shutter" } : d));
  };

  /* ---------- submit ---------- */

  async function submit() {
    if (!session || !draft || !draft.photo || !type || !severity) return;
    setBusy("Writing the record…");
    try {
      const moved = draft.origin ? haversine(draft.origin, draft.coords) > 0.5 : true;
      const method: CaptureFix["method"] = moved ? (draft.method === "photo-exif" ? "pin-adjusted" : draft.origin ? "pin-adjusted" : "manual") : draft.method;
      const fixInfo: CaptureFix = {
        accuracyM: moved ? null : draft.fix?.accuracyM ?? null,
        altitudeM: draft.fix?.altitudeM ?? null,
        headingDeg: draft.headingDeg,
        speedMps: draft.fix?.speedMps ?? null,
        fixAt: draft.fix?.at ?? draft.takenAt.getTime(),
        method,
      };
      if (moved || !draft.exifEmbedded) {
        try {
          await rewriteExif(draft.photo.photoUri, draft.id, {
            lat: draft.coords[1],
            lng: draft.coords[0],
            altitudeM: fixInfo.altitudeM,
            headingDeg: fixInfo.headingDeg,
            accuracyM: fixInfo.accuracyM,
            takenAt: draft.takenAt,
            description: "SideQuest ATX sidewalk hazard photo",
            software: "SideQuest ATX",
            userComment: JSON.stringify({ sq: draft.id, method, fixAt: fixInfo.fixAt }),
          });
        } catch (e) {
          console.warn("[report] exif rewrite failed", e);
        }
      }
      const merge = Boolean(strongDup && dupChoice === "merge");
      const now = new Date().toISOString();
      const created = getStore().add({
        id: draft.id,
        type,
        severity,
        status: "open",
        source: "walk",
        lng: draft.coords[0],
        lat: draft.coords[1],
        place: place.trim() || placeAuto || nearestFallback(draft.coords),
        neighborhood: neighborhood || nearestNeighborhood(draft.coords),
        description: description.trim(),
        photoUri: draft.photo.photoUri,
        thumbUri: draft.photo.thumbUri,
        fix: fixInfo,
        ai: ai ? { label: ai.label, severity: ai.severity, confidence: ai.confidence, model: ai.model } : undefined,
        reporter: session.name,
        duplicateOf: merge && strongDup ? strongDup.report.id : undefined,
        createdAt: draft.takenAt.toISOString(),
        updatedAt: now,
      });
      if (merge && strongDup) getStore().update(strongDup.report.id, { updatedAt: now });
      setSubmitted(created);
      setStep("done");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (getPrefs().saveToPhotos) {
        saveToAlbum(draft.photo.photoUri)
          .then(({ assetId, note }) => {
            if (assetId) getStore().update(created.id, { photoAssetId: assetId });
            setAlbumNote(assetId ? "Saved to the SideQuest ATX album in Photos." : note ?? null);
          })
          .catch((e) => setAlbumNote(e instanceof Error ? e.message : "Could not save to Photos."));
      } else {
        setAlbumNote("Photos save is off in Settings; the photo is kept inside the app.");
      }
    } catch (e) {
      // Without this the button just stops spinning and the reporter has no idea the
      // record was never written.
      const msg = e instanceof Error ? e.message : "Could not write the record.";
      setError(msg);
      Alert.alert("Could not submit", `${msg}

The photo is still in the app's folder; try Submit again.`);
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setDraft(null);
    setAi(null);
    setType(null);
    setSeverity(null);
    setPlace("");
    setPlaceAuto(null);
    setDescription("");
    setDupChoice("merge");
    setSubmitted(null);
    setAlbumNote(null);
    setError(null);
    setStep("capture");
  }

  /* ---------- render ---------- */

  if (step === "capture" || step === "saving") {
    const granted = camPerm?.granted;
    return (
      <View style={styles.camWrap}>
        {granted ? (
          <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="back" mode="picture" onCameraReady={() => setCamReady(true)} animateShutter={false} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", padding: SP.xl, gap: SP.md }]}>
            <Text style={[T.h2, { color: C.inkOnDark, textAlign: "center" }]}>The camera needs permission.</Text>
            <Text style={{ color: C.inkOnDarkSoft, textAlign: "center" }}>Allow camera access, or choose a photo you already took.</Text>
            <Button title="Allow camera" variant="primary" onPress={() => void requestCam()} />
          </View>
        )}
        <View style={[styles.camTop, { paddingTop: SP.sm }]}>
          <GpsHud gps={gps} />
          {gps.error ? <Text style={styles.camWarn}>{gps.error}</Text> : null}
          {error ? <Text style={styles.camWarn}>{error}</Text> : null}
        </View>
        <View style={[styles.camBottom, { paddingBottom: Math.max(insets.bottom, SP.md) }]}>
          <Text style={styles.camHint}>Fill the frame with the hazard. Stay out of the street.</Text>
          <View style={styles.camRow}>
            <Pressable onPress={pickFromLibrary} style={styles.camSide} accessibilityLabel="Choose from Photos">
              <Text style={styles.camSideText}>Photos</Text>
            </Pressable>
            <Pressable onPress={shutter} disabled={!granted || !camReady || Boolean(busy)} style={({ pressed }) => [styles.shutter, pressed ? { transform: [{ scale: 0.94 }] } : null, !camReady ? { opacity: 0.5 } : null]} accessibilityLabel="Take photo">
              {busy ? <ActivityIndicator color={C.olive800} /> : <View style={styles.shutterInner} />}
            </Pressable>
            <Pressable onPress={() => navigation.goBack()} style={styles.camSide} accessibilityLabel="Close">
              <Text style={styles.camSideText}>Close</Text>
            </Pressable>
          </View>
          {busy ? <Text style={styles.camHint}>{busy}</Text> : null}
        </View>
      </View>
    );
  }

  if (step === "done" && submitted) {
    const merged = Boolean(submitted.duplicateOf);
    const target = merged ? getStore().get(submitted.duplicateOf!) : submitted;
    const path = fixPath(submitted.type);
    return (
      <Screen>
        <Stack gap={SP.lg}>
          <View style={{ alignItems: "center", gap: SP.sm, paddingTop: SP.lg }}>
            <View style={styles.doneCheck}>
              <Text style={{ color: C.inkOnDark, fontSize: 30 }}>✓</Text>
            </View>
            <H1>{merged ? "Added to the record." : "It is on the map."}</H1>
            <Badge tone="olive">{target?.ref ?? submitted.ref}</Badge>
            <P soft style={{ textAlign: "center" }}>
              {merged ? "Your photo strengthens an existing report instead of splitting the count." : "On its way to the shared map with the photo and the exact pin."}
            </P>
            {albumNote ? <Small style={{ textAlign: "center" }}>{albumNote}</Small> : null}
          </View>
          <Card>
            <H2>What happens next</H2>
            {path === "landowner" ? (
              <Stack gap={4}>
                <P>1. A moderator prints a door-hanger for the adjacent property.</P>
                <P>2. If nothing changes in two weeks, a volunteer crew visits with loppers.</P>
                <P>3. An after-photo closes it. Before and after go on the map.</P>
              </Stack>
            ) : (
              <Stack gap={4}>
                <P>1. A moderator submits it to Austin 311 and attaches the ticket number.</P>
                <P>2. We track scheduling and publish the days it takes.</P>
                <P>3. Resolution needs an after-photo; the model checks the hazard is gone.</P>
              </Stack>
            )}
          </Card>
          <Stack gap={SP.sm}>
            <Button title="Report another" variant="primary" size="lg" block onPress={reset} />
            <Button title="Open the record" block onPress={() => navigation.replace("ReportDetail", { id: submitted.id })} />
            <Button title="Home" variant="ghost" block onPress={() => navigation.popToTop()} />
          </Stack>
        </Stack>
      </Screen>
    );
  }

  const stepBar = (
    <Row gap={4} style={{ marginBottom: SP.sm }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= STEP_INDEX[step] ? C.olive600 : C.field3 }} />
      ))}
    </Row>
  );

  if (step === "classify" && draft?.photo) {
    return (
      <Screen
        bottom={
          <Row gap={SP.sm}>
            <Button title="Retake" onPress={reset} />
            <Button title="Next: location" variant="primary" style={{ flex: 1 }} disabled={!type || !severity || aiBusy} onPress={() => setStep("locate")} />
          </Row>
        }
      >
        {stepBar}
        <Stack gap={SP.lg}>
          <View>
            <H1>What is it?</H1>
            <P soft>{classifierAvailable() ? "The model suggests. You decide." : "Pick the type and severity. The photo is already saved."}</P>
          </View>
          <View style={styles.preview}>
            <Image source={{ uri: draft.photo.thumbUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <View style={styles.previewMeta}>
              <Text style={styles.previewMetaText}>
                {draft.fix ? `GPS ±${Math.round(draft.fix.accuracyM ?? 0)} m` : draft.method === "photo-exif" ? "Location from the photo's GPS tag" : "No GPS fix at capture"}
                {draft.headingDeg != null ? ` · facing ${cardinal(draft.headingDeg)}` : ""}
              </Text>
            </View>
          </View>
          {classifierAvailable() ? (
            <Card>
              <Row justify="space-between">
                <Row gap={6}>
                  <Badge tone="ai">AI</Badge>
                  <Text style={T.h2}>Suggestion</Text>
                </Row>
                {ai ? <Small>{ai.model}</Small> : null}
              </Row>
              {aiBusy ? (
                <Row gap={SP.sm}>
                  <ActivityIndicator color={C.olive600} />
                  <P soft>Reading the pavement…</P>
                </Row>
              ) : ai ? (
                <Stack gap={6}>
                  <P>
                    Looks like a <Text style={{ fontWeight: "700" }}>{HAZARD_LABELS[ai.label].toLowerCase()}</Text>, <Text style={{ fontWeight: "700" }}>{SEVERITY_LABELS[ai.severity].toLowerCase()}</Text> severity.
                  </P>
                  <Small>
                    {Math.round(ai.confidence * 100)}% confident. {ai.reason}
                  </Small>
                  {ai.alternatives.length ? (
                    <Row>
                      <Small>Or:</Small>
                      {ai.alternatives.map((a) => (
                        <Pressable key={a.label} onPress={() => setType(a.label)}>
                          <Badge tone={type === a.label ? "olive" : "field"}>
                            {HAZARD_SHORT[a.label]} · {Math.round(a.confidence * 100)}%
                          </Badge>
                        </Pressable>
                      ))}
                    </Row>
                  ) : null}
                </Stack>
              ) : (
                <P soft>No suggestion this time. Pick below.</P>
              )}
            </Card>
          ) : null}
          <Field label="Hazard type">
            <OptionGrid options={HAZARD_ORDER.map((t) => ({ key: t, label: HAZARD_LABELS[t] }))} value={type} onChange={setType} />
          </Field>
          <Field label="Severity">
            <OptionGrid columns={1} options={SEVERITY_ORDER.map((s) => ({ key: s, label: SEVERITY_LABELS[s], hint: SEVERITY_HINT[s], dot: SEV_COLOR[s] }))} value={severity} onChange={setSeverity} />
          </Field>
        </Stack>
      </Screen>
    );
  }

  if (step === "locate" && draft && coords) {
    const acc = draft.fix?.accuracyM ?? null;
    const moved = draft.origin ? haversine(draft.origin, coords) : null;
    return (
      <Screen
        bottom={
          <Row gap={SP.sm}>
            <Button title="Back" onPress={() => setStep("classify")} />
            <Button title="Next: details" variant="primary" style={{ flex: 1 }} onPress={() => setStep("details")} />
          </Row>
        }
      >
        {stepBar}
        <Stack gap={SP.lg}>
          <View>
            <H1>Where is it?</H1>
            <P soft>Drag the pin to the exact spot.</P>
          </View>
          <PinPicker coords={coords} accuracyM={moved && moved > 0.5 ? null : acc} onChange={setCoords} heading={draft.headingDeg} style={{ height: 320 }} />
          <Card>
            <Row justify="space-between">
              <Text style={T.h2}>GPS</Text>
              <Button title="Recenter to GPS" size="sm" onPress={recenterToGps} disabled={!gps.best && !gps.fix} />
            </Row>
            <Row gap={SP.md}>
              <Small>{fmtCoord(coords[0], coords[1])}</Small>
              {acc != null ? <Small>±{Math.round(acc)} m at shutter</Small> : null}
              {draft.headingDeg != null ? <Small>facing {cardinal(draft.headingDeg)} {Math.round(draft.headingDeg)}°</Small> : null}
            </Row>
            {moved != null && moved > 0.5 ? <Small style={{ color: C.sevModerate }}>Pin moved {Math.round(moved)} m from where GPS put it. Noted on the record.</Small> : null}
            {draft.method === "manual" && !draft.origin ? <Notice tone="warn">No GPS at capture. Drag the pin yourself, or tap Recenter once GPS locks.</Notice> : null}
            {gps.status === "locked" && gps.best && draft.fix && (gps.best.accuracyM ?? 99) < (draft.fix.accuracyM ?? 99) - 3 && !(moved && moved > 0.5) ? (
              <Small>A better fix is available now (±{Math.round(gps.best.accuracyM ?? 0)} m). Recenter to use it.</Small>
            ) : null}
          </Card>

          {strongDup ? (
            <Notice tone="warn">
              <P>
                <Text style={{ fontWeight: "700" }}>Looks like {strongDup.report.ref}</Text>, {strongDup.distanceM} m away: {HAZARD_SHORT[strongDup.report.type].toLowerCase()} at {strongDup.report.place}.
              </P>
              <SevBadge s={strongDup.report.severity} />
              <Segmented
                options={[
                  { key: "merge", label: "Add my photo to it" },
                  { key: "new", label: "Different spot" },
                ]}
                value={dupChoice}
                onChange={setDupChoice}
              />
            </Notice>
          ) : dups.length ? (
            <Small>
              {dups.length} related report{dups.length > 1 ? "s" : ""} within 40 m ({dups.map((d) => d.report.ref).join(", ")}). Yours will be a new pin.
            </Small>
          ) : null}

          <Field label="Name the spot" hint={placeAuto ? `Suggested: ${placeAuto}` : "Finding the street…"}>
            <Input value={place} onChangeText={setPlace} placeholder={placeAuto ?? "e.g. 1200 block of Mellow Meadow Dr"} autoCapitalize="words" />
          </Field>
        </Stack>
      </Screen>
    );
  }

  if (step === "details" && draft) {
    return (
      <Screen
        bottom={
          <Row gap={SP.sm}>
            <Button title="Back" onPress={() => setStep("locate")} />
            <Button title={strongDup && dupChoice === "merge" ? `Add to ${strongDup.report.ref}` : "Submit report"} variant="primary" size="lg" style={{ flex: 1 }} loading={Boolean(busy)} onPress={() => void submit()} />
          </Row>
        }
      >
        {stepBar}
        <Stack gap={SP.lg}>
          <View>
            <H1>Last details.</H1>
            <P soft>A sentence of context helps whoever fixes it. Optional.</P>
          </View>
          <Field label="What should a repair crew, or a neighbor, know?">
            <Input value={description} onChangeText={setDescription} multiline placeholder="e.g. Two-inch lip mid-block; worst after rain. Older walkers use this route to the bus stop." />
          </Field>
          <Card tone="field">
            <Row gap={6}>
              {type ? <Badge tone="olive">{HAZARD_SHORT[type]}</Badge> : null}
              {severity ? <SevBadge s={severity} /> : null}
            </Row>
            <Small>
              {place.trim() || placeAuto || nearestFallback(draft.coords)} · {neighborhood}
            </Small>
            <Small>
              Submitting as <Text style={{ fontWeight: "700" }}>{session?.name}</Text>. The photo and pin go on the public map with your name.
            </Small>
          </Card>
        </Stack>
      </Screen>
    );
  }

  return (
    <Screen>
      <ActivityIndicator color={C.olive600} />
    </Screen>
  );
}

function nearestFallback(c: LngLat): string {
  return `${nearestNeighborhood(c)}, ${c[1].toFixed(4)}, ${c[0].toFixed(4)}`;
}

const styles = StyleSheet.create({
  camWrap: { flex: 1, backgroundColor: C.black },
  camTop: { position: "absolute", top: 0, left: 0, right: 0, padding: SP.md, gap: 6 },
  camBottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: SP.md, gap: SP.md, backgroundColor: "rgba(0,0,0,0.35)" },
  camRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  camHint: { color: C.inkOnDark, textAlign: "center", fontSize: 13.5 },
  camWarn: { color: "#FFD9D0", fontSize: 13, backgroundColor: "rgba(176,67,42,0.85)", padding: 8, borderRadius: R.sm },
  camSide: { width: 72, height: 44, alignItems: "center", justifyContent: "center", borderRadius: R.pill, backgroundColor: "rgba(255,255,255,0.16)" },
  camSideText: { color: C.inkOnDark, fontWeight: "600" },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: C.white, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.2)" },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: C.white },
  preview: { height: 260, borderRadius: R.lg, overflow: "hidden", backgroundColor: C.field3 },
  previewMeta: { position: "absolute", left: 0, right: 0, bottom: 0, padding: SP.sm, backgroundColor: "rgba(38,40,28,0.6)" },
  previewMetaText: { color: C.inkOnDark, fontSize: 12.5, fontWeight: "600" },
  doneCheck: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.olive600, alignItems: "center", justifyContent: "center" },
});
