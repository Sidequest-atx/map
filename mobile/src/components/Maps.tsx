import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import MapView, { Circle, Marker, Polyline, type Region } from "react-native-maps";
import { NW_AUSTIN } from "../data/places";
import { bboxOf, type LngLat } from "../lib/geo";
import { C, R, SEV_COLOR } from "../theme";
import type { HazardReport, TrailPoint } from "../types";

/** Apple Maps on iOS: no API key, and the OS handles attribution. */

const DEFAULT_REGION: Region = { latitude: NW_AUSTIN[1], longitude: NW_AUSTIN[0], latitudeDelta: 0.06, longitudeDelta: 0.06 };

export function regionAround(c: LngLat, meters = 120): Region {
  const latDelta = (meters / 111_320) * 2;
  const lngDelta = latDelta / Math.cos((c[1] * Math.PI) / 180);
  return { latitude: c[1], longitude: c[0], latitudeDelta: latDelta, longitudeDelta: lngDelta };
}

/** Draggable pin with the GPS accuracy ring. Tap anywhere to move the pin too. */
export function PinPicker({
  coords,
  accuracyM,
  onChange,
  style,
  heading,
}: {
  coords: LngLat;
  accuracyM?: number | null;
  onChange: (c: LngLat) => void;
  style?: StyleProp<ViewStyle>;
  heading?: number | null;
}) {
  const ref = useRef<MapView>(null);
  const initial = useMemo(() => regionAround(coords, 80), []); // eslint-disable-line react-hooks/exhaustive-deps
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    ref.current?.animateToRegion(regionAround(coords, 80), 400);
    // Only recenter when the caller moves the pin programmatically (GPS arrival, "recenter").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords[0], coords[1]]);
  return (
    <View style={[styles.mapWrap, style]}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        initialRegion={initial}
        showsUserLocation
        showsCompass
        showsScale
        pitchEnabled={false}
        rotateEnabled={false}
        mapType="standard"
        onPress={(e) => onChange([e.nativeEvent.coordinate.longitude, e.nativeEvent.coordinate.latitude])}
      >
        {accuracyM != null && accuracyM > 0 && accuracyM < 400 ? (
          <Circle center={{ latitude: coords[1], longitude: coords[0] }} radius={accuracyM} strokeColor="rgba(85,104,58,0.6)" fillColor="rgba(85,104,58,0.12)" strokeWidth={1} />
        ) : null}
        <Marker
          coordinate={{ latitude: coords[1], longitude: coords[0] }}
          draggable
          pinColor={C.olive600}
          onDragEnd={(e) => onChange([e.nativeEvent.coordinate.longitude, e.nativeEvent.coordinate.latitude])}
          title="Hazard"
          description={heading != null ? `Camera faced ${Math.round(heading)}°` : undefined}
        />
      </MapView>
    </View>
  );
}

/** Read-only map of reports, fitted to their extent. */
export function ReportsMap({ reports, style, onPressReport, height = 240 }: { reports: HazardReport[]; style?: StyleProp<ViewStyle>; onPressReport?: (r: HazardReport) => void; height?: number }) {
  const ref = useRef<MapView>(null);
  const pts = useMemo(() => reports.map((r) => [r.lng, r.lat] as LngLat), [reports]);
  useEffect(() => {
    const box = bboxOf(pts);
    if (!box || !ref.current) return;
    if (pts.length === 1) {
      ref.current.animateToRegion(regionAround(pts[0], 200), 300);
      return;
    }
    ref.current.fitToCoordinates(
      pts.map((p) => ({ latitude: p[1], longitude: p[0] })),
      { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: true },
    );
  }, [pts]);
  return (
    <View style={[styles.mapWrap, { height }, style]}>
      <MapView ref={ref} style={StyleSheet.absoluteFill} initialRegion={DEFAULT_REGION} showsUserLocation pitchEnabled={false} rotateEnabled={false}>
        {reports.map((r) => (
          <Marker
            key={r.id}
            coordinate={{ latitude: r.lat, longitude: r.lng }}
            pinColor={r.status === "resolved" ? C.inkMute : SEV_COLOR[r.severity]}
            title={`${r.ref} · ${r.type}`}
            description={r.place}
            onCalloutPress={() => onPressReport?.(r)}
          />
        ))}
      </MapView>
    </View>
  );
}

/** Live breadcrumb trail (drives and walks). */
export function TrailMap({ trail, points, style, height = 180, follow = true }: { trail: TrailPoint[] | LngLat[]; points?: { lngLat: LngLat; label?: string; color?: string }[]; style?: StyleProp<ViewStyle>; height?: number; follow?: boolean }) {
  const ref = useRef<MapView>(null);
  const coords = useMemo(
    () => trail.map((p) => (Array.isArray(p) ? { latitude: p[1], longitude: p[0] } : { latitude: p.lat, longitude: p.lng })),
    [trail],
  );
  const last = coords[coords.length - 1];
  useEffect(() => {
    if (!ref.current) return;
    if (follow && last) ref.current.animateToRegion({ latitude: last.latitude, longitude: last.longitude, latitudeDelta: 0.006, longitudeDelta: 0.006 }, 500);
    else if (!follow && coords.length > 1) ref.current.fitToCoordinates(coords, { edgePadding: { top: 30, right: 30, bottom: 30, left: 30 }, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.latitude, last?.longitude, follow]);
  return (
    <View style={[styles.mapWrap, { height }, style]}>
      <MapView ref={ref} style={StyleSheet.absoluteFill} initialRegion={last ? { ...last, latitudeDelta: 0.006, longitudeDelta: 0.006 } : DEFAULT_REGION} showsUserLocation pitchEnabled={false} rotateEnabled={false}>
        {coords.length > 1 ? <Polyline coordinates={coords} strokeColor={C.olive600} strokeWidth={4} /> : null}
        {points?.map((p, i) => (
          <Marker key={i} coordinate={{ latitude: p.lngLat[1], longitude: p.lngLat[0] }} pinColor={p.color ?? C.sevModerate} title={p.label} />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: { height: 300, borderRadius: R.lg, overflow: "hidden", backgroundColor: C.field3, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
});
