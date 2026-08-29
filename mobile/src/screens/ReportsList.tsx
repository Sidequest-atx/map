import React, { useMemo, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { rankReport } from "../ai/rank";
import { useReports } from "../data/store";
import { relativeDays } from "../lib/format";
import type { ScreenProps } from "../nav";
import { C, R, SEV_COLOR, SP } from "../theme";
import { HAZARD_SHORT, SOURCE_LABELS, STATUS_LABELS, type HazardReport } from "../types";
import { Button, Chip, Empty, Row } from "../ui";

type Filter = "all" | "open" | "resolved";

export function ReportsListScreen({ navigation }: ScreenProps<"Reports">) {
  const reports = useReports();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>("all");
  const data = useMemo(() => {
    if (filter === "open") return reports.filter((r) => r.status !== "resolved");
    if (filter === "resolved") return reports.filter((r) => r.status === "resolved");
    return reports;
  }, [reports, filter]);

  return (
    <View style={{ flex: 1, backgroundColor: C.field }}>
      <Row style={{ padding: SP.lg, paddingBottom: SP.sm }}>
        <Chip label={`All ${reports.length}`} on={filter === "all"} onPress={() => setFilter("all")} />
        <Chip label="Open" on={filter === "open"} onPress={() => setFilter("open")} />
        <Chip label="Resolved" on={filter === "resolved"} onPress={() => setFilter("resolved")} />
      </Row>
      <FlatList
        data={data}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: SP.lg, paddingTop: SP.sm, gap: SP.sm, paddingBottom: SP.xxl + insets.bottom }}
        renderItem={({ item }) => <ReportRow r={item} onPress={() => navigation.navigate("ReportDetail", { id: item.id })} />}
        ListEmptyComponent={
          <Empty
            title={reports.length ? "Nothing in this filter." : "No reports on this phone yet."}
            body={reports.length ? "Switch the filter above." : "Take the first photo and it shows up here, on the map, and in the SideQuest ATX album."}
            action={reports.length ? undefined : <Button title="Report a hazard" variant="primary" onPress={() => navigation.navigate("Report")} />}
          />
        }
      />
    </View>
  );
}

function ReportRow({ r, onPress }: { r: HazardReport; onPress: () => void }) {
  const rank = rankReport(r).score;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed ? { opacity: 0.85 } : null]} accessibilityRole="button">
      <View style={styles.thumb}>{r.thumbUri ? <Image source={{ uri: r.thumbUri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}</View>
      <View style={{ flex: 1, gap: 3 }}>
        <Row gap={6}>
          <Text style={styles.ref}>{r.ref}</Text>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SEV_COLOR[r.severity] }} />
          <Text style={styles.type}>{HAZARD_SHORT[r.type]}</Text>
          {r.duplicateOf ? <Text style={styles.meta}>· dup</Text> : null}
        </Row>
        <Text style={styles.place} numberOfLines={1}>
          {r.place}
        </Text>
        <Text style={styles.meta}>
          {STATUS_LABELS[r.status]} · {SOURCE_LABELS[r.source]} · {relativeDays(r.createdAt)} · priority {rank}
        </Text>
      </View>
      <Text style={{ color: C.inkMute, fontSize: 18 }}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: SP.md, backgroundColor: C.surface, borderRadius: R.lg, padding: SP.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  thumb: { width: 64, height: 64, borderRadius: R.md, backgroundColor: C.field3, overflow: "hidden" },
  ref: { fontWeight: "700", color: C.ink, fontVariant: ["tabular-nums"] },
  type: { color: C.ink, fontWeight: "600" },
  place: { color: C.inkSoft, fontSize: 13.5 },
  meta: { color: C.inkMute, fontSize: 12 },
});
