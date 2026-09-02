import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { useSyncStatus } from "../data/sync";
import { NW_AUSTIN } from "../data/places";
import { useReports } from "../data/store";
import { photoUrl, supabase, SUPABASE_URL } from "../lib/supabase";
import { C, SP } from "../theme";
import { STATUS_LABELS, type HazardReport, type ReportStatus } from "../types";
import { Notice, Screen, Segmented, Small } from "../ui";

/**
 * The shared map: every report from every reporter, drawn with the same olive
 * ramp and severity colours as the website, via mapbox-gl in a WebView (the
 * public token comes from EXPO_PUBLIC_MAPBOX_TOKEN or the sq_config table, so
 * the unsigned CI build needs no secrets). Reports still uploading from this
 * phone appear immediately, marked as such.
 */

interface MapReport {
  id: string;
  ref: string;
  type: string;
  severity: string;
  status: ReportStatus;
  lng: number;
  lat: number;
  place: string;
  photo: string | null;
  takenAt: string;
  resolvedAt: string | null;
  ticket311: string | null;
  local?: boolean;
}

interface RemoteRow {
  id: string;
  ref: string | null;
  type: string;
  severity: string;
  status: ReportStatus;
  lng: number;
  lat: number;
  place: string;
  thumb_path: string | null;
  photo_path: string | null;
  taken_at: string | null;
  created_at: string;
  resolved_at: string | null;
  ticket_311: string | null;
  duplicate_of: string | null;
  client_id: string | null;
}

type Filter = "all" | "open" | "resolved";

export function MapScreen() {
  const localReports = useReports();
  const sync = useSyncStatus();
  const [remote, setRemote] = useState<MapReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? null);
  const [tokenMissing, setTokenMissing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [ready, setReady] = useState(false);
  const web = useRef<WebView>(null);

  const remoteIds = useRef<Set<string>>(new Set());

  const fetchRemote = useCallback(async () => {
    try {
      const { data, error: err } = await supabase()
        .from("sq_reports")
        .select("id, ref, type, severity, status, lng, lat, place, thumb_path, photo_path, taken_at, created_at, resolved_at, ticket_311, duplicate_of, client_id")
        .order("created_at", { ascending: false })
        .limit(5000);
      if (err) throw new Error(err.message);
      remoteIds.current = new Set((data as RemoteRow[]).map((r) => r.id));
      setRemote(
        (data as RemoteRow[])
          .filter((r) => !r.duplicate_of)
          .map((r) => ({
            id: r.id,
            ref: r.ref ?? "SQ-????",
            type: r.type,
            severity: r.severity,
            status: r.status,
            lng: r.lng,
            lat: r.lat,
            place: r.place,
            photo: photoUrl(r.thumb_path ?? r.photo_path) ?? null,
            takenAt: r.taken_at ?? r.created_at,
            resolvedAt: r.resolved_at,
            ticket311: r.ticket_311,
          })),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // The Mapbox token ships via env or, failing that, the config table — so a
  // token rotation reaches installed builds without a rebuild. A network
  // failure is NOT "token missing": it retries on the next focus.
  const fetchToken = useCallback(async () => {
    const { data, error: err } = await supabase().from("sq_config").select("value").eq("key", "mapbox_public_token").maybeSingle();
    if (err) return; // offline or table not bootstrapped yet — try again later
    if (data?.value) setToken(data.value);
    else setTokenMissing(true);
  }, []);

  useEffect(() => {
    if (!token) void fetchToken();
  }, [token, fetchToken]);

  useEffect(() => {
    void fetchRemote();
  }, [fetchRemote, sync.lastSyncAt]);

  // Tab screens stay mounted; refetch when the person actually looks at the map.
  useFocusEffect(
    useCallback(() => {
      void fetchRemote();
      if (!token && !tokenMissing) void fetchToken();
    }, [fetchRemote, fetchToken, token, tokenMissing]),
  );

  const merged = useMemo(() => {
    const out: MapReport[] = remote ? [...remote] : [];
    // A row synced from this phone but hidden server-side (merged as a
    // duplicate) must still count as "already on the map", so the local
    // fallback pin checks against every remote id, not just visible ones.
    for (const r of localReports) {
      if (r.duplicateOf) continue;
      if (r.remoteId && remoteIds.current.has(r.remoteId)) continue;
      out.push(toLocalMapReport(r));
    }
    return filter === "all" ? out : out.filter((r) => (filter === "resolved" ? r.status === "resolved" : r.status !== "resolved"));
  }, [remote, localReports, filter]);

  const pushData = useCallback(
    (target: WebView | null) => {
      if (!target) return;
      const payload = JSON.stringify({ type: "data", reports: merged });
      target.injectJavaScript(`window.__sq && window.__sq.receive(${JSON.stringify(payload)}); true;`);
    },
    [merged],
  );

  useEffect(() => {
    if (ready) pushData(web.current);
  }, [ready, pushData]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      if (e.nativeEvent.data === "ready") {
        setReady(true);
        pushData(web.current);
      }
    },
    [pushData],
  );

  const html = useMemo(() => (token ? mapHtml(token) : null), [token]);

  if (tokenMissing) {
    return (
      <Screen>
        <Notice tone="warn">
          The map style needs a Mapbox token. Add a `mapbox_public_token` row to sq_config (or build with EXPO_PUBLIC_MAPBOX_TOKEN) and reopen
          this tab.
        </Notice>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.controls}>
        <Segmented
          options={[
            { key: "all", label: "Everything" },
            { key: "open", label: "Needs a fix" },
            { key: "resolved", label: "Fixed" },
          ]}
          value={filter}
          onChange={(k) => setFilter(k)}
        />
        <Small style={{ color: C.inkMute }}>
          {merged.length} report{merged.length === 1 ? "" : "s"}
          {sync.pending > 0 ? ` · ${sync.pending} still uploading from this phone` : ""}
          {error ? " · offline copy" : ""}
        </Small>
      </View>
      {html ? (
        <WebView
          ref={web}
          source={{ html, baseUrl: "https://sidequestatx.local" }}
          style={styles.web}
          onMessage={onMessage}
          originWhitelist={["*"]}
          allowsInlineMediaPlayback
          setSupportMultipleWindows={false}
          bounces={false}
        />
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator color={C.olive600} />
        </View>
      )}
    </Screen>
  );
}

function toLocalMapReport(r: HazardReport): MapReport {
  return {
    id: r.remoteId ?? r.id,
    ref: r.ref,
    type: r.type,
    severity: r.severity,
    status: r.status,
    lng: r.lng,
    lat: r.lat,
    place: r.place,
    photo: null, // local file URIs are not reachable from the WebView
    takenAt: r.createdAt,
    resolvedAt: r.resolvedAt ?? null,
    ticket311: r.ticket311 ?? null,
    local: true,
  };
}

/**
 * Self-contained mapbox-gl page. Same palette as the website's MapExplorer:
 * olive clusters, severity-coloured points, resolved dimmed, beige tint.
 */
function mapHtml(token: string): string {
  const statusLabels = JSON.stringify(STATUS_LABELS);
  const center = JSON.stringify(NW_AUSTIN);
  return `<!doctype html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<link href="https://api.mapbox.com/mapbox-gl-js/v3.8.0/mapbox-gl.css" rel="stylesheet"/>
<script src="https://api.mapbox.com/mapbox-gl-js/v3.8.0/mapbox-gl.js"></script>
<style>
  html, body, #map { margin: 0; height: 100%; background: #ece6d6; }
  * { -webkit-tap-highlight-color: transparent; }
  .mapboxgl-popup-content {
    font-family: -apple-system, system-ui, sans-serif;
    background: #f8f6f0; color: #26281c; border-radius: 12px;
    box-shadow: 0 4px 16px rgba(42,50,32,.22); padding: 10px 12px; max-width: 240px;
  }
  .mapboxgl-popup-close-button { font-size: 18px; color: #7c7f68; padding: 2px 8px; }
  .mapboxgl-popup-tip { border-top-color: #f8f6f0 !important; border-bottom-color: #f8f6f0 !important; }
  .sq-pop img { width: 100%; border-radius: 8px; margin-top: 6px; display: block; }
  .sq-pop .ref { font-family: Menlo, monospace; font-size: 11px; color: #7c7f68; }
  .sq-pop .place { font-weight: 600; font-size: 13.5px; margin: 2px 0; }
  .sq-pop .meta { font-size: 12px; color: #5a5d4a; }
  .sq-pop .status { display: inline-block; font-size: 11.5px; font-weight: 600; border-radius: 999px; padding: 2px 8px; margin-top: 4px; background: #d8d0b8; }
  .sq-pop .status.resolved { background: #d9e8dc; color: #2f7a4a; }
  .sq-pop .status.routed { background: #d8e2ea; color: #3f6a8a; }
  .sq-pop .local { font-size: 11.5px; color: #c28a2d; font-weight: 600; margin-top: 4px; }
</style></head><body><div id="map"></div><script>
  var STATUS = ${statusLabels};
  var PHOTO_PREFIX = ${JSON.stringify(`${SUPABASE_URL}/storage/`)};
  var SEV = { low: "#6b7d3c", moderate: "#c28a2d", severe: "#a8452a" };
  mapboxgl.accessToken = ${JSON.stringify(token)};
  var map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/light-v11",
    center: ${center},
    zoom: 11.6,
    attributionControl: true
  });
  var queued = null, loaded = false, didFit = false, popup = null;

  // The website's beige/olive tint, condensed.
  function tint() {
    var paints = [
      ["land", "background-color", "#ece6d6"],
      ["water", "fill-color", "#c9d3cf"],
      ["landuse", "fill-color", "#e3dcc8"],
      ["road-simple", "line-color", "#f5f2e8"],
      ["road-label-simple", "text-color", "#5a5d4a"],
      ["settlement-subdivision-label", "text-color", "#7c7f68"],
      ["settlement-minor-label", "text-color", "#5a5d4a"],
      ["settlement-major-label", "text-color", "#37412a"]
    ];
    paints.forEach(function (p) {
      try { map.setPaintProperty(p[0], p[1], p[2]); } catch (e) {}
    });
  }

  function fc(reports) {
    return {
      type: "FeatureCollection",
      features: reports.map(function (r) {
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [r.lng, r.lat] },
          properties: r
        };
      })
    };
  }

  function setData(reports) {
    if (!loaded) { queued = reports; return; }
    map.getSource("reports").setData(fc(reports));
    if (!didFit && reports.length) {
      var b = new mapboxgl.LngLatBounds();
      reports.forEach(function (r) { b.extend([r.lng, r.lat]); });
      map.fitBounds(b, { padding: 56, maxZoom: 14.5, duration: 0 });
      didFit = true;
    }
  }

  window.__sq = {
    receive: function (json) {
      var msg = JSON.parse(json);
      if (msg.type === "data") setData(msg.reports);
    }
  };

  map.on("load", function () {
    tint();
    map.addSource("reports", { type: "geojson", data: fc([]), cluster: true, clusterRadius: 44, clusterMaxZoom: 14 });
    map.addLayer({
      id: "clusters", type: "circle", source: "reports", filter: ["has", "point_count"],
      paint: {
        "circle-color": "#5f6f36", "circle-opacity": 0.9,
        "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 30, 26],
        "circle-stroke-width": 3, "circle-stroke-color": "#f5f2e8"
      }
    });
    map.addLayer({
      id: "cluster-count", type: "symbol", source: "reports", filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12, "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"] },
      paint: { "text-color": "#f5f2e8" }
    });
    map.addLayer({
      id: "points", type: "circle", source: "reports", filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ["match", ["get", "severity"], "severe", SEV.severe, "moderate", SEV.moderate, SEV.low],
        "circle-opacity": ["case", ["==", ["get", "status"], "resolved"], 0.45, 0.95],
        "circle-radius": 8,
        "circle-stroke-width": ["case", ["boolean", ["get", "local"], false], 1.5, 2],
        "circle-stroke-color": ["case", ["boolean", ["get", "local"], false], "#c28a2d", "#f5f2e8"]
      }
    });
    map.on("click", "clusters", function (e) {
      var f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
      if (!f) return;
      map.getSource("reports").getClusterExpansionZoom(f.properties.cluster_id, function (err, zoom) {
        if (err || zoom == null) return;
        map.easeTo({ center: f.geometry.coordinates, zoom: zoom + 0.4, duration: 420 });
      });
    });
    map.on("click", "points", function (e) {
      var f = e.features && e.features[0];
      if (!f) return;
      var p = f.properties;
      var cls = p.status === "resolved" ? "resolved" : (p.status === "open" ? "" : "routed");
      // Every free-text field is escaped, and the photo URL must point at our
      // own storage: rows are written by any signed-up reporter, so the popup
      // treats them as untrusted.
      var action = p.status === "resolved"
        ? "Fixed" + (p.resolvedAt ? " " + new Date(p.resolvedAt).toLocaleDateString() : "")
        : (p.ticket311 && p.ticket311 !== "null" ? "311 ticket " + escapeHtml(p.ticket311) : STATUS[p.status]);
      var photoOk = typeof p.photo === "string" && p.photo.indexOf(PHOTO_PREFIX) === 0;
      var html = '<div class="sq-pop">'
        + '<span class="ref">' + escapeHtml(p.ref) + "</span>"
        + '<div class="place">' + escapeHtml(p.place || "Unnamed sidewalk") + "</div>"
        + '<div class="meta">' + escapeHtml(String(p.type).replace(/-/g, " ") + " · " + p.severity) + " · " + new Date(p.takenAt).toLocaleDateString() + "</div>"
        + '<span class="status ' + cls + '">' + action + "</span>"
        + (p.local === true || p.local === "true" ? '<div class="local">On this phone, uploading…</div>' : "")
        + (photoOk ? '<img src="' + escapeHtml(p.photo) + '" alt=""/>' : "")
        + "</div>";
      if (popup) popup.remove();
      popup = new mapboxgl.Popup({ offset: 12 }).setLngLat(f.geometry.coordinates).setHTML(html).addTo(map);
    });
    loaded = true;
    if (queued) setData(queued);
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage("ready");
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
</script></body></html>`;
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: SP.lg, paddingTop: SP.sm, paddingBottom: SP.sm, gap: 6, backgroundColor: C.field },
  web: { flex: 1, backgroundColor: C.field },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
});
