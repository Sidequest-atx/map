import * as Application from "expo-application";
import Constants from "expo-constants";
import React, { useEffect, useState } from "react";
import { Alert, Switch, Text, View } from "react-native";
import { classifierName } from "../ai/classify";
import { photosDirStats } from "../data/fs";
import { setPrefs, signOut, usePrefs, useSession } from "../data/session";
import { useReports } from "../data/store";
import { shareCsv, shareGeoJSON } from "../lib/export";
import { ALBUM_NAME } from "../lib/photos";
import type { ScreenProps } from "../nav";
import { C, SP } from "../theme";
import { ROLE_LABELS } from "../types";
import { Button, Card, Divider, H2, P, Row, Screen, Segmented, Small, Stack } from "../ui";

export function SettingsScreen(_: ScreenProps<"Settings">) {
  const session = useSession();
  const prefs = usePrefs();
  const reports = useReports();
  const [stats, setStats] = useState({ files: 0, bytes: 0 });
  useEffect(() => {
    setStats(photosDirStats());
  }, [reports.length]);

  const version = `${Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "?"} (${Application.nativeBuildVersion ?? "dev"})`;

  async function guard(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      Alert.alert("Export failed", e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Screen>
      <Stack gap={SP.lg}>
        <Card>
          <H2>Signed in</H2>
          <P>
            {session?.name} · {session ? ROLE_LABELS[session.role] : ""}
          </P>
          <Button title="Sign out" size="sm" onPress={() => Alert.alert("Sign out?", "Reports stay on this phone.", [{ text: "Cancel", style: "cancel" }, { text: "Sign out", style: "destructive", onPress: signOut }])} />
        </Card>

        <Card>
          <H2>Capture</H2>
          <Row justify="space-between">
            <View style={{ flex: 1 }}>
              <P>Also save to Photos</P>
              <Small>Adds each hazard photo, with its GPS tag, to the "{ALBUM_NAME}" album.</Small>
            </View>
            <Switch value={prefs.saveToPhotos} onValueChange={(v) => setPrefs({ saveToPhotos: v })} trackColor={{ true: C.olive600 }} />
          </Row>
          <Divider />
          <P>Quest Drive auto-capture</P>
          <Segmented
            options={[
              { key: "0", label: "Tap only" },
              { key: "5", label: "Every 5 s" },
              { key: "10", label: "Every 10 s" },
            ]}
            value={String(prefs.driveIntervalS) as "0" | "5" | "10"}
            onChange={(k) => setPrefs({ driveIntervalS: Number(k) as 0 | 5 | 10 })}
          />
          <Divider />
          <Row justify="space-between">
            <View style={{ flex: 1 }}>
              <P>Glasses clock offset</P>
              <Small>Seconds added to a glasses photo's timestamp before matching it to the trail. Leave at 0 unless pins land consistently early or late.</Small>
            </View>
            <Row gap={4}>
              <Button title="−5" size="sm" onPress={() => setPrefs({ glassesClockOffsetS: prefs.glassesClockOffsetS - 5 })} />
              <Text style={{ minWidth: 44, textAlign: "center", fontWeight: "700", fontVariant: ["tabular-nums"] }}>{prefs.glassesClockOffsetS}s</Text>
              <Button title="+5" size="sm" onPress={() => setPrefs({ glassesClockOffsetS: prefs.glassesClockOffsetS + 5 })} />
            </Row>
          </Row>
        </Card>

        <Card>
          <H2>Export</H2>
          <Small>
            {reports.length} reports · {stats.files} photo files · {(stats.bytes / 1_048_576).toFixed(1)} MB on this phone. Exports carry the pin, type, severity, GPS accuracy, and the photo filename; photos travel via the Photos album or per-report Share.
          </Small>
          <Row>
            <Button title="Share GeoJSON" variant="primary" size="sm" onPress={() => void guard(() => shareGeoJSON(reports))} disabled={!reports.length} />
            <Button title="Share CSV" size="sm" onPress={() => void guard(() => shareCsv(reports))} disabled={!reports.length} />
          </Row>
        </Card>

        <Card>
          <H2>About this build</H2>
          <Small>Version {version}</Small>
          <Small>Vision model: {classifierName()}. Set EXPO_PUBLIC_AI_ENDPOINT at build time to add one; the app records the model name on every report.</Small>
          <Small>Map: Apple Maps. Location: precise, only while capturing, plus Always during a Glasses Walk (the OS shows a blue indicator).</Small>
          <Small>Data stays on this phone until you export it. Photos of the public right-of-way only; no faces, plates, or house numbers get published.</Small>
        </Card>
      </Stack>
    </Screen>
  );
}
