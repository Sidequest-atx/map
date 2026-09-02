import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import React, { useEffect, useState } from "react";
import { Alert, Image, StyleSheet, Text, View } from "react-native";
import { priorityLabel, rankReport } from "../ai/rank";
import { cardinal } from "../components/GpsHud";
import { TrailMap } from "../components/Maps";
import { hasRole, useSession } from "../data/session";
import { getStore, useReport } from "../data/store";
import { sharePhoto } from "../lib/export";
import { shortDateTime, uuid } from "../lib/format";
import { fmtCoord } from "../lib/geo";
import { processCapture, verifyStoredExif } from "../lib/photos";
import type { ScreenProps } from "../nav";
import { C, R, SP, T } from "../theme";
import { fixPath, HAZARD_LABELS, SOURCE_LABELS, STATUS_FLOW, STATUS_LABELS, type ReportStatus } from "../types";
import { Badge, Button, Card, Divider, Field, H2, Input, Mono, Notice, P, Row, Screen, Segmented, SevBadge, Small, Stack, StatusBadge } from "../ui";

export function ReportDetailScreen({ route, navigation }: ScreenProps<"ReportDetail">) {
  const r = useReport(route.params.id);
  const session = useSession();
  const [exifCheck, setExifCheck] = useState<string | null>(null);
  const [ticket, setTicket] = useState(r?.ticket311 ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: r?.ref ?? "Report" });
  }, [navigation, r?.ref]);

  if (!r) {
    return (
      <Screen>
        <Notice tone="warn">This report no longer exists on this phone.</Notice>
      </Screen>
    );
  }
  const rank = rankReport(r);
  const mod = hasRole(session, "moderator");
  const target = r.duplicateOf ? getStore().get(r.duplicateOf) : null;

  async function checkExif() {
    if (!r?.photoUri) return;
    const g = await verifyStoredExif(r.photoUri);
    setExifCheck(g ? `File carries GPS ${fmtCoord(g.lng, g.lat)}${g.takenAt ? ` · taken ${shortDateTime(g.takenAt.getTime())}` : ""}` : "No GPS tag found in the file.");
  }

  function openInMaps() {
    if (!r) return;
    const url = `http://maps.apple.com/?ll=${r.lat},${r.lng}&q=${encodeURIComponent(r.ref)}`;
    void Linking.openURL(url);
  }

  function setStatus(s: ReportStatus) {
    if (!r) return;
    if (s === "resolved") {
      void resolveWithAfterPhoto();
      return;
    }
    const res = getStore().setStatus(r.id, s, { by: session?.name, ticket311: ticket.trim() || undefined });
    if (!res.ok) Alert.alert("Not allowed", res.reason);
  }

  async function resolveWithAfterPhoto() {
    if (!r) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera needed", "An after-photo is required to resolve a report.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.9, exif: false, cameraType: ImagePicker.CameraType.back });
    if (res.canceled || !res.assets[0]) return;
    setBusy(true);
    try {
      const a = res.assets[0];
      const after = await processCapture(
        a.uri,
        { width: a.width, height: a.height },
        { lat: r.lat, lng: r.lng, takenAt: new Date(), description: `SideQuest ATX after-photo for ${r.ref}`, software: "SideQuest ATX" },
        { id: `${r.id}.after` },
      );
      const out = getStore().setStatus(r.id, "resolved", { afterPhotoUri: after.photoUri, by: session?.name, verified: false });
      if (!out.ok) Alert.alert("Not allowed", out.reason);
    } catch (e) {
      Alert.alert("Could not save the after-photo", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!r) return;
    Alert.alert("Delete this report?", r.remoteId ? "It is removed from the shared map too. The copy in the Photos album stays." : "The photo files on this phone go with it. The copy in the Photos album stays.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          getStore().remove(r.id);
          navigation.goBack();
        },
      },
    ]);
  }

  return (
    <Screen>
      <Stack gap={SP.lg}>
        <View style={styles.photo}>{r.photoUri ? <Image source={{ uri: r.photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}</View>
        <Row gap={6}>
          <Badge tone="olive">{r.ref}</Badge>
          <SevBadge s={r.severity} />
          <StatusBadge s={r.status} />
          <Badge>{SOURCE_LABELS[r.source]}</Badge>
          {r.ai ? <Badge tone="ai">AI {Math.round(r.ai.confidence * 100)}%</Badge> : null}
          {r.remoteId ? <Badge tone="ok">On the shared map</Badge> : <Badge tone="warn">Uploading…</Badge>}
        </Row>
        <View>
          <Text style={T.h1}>{HAZARD_LABELS[r.type]}</Text>
          <P soft>
            {r.place} · {r.neighborhood}
          </P>
        </View>
        {target ? <Notice>Recorded as an extra photo of {target.ref}.</Notice> : null}
        {r.description ? <P>{r.description}</P> : null}

        <TrailMap trail={[]} points={[{ lngLat: [r.lng, r.lat], label: r.ref }]} height={170} follow={false} />
        <Card>
          <H2>Location</H2>
          <Mono>{fmtCoord(r.lng, r.lat)}</Mono>
          <Row gap={SP.md}>
            {r.fix?.accuracyM != null ? <Small>GPS ±{Math.round(r.fix.accuracyM)} m</Small> : null}
            {r.fix?.headingDeg != null ? <Small>camera faced {cardinal(r.fix.headingDeg)} {Math.round(r.fix.headingDeg)}°</Small> : null}
            {r.fix ? <Small>{fixLabel(r.fix.method)}</Small> : null}
          </Row>
          <Small>Taken {shortDateTime(r.createdAt)}</Small>
          <Row>
            <Button title="Open in Maps" size="sm" onPress={openInMaps} />
            <Button title="Check GPS tag" size="sm" onPress={() => void checkExif()} />
            {r.photoUri ? <Button title="Share photo" size="sm" onPress={() => void sharePhoto(r.photoUri!, r.ref)} /> : null}
          </Row>
          {exifCheck ? <Small style={{ color: C.olive800 }}>{exifCheck}</Small> : null}
        </Card>

        <Card>
          <Row justify="space-between">
            <H2>Priority {rank.score}</H2>
            <Badge tone={rank.score >= 75 ? "danger" : rank.score >= 55 ? "warn" : "field"}>{priorityLabel(rank.score)}</Badge>
          </Row>
          <Small>Trip risk {rank.risk} · foot traffic {rank.exposure} · waiting {rank.age}</Small>
          {rank.anchors.length ? <Small>Near {rank.anchors.map((a) => `${a.place.name} (${a.distanceM} m)`).join(", ")}</Small> : <Small>No school, transit, senior, or clinic anchor within 600 m.</Small>}
          <Small>Fix path: {fixPath(r.type) === "landowner" ? "adjacent landowner (vegetation)" : "City of Austin"}</Small>
        </Card>

        {r.afterPhotoUri ? (
          <Card>
            <H2>After-photo</H2>
            <View style={[styles.photo, { height: 180 }]}>
              <Image source={{ uri: r.afterPhotoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            </View>
            <Small>
              Resolved {r.resolvedAt ? shortDateTime(r.resolvedAt) : ""} by {r.resolvedBy}. {r.verified ? "Verified." : "Not yet verified."}
            </Small>
          </Card>
        ) : null}

        {mod ? (
          <Card>
            <H2>Moderate</H2>
            <Field label="Status" hint="Resolving opens the camera for the required after-photo.">
              <Segmented options={STATUS_FLOW.map((s) => ({ key: s, label: STATUS_LABELS[s] }))} value={r.status} onChange={setStatus} />
            </Field>
            <Field label="Austin 311 ticket">
              <Row>
                <Input value={ticket} onChangeText={setTicket} placeholder="e.g. 26-00123456" autoCapitalize="characters" style={{ flex: 1 }} />
                <Button title="Save" size="sm" onPress={() => getStore().update(r.id, { ticket311: ticket.trim() || undefined })} />
              </Row>
            </Field>
            <Divider />
            <Button title="Delete report" variant="danger" size="sm" onPress={remove} loading={busy} />
          </Card>
        ) : (
          <Small>Only moderators can change a report's status.</Small>
        )}
      </Stack>
    </Screen>
  );
}

function fixLabel(m: NonNullable<import("../types").CaptureFix["method"]>): string {
  switch (m) {
    case "gps-at-shutter":
      return "GPS locked at the shutter";
    case "pin-adjusted":
      return "pin adjusted by hand";
    case "trail-interpolated":
      return "placed on the walk trail by time";
    case "photo-exif":
      return "from the photo's GPS tag";
    default:
      return "placed by hand";
  }
}

const styles = StyleSheet.create({
  photo: { height: 300, borderRadius: R.lg, overflow: "hidden", backgroundColor: C.field3 },
});
