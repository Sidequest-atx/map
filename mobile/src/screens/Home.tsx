import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ReportsMap } from "../components/Maps";
import { useSession } from "../data/session";
import { useReports, useWalks, useDrives } from "../data/store";
import { getActiveWalk, type ActiveWalk } from "../glasses/trail";
import { hasDriveQueue } from "./driveQueue";
import { fmtInt, shortTime } from "../lib/format";
import type { ScreenProps } from "../nav";
import { C, R, SP, T, shadow1 } from "../theme";
import { Button, KPI, Notice, P, Row, Screen, Small, Stack } from "../ui";

export function HomeScreen({ navigation }: ScreenProps<"Home">) {
  const session = useSession();
  const reports = useReports();
  const walks = useWalks();
  const drives = useDrives();
  const [walk, setWalk] = useState<ActiveWalk | null>(null);
  const [queued, setQueued] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setWalk(getActiveWalk());
      setQueued(hasDriveQueue());
    }, []),
  );

  const stats = useMemo(() => {
    const open = reports.filter((r) => r.status !== "resolved").length;
    const resolved = reports.length - open;
    const miles = walks.reduce((s, w) => s + w.miles, 0) + drives.reduce((s, d) => s + d.miles, 0);
    return { open, resolved, miles };
  }, [reports, walks, drives]);

  return (
    <Screen padded={false}>
      <View style={{ padding: SP.lg, gap: SP.lg }}>
        <Row justify="space-between" align="flex-end">
          <View>
            <Text style={T.display}>SideQuest ATX</Text>
            <Small>{session?.name} · signed in as {session?.role.replace("-", " ")}</Small>
          </View>
          <Pressable onPress={() => navigation.navigate("Settings")} hitSlop={10} accessibilityLabel="Settings" style={styles.gear}>
            <Text style={{ fontSize: 18 }}>⚙︎</Text>
          </Pressable>
        </Row>

        {walk ? (
          <Notice tone="warn">
            <P>
              <Text style={{ fontWeight: "700" }}>Glasses Walk in progress</Text> since {shortTime(walk.startedAt)}.{walk.background ? " Trail records in the background." : " Keep the app open; background location was not granted."}
            </P>
            <Button title="Open the walk" size="sm" onPress={() => navigation.navigate("GlassesWalk")} />
          </Notice>
        ) : null}
        {queued ? (
          <Notice tone="warn">
            <P>
              <Text style={{ fontWeight: "700" }}>Unfinished Quest Drive</Text> saved on this phone.
            </P>
            <Button title="Resume review" size="sm" onPress={() => navigation.navigate("Drive")} />
          </Notice>
        ) : null}

        <ReportsMap reports={reports} height={230} onPressReport={(r) => navigation.navigate("ReportDetail", { id: r.id })} />

        <Row gap={SP.sm} align="stretch">
          <KPI value={fmtInt(reports.length)} label="reports" />
          <KPI value={fmtInt(stats.open)} label="open" />
          <KPI value={fmtInt(stats.resolved)} label="resolved" />
          <KPI value={stats.miles.toFixed(1)} label="miles covered" />
        </Row>

        <Stack gap={SP.sm}>
          <Pressable onPress={() => navigation.navigate("Report")} style={({ pressed }) => [styles.hero, pressed ? { opacity: 0.9, transform: [{ scale: 0.985 }] } : null]} accessibilityRole="button">
            <Text style={styles.heroGlyph}>◉</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Report a hazard</Text>
              <Text style={styles.heroSub}>One photo. The exact spot is pinned for you.</Text>
            </View>
            <Text style={styles.heroArrow}>→</Text>
          </Pressable>
          <Row gap={SP.sm} align="stretch">
            <ActionTile title="Glasses Walk" sub="Shoot with glasses; the phone maps it" onPress={() => navigation.navigate("GlassesWalk")} />
            <ActionTile title="Quest Drive" sub="Cover a whole street from the passenger seat" onPress={() => navigation.navigate("Drive")} />
          </Row>
          <Button title={reports.length ? `All reports (${reports.length})` : "Reports"} onPress={() => navigation.navigate("Reports")} block />
        </Stack>

        {reports.length === 0 ? (
          <Small style={{ color: C.inkMute }}>Nothing here yet. Your first photo becomes report SQ-P0001 and lands on the map.</Small>
        ) : null}
      </View>
    </Screen>
  );
}

function ActionTile({ title, sub, onPress }: { title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, pressed ? { opacity: 0.9 } : null]} accessibilityRole="button">
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.tileSub}>{sub}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gear: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: C.field2 },
  hero: { flexDirection: "row", alignItems: "center", gap: SP.md, backgroundColor: C.olive800, borderRadius: R.lg, padding: SP.lg, ...shadow1 },
  heroGlyph: { color: C.olive200, fontSize: 30 },
  heroTitle: { color: C.inkOnDark, fontSize: 19, fontWeight: "700", letterSpacing: -0.3 },
  heroSub: { color: C.inkOnDarkSoft, fontSize: 13, marginTop: 2 },
  heroArrow: { color: C.inkOnDark, fontSize: 22 },
  tile: { flex: 1, backgroundColor: C.surface, borderRadius: R.lg, padding: SP.md, gap: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, ...shadow1 },
  tileTitle: { fontSize: 15.5, fontWeight: "700", color: C.ink },
  tileSub: { fontSize: 12.5, color: C.inkSoft, lineHeight: 16 },
});
