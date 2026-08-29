import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { LiveGps } from "../lib/location";
import { C, TONE_COLOR, accuracyTone } from "../theme";

/**
 * The little truth panel over the camera: how good the fix is right now,
 * which way the camera faces, and a plain warning when the OS is only giving
 * us coarse location. Shown on every capture surface.
 */
export function GpsHud({ gps, compact }: { gps: LiveGps; compact?: boolean }) {
  const acc = gps.best?.accuracyM ?? gps.fix?.accuracyM ?? null;
  const tone = gps.status === "locked" ? accuracyTone(acc) : "none";
  const color = TONE_COLOR[tone];
  let label: string;
  if (gps.status === "denied") label = "Location off";
  else if (gps.status === "requesting" || gps.status === "idle") label = "GPS…";
  else if (gps.status === "searching") label = "Finding you…";
  else if (acc == null) label = "GPS locked";
  else label = `GPS ±${acc < 1 ? "<1" : Math.round(acc)} m`;
  const age = gps.best ? Math.round((Date.now() - gps.best.at) / 1000) : null;
  return (
    <View style={[styles.wrap, compact ? styles.compact : null]}>
      <View style={styles.pill}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.pillText}>{label}</Text>
        {age != null && age > 15 ? <Text style={[styles.pillText, { color: C.sevModerate }]}> · {age}s old</Text> : null}
      </View>
      {gps.headingDeg != null ? (
        <View style={styles.pill}>
          <Text style={styles.pillText}>{cardinal(gps.headingDeg)} {Math.round(gps.headingDeg)}°</Text>
        </View>
      ) : null}
      {gps.reducedAccuracy ? (
        <View style={[styles.pill, { backgroundColor: "rgba(176,67,42,0.9)" }]}>
          <Text style={styles.pillText}>Precise Location is off: Settings → SideQuest → Location</Text>
        </View>
      ) : null}
    </View>
  );
}

export function cardinal(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  compact: { gap: 4 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(38,40,28,0.72)", paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999 },
  pillText: { color: C.inkOnDark, fontSize: 12.5, fontWeight: "600", fontVariant: ["tabular-nums"] },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
