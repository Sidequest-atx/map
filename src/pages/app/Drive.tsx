import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useNavigate } from "react-router-dom";
import { classifyHazardPhoto, type ClassificationResult } from "../../ai/classify";
import { collapseBatch, findDuplicates, likelyDuplicate } from "../../ai/dedup";
import { SevBadge } from "../../components/Bits";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Car, Check, Locate, Warn } from "../../components/Icons";
import { toast } from "../../components/Toast";
import { PLACES } from "../../data/places";
import { DRIVE_ROUTES } from "../../data/seed";
import { useSession } from "../../data/session";
import { getStore } from "../../data/store";
import { haversine, pointAlong, trailMiles, type LngLat } from "../../lib/geo";
import { MAP_STYLE, MAPBOX_TOKEN, mapboxgl, OLIVE_HEX, tintMap } from "../../lib/mapbox";
import { drawSimFrame, pickDefect } from "../../lib/simscene";
import { HAZARD_LABELS, type HazardReport, type HazardType, type Severity } from "../../types";

type Phase = "idle" | "capturing" | "processing" | "review" | "done";
type Mode = "camera" | "sim";

interface Frame {
  id: string;
  photo: string;
  lngLat: LngLat;
  at: string;
  ai?: ClassificationResult;
  type?: HazardType;
  severity?: Severity;
  accepted?: boolean;
  dupOf?: string;
  dupDist?: number;
}

const QUEUE_KEY = "sidequest-atx:drive-queue:v1";
const SIM_ROUTE = DRIVE_ROUTES["drive-anderson-mill"];
const SIM_DURATION_S = 150; // the sim covers the loop in 2.5 minutes

function loadQueue(): { frames: Frame[]; trail: LngLat[]; startedAt: string } | null {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveQueue(q: { frames: Frame[]; trail: LngLat[]; startedAt: string } | null) {
  try {
    if (q) localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    else localStorage.removeItem(QUEUE_KEY);
  } catch {
    /* quota: the in-memory queue still works this session */
  }
}

export default function Drive() {
  const session = useSession();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<Mode | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [gpsState, setGpsState] = useState<"pending" | "ok" | "denied">("pending");
  const [interval, setIntervalS] = useState<0 | 5 | 10>(5);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [trail, setTrail] = useState<LngLat[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resumable, setResumable] = useState(() => loadQueue());
  const [submitted, setSubmitted] = useState<{ count: number; miles: number; id: string } | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const video = useRef<HTMLVideoElement>(null);
  const simCanvas = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const posRef = useRef<LngLat | null>(null);
  const watchRef = useRef<number | null>(null);
  const simStart = useRef<number>(0);
  const simTimer = useRef<number | null>(null);
  const captureTimer = useRef<number | null>(null);
  const frameCount = useRef(0);

  const active = phase === "capturing";
  const dirty = frames.length > 0 && phase !== "done";

  // Block in-app navigation while a drive is in progress or unsubmitted.
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state === "blocked") setLeaveOpen(true);
  }, [blocker.state]);
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  // Persist queue
  useEffect(() => {
    if (phase === "done" || (!frames.length && !trail.length)) return;
    saveQueue({ frames, trail, startedAt: startedAt ?? new Date().toISOString() });
  }, [frames, trail, startedAt, phase]);

  const stopHardware = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (watchRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    if (simTimer.current) window.clearInterval(simTimer.current);
    simTimer.current = null;
    if (captureTimer.current) window.clearInterval(captureTimer.current);
    captureTimer.current = null;
  }, []);
  useEffect(() => stopHardware, [stopHardware]);

  async function startCamera() {
    setCamError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError("This browser cannot open the camera. Use the simulated drive, or open the app on a phone.");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      streamRef.current = stream;
      if (video.current) {
        video.current.srcObject = stream;
        await video.current.play().catch(() => undefined);
      }
      return true;
    } catch (e) {
      const name = (e as DOMException).name;
      setCamError(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow it in the browser's site settings, or run a simulated drive."
          : "Could not start the camera. You can run a simulated drive instead.",
      );
      return false;
    }
  }

  function startGps() {
    if (!navigator.geolocation) {
      setGpsState("denied");
      return;
    }
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const pt: LngLat = [p.coords.longitude, p.coords.latitude];
        posRef.current = pt;
        setGpsState("ok");
        setTrail((t) => (t.length && haversine(t[t.length - 1], pt) < 4 ? t : [...t, pt]));
      },
      () => setGpsState("denied"),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 },
    );
  }

  function startSim() {
    simStart.current = performance.now();
    const tick = () => {
      const t = ((performance.now() - simStart.current) / 1000 / SIM_DURATION_S) % 1;
      const pt = pointAlong(SIM_ROUTE, t);
      posRef.current = pt;
      setTrail((tr) => (tr.length && haversine(tr[tr.length - 1], pt) < 8 ? tr : [...tr, pt]));
      if (simCanvas.current) drawSimFrame(simCanvas.current, pickDefect(frameCount.current), t * 40);
    };
    setGpsState("ok");
    simTimer.current = window.setInterval(tick, 120);
  }

  const capture = useCallback(() => {
    const src: HTMLVideoElement | HTMLCanvasElement | null = mode === "camera" ? video.current : simCanvas.current;
    if (!src) return;
    const w = mode === "camera" ? (src as HTMLVideoElement).videoWidth : src.width;
    const h = mode === "camera" ? (src as HTMLVideoElement).videoHeight : src.height;
    if (!w || !h) return;
    const scale = Math.min(1, 720 / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const photo = c.toDataURL("image/jpeg", 0.7);
    const pos = posRef.current ?? SIM_ROUTE[0];
    frameCount.current += 1;
    setFrames((f) => [...f, { id: crypto.randomUUID(), photo, lngLat: pos, at: new Date().toISOString() }]);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 280);
    if (navigator.vibrate) navigator.vibrate(12);
  }, [mode]);

  // Interval capture
  useEffect(() => {
    if (captureTimer.current) window.clearInterval(captureTimer.current);
    captureTimer.current = null;
    if (active && interval > 0) {
      captureTimer.current = window.setInterval(capture, interval * 1000);
    }
    return () => {
      if (captureTimer.current) window.clearInterval(captureTimer.current);
    };
  }, [active, interval, capture]);

  async function begin(m: Mode) {
    setMode(m);
    setResumable(null);
    saveQueue(null);
    setFrames([]);
    setTrail([]);
    frameCount.current = 0;
    const now = new Date().toISOString();
    setStartedAt(now);
    setPhase("capturing");
    if (m === "camera") {
      const ok = await startCamera();
      if (!ok) {
        setPhase("idle");
        setMode(null);
        return;
      }
      startGps();
    } else {
      startSim();
    }
  }

  function resume() {
    const q = loadQueue();
    if (!q) return;
    setFrames(q.frames);
    setTrail(q.trail);
    setStartedAt(q.startedAt);
    setResumable(null);
    setMode("sim");
    setPhase(q.frames.some((f) => f.ai) ? "review" : "processing");
    if (!q.frames.some((f) => f.ai)) void process(q.frames);
  }

  async function stop() {
    stopHardware();
    if (!frames.length) {
      setPhase("idle");
      setMode(null);
      saveQueue(null);
      toast("No frames captured. Nothing to review.");
      return;
    }
    setPhase("processing");
    await process(frames);
  }

  async function process(input: Frame[]) {
    setProgress(0);
    const out: Frame[] = [];
    for (let i = 0; i < input.length; i++) {
      const f = input[i];
      let ai = f.ai;
      if (!ai) {
        try {
          ai = await classifyHazardPhoto(f.photo);
        } catch {
          ai = undefined;
        }
      }
      out.push({ ...f, ai, type: f.type ?? ai?.label ?? "other", severity: f.severity ?? ai?.severity ?? "low" });
      setProgress((i + 1) / input.length);
    }
    // Drop "nothing here" frames: low confidence + low severity "other" reads.
    const candidates = out.filter((f) => !(f.type === "other" && (f.ai?.confidence ?? 0) < 0.6));
    const typed = candidates.map((f) => ({ ...f, type: f.type as HazardType }));
    const { kept, dropped } = collapseBatch(typed);
    const existing = getStore().list();
    const reviewed: Frame[] = kept.map((f) => {
      const m = likelyDuplicate(findDuplicates({ lngLat: f.lngLat, type: f.type }, existing));
      return { ...f, accepted: !m, dupOf: m?.report.ref, dupDist: m?.distanceM };
    });
    setFrames(reviewed);
    setPhase("review");
    if (dropped.length || out.length !== candidates.length) {
      toast(`${dropped.length} near-duplicate frames merged · ${out.length - candidates.length} empty frames skipped`);
    }
  }

  function submitAll() {
    if (!session) return;
    const accepted = frames.filter((f) => f.accepted);
    if (!accepted.length) {
      toast("Nothing accepted. Reject all, or accept at least one frame.", "danger");
      return;
    }
    const driveId = crypto.randomUUID();
    const now = new Date().toISOString();
    const miles = trailMiles(trail);
    const rows: Omit<HazardReport, "ref">[] = accepted.map((f) => ({
      id: f.id,
      type: f.type ?? "other",
      severity: f.severity ?? "low",
      status: "open",
      source: "drive",
      lng: f.lngLat[0],
      lat: f.lngLat[1],
      place: nearestPlaceName(f.lngLat),
      neighborhood: nearestNeighborhood(f.lngLat),
      description: f.ai ? `Captured on a Quest Drive. ${f.ai.reason}` : "Captured on a Quest Drive.",
      photo: f.photo,
      ai: f.ai ? { label: f.ai.label, severity: f.ai.severity, confidence: f.ai.confidence, model: f.ai.model } : undefined,
      reporter: session.name,
      driveId,
      createdAt: f.at,
      updatedAt: now,
    }));
    getStore().addMany(rows, {
      id: driveId,
      captain: session.name,
      startedAt: startedAt ?? now,
      endedAt: now,
      trail,
      frames: frameCount.current || frames.length,
      reports: rows.length,
      miles: Math.round(miles * 100) / 100,
    });
    saveQueue(null);
    setSubmitted({ count: rows.length, miles, id: driveId });
    setPhase("done");
    toast(`${rows.length} reports added from this drive`, "ok");
  }

  function discardAll() {
    stopHardware();
    saveQueue(null);
    setFrames([]);
    setTrail([]);
    setPhase("idle");
    setMode(null);
    setSubmitted(null);
  }

  const miles = useMemo(() => trailMiles(trail), [trail]);
  const acceptedCount = frames.filter((f) => f.accepted).length;

  /* ---------------- Render ---------------- */

  return (
    <div className="drive">
      <ConfirmDialog
        open={leaveOpen}
        title="Leave this drive?"
        confirmLabel="Keep it and leave"
        cancelLabel="Stay"
        onCancel={() => {
          setLeaveOpen(false);
          blocker.reset?.();
        }}
        onConfirm={() => {
          // Queue is already persisted; hardware stops; user can resume later.
          stopHardware();
          setLeaveOpen(false);
          blocker.proceed?.();
        }}
      >
        <p className="muted">
          {frames.length} frame{frames.length === 1 ? "" : "s"} are saved on this device. You can come back and finish the review any time from this screen.
        </p>
      </ConfirmDialog>

      {phase === "idle" && (
        <>
          <div>
            <h1>Quest Drive.</h1>
            <p className="muted">
              One person drives. You capture from the passenger seat. Frames are classified and deduplicated after you stop, then you review every one
              before anything reaches the map.
            </p>
          </div>

          {resumable && resumable.frames.length > 0 && (
            <div className="notice notice--warn">
              <div className="stack" style={{ gap: ".5rem" }}>
                <div>
                  <b>Unfinished drive on this device:</b> {resumable.frames.length} frames from {new Date(resumable.startedAt).toLocaleString()}.
                </div>
                <div className="btn-row">
                  <button className="btn btn--sm btn--primary" onClick={resume}>
                    Resume review
                  </button>
                  <button
                    className="btn btn--sm"
                    onClick={() => {
                      saveQueue(null);
                      setResumable(null);
                    }}
                  >
                    Discard
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="notice">
            <Warn style={{ width: 20, height: 20, flex: "none" }} />
            <div>
              <b>Passenger only.</b> The driver drives. Keep speed under 25 mph on residential streets for usable frames.
            </div>
          </div>

          <div className="quest-actions">
            <button className="quest-action" onClick={() => begin("camera")}>
              <Car />
              <span style={{ textAlign: "left" }}>
                <b>Start with the camera</b>
                <small>Rear camera + GPS trail</small>
              </span>
              <Check className="arrow" />
            </button>
            <button className="quest-action quest-action--secondary" onClick={() => begin("sim")}>
              <Locate />
              <span style={{ textAlign: "left" }}>
                <b>Run a simulated drive</b>
                <small>Anderson Mill Rd loop, generated frames. For demos and desktops.</small>
              </span>
              <Check className="arrow" />
            </button>
          </div>
          {camError && (
            <div className="notice notice--danger" role="alert">
              <div>{camError}</div>
            </div>
          )}
          <p className="small muted">
            Drive-captured reports are marked on the map and get confirmed on foot before 311 submission when needed.{" "}
            <Link to="/how" viewTransition>
              How roles work
            </Link>
            .
          </p>
        </>
      )}

      {(phase === "capturing" || phase === "processing") && (
        <>
          <div className="viewfinder">
            {mode === "camera" ? <video ref={video} playsInline muted autoPlay /> : <canvas ref={simCanvas} width={720} height={960} />}
            <div className={`hud-flash ${flash ? "is-on" : ""}`} aria-hidden />
            <div className="hud">
              <div className="hud-top">
                <span className={`hud-pill ${active ? "rec" : ""}`}>
                  {active ? <i aria-hidden /> : null} {active ? (mode === "sim" ? "Simulated drive" : "Capturing") : "Stopped"}
                </span>
                <span className="hud-pill">{gpsState === "ok" ? `GPS · ${miles.toFixed(2)} mi` : gpsState === "denied" ? "No GPS · pins default to route" : "GPS…"}</span>
              </div>
              <div className="hud-bottom">
                <span className="hud-pill">{frames.length} frames</span>
                <span className="hud-pill">{interval ? `every ${interval}s` : "tap to capture"}</span>
              </div>
            </div>
          </div>

          {phase === "capturing" ? (
            <div className="drive-controls">
              <div className="drive-controls-row" style={{ justifyContent: "space-between" }}>
                <div className="seg" role="radiogroup" aria-label="Capture interval">
                  {([0, 5, 10] as const).map((s) => (
                    <button key={s} role="radio" aria-checked={interval === s} className={interval === s ? "is-on" : ""} onClick={() => setIntervalS(s)}>
                      {s === 0 ? "Tap" : `${s}s`}
                    </button>
                  ))}
                </div>
                <button className="btn btn--danger" onClick={stop}>
                  Stop and review
                </button>
              </div>
              <button className="shutter" onClick={capture} aria-label="Capture frame">
                <i />
              </button>
              {frames.length > 0 && (
                <div className="queue-strip" aria-label="Captured frames">
                  {frames.slice(-12).map((f) => (
                    <img key={f.id} src={f.photo} alt="" />
                  ))}
                </div>
              )}
              <TrailMap trail={trail} />
            </div>
          ) : (
            <div className="stack">
              <div className="ai-card">
                <div className="ai-card-head">
                  <span>
                    <span className="badge badge--ai">AI</span> Classifying {frames.length} frames
                  </span>
                  <span className="mono">{Math.round(progress * 100)}%</span>
                </div>
                <div className="progress">
                  <i style={{ width: `${progress * 100}%` }} />
                </div>
                <p className="reason">Then deduplicating within the batch and against the map. Nothing is posted yet.</p>
              </div>
            </div>
          )}
        </>
      )}

      {phase === "review" && (
        <>
          <div>
            <h1>Review {frames.length} candidates.</h1>
            <p className="muted">
              {acceptedCount} accepted. Frames that match an open report are unchecked by default; accept them to add the photo anyway.
            </p>
          </div>
          <div className="drive-stats">
            <div>
              <b>{miles.toFixed(2)}</b>
              <span>miles covered</span>
            </div>
            <div>
              <b>{frameCount.current || frames.length}</b>
              <span>frames captured</span>
            </div>
            <div>
              <b>{frames.length}</b>
              <span>after dedup</span>
            </div>
          </div>
          <div className="btn-row">
            <button className="btn btn--sm" onClick={() => setFrames((fs) => fs.map((f) => ({ ...f, accepted: true })))}>
              Accept all
            </button>
            <button className="btn btn--sm" onClick={() => setFrames((fs) => fs.map((f) => ({ ...f, accepted: false })))}>
              Reject all
            </button>
          </div>
          {frames.length === 0 ? (
            <div className="empty">
              <h3>No usable frames.</h3>
              <p>Every frame read as empty pavement. Try a slower street or tap-capture at the defects.</p>
              <button className="btn btn--primary btn--sm" onClick={discardAll}>
                Start another drive
              </button>
            </div>
          ) : (
            <ul className="review-list">
              {frames.map((f) => (
                <li key={f.id} className={`review-item ${f.accepted ? "" : "is-rejected"}`}>
                  <img src={f.photo} alt="" />
                  <div className="review-item-body">
                    <div className="review-item-row">
                      <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontWeight: 600, color: "var(--ink)" }}>
                        <input type="checkbox" checked={Boolean(f.accepted)} onChange={(e) => setFrames((fs) => fs.map((x) => (x.id === f.id ? { ...x, accepted: e.target.checked } : x)))} />
                        Accept
                      </label>
                      {f.severity && <SevBadge s={f.severity} />}
                      {f.ai && <span>{Math.round(f.ai.confidence * 100)}%</span>}
                    </div>
                    <select value={f.type} onChange={(e) => setFrames((fs) => fs.map((x) => (x.id === f.id ? { ...x, type: e.target.value as HazardType } : x)))} aria-label="Hazard type">
                      {(Object.keys(HAZARD_LABELS) as HazardType[]).map((t) => (
                        <option key={t} value={t}>
                          {HAZARD_LABELS[t]}
                        </option>
                      ))}
                    </select>
                    <div className="review-item-row">
                      {f.dupOf ? (
                        <span>
                          Matches <b>{f.dupOf}</b> ({f.dupDist} m)
                        </span>
                      ) : (
                        <span>{f.ai?.reason ?? "No model read"}</span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flow-actions">
            <button className="btn btn--danger" onClick={discardAll}>
              Discard drive
            </button>
            <button className="btn btn--primary btn--lg" onClick={submitAll} disabled={!acceptedCount}>
              Submit {acceptedCount} report{acceptedCount === 1 ? "" : "s"}
            </button>
          </div>
        </>
      )}

      {phase === "done" && submitted && (
        <div className="done">
          <div className="done-check" aria-hidden>
            <Check />
          </div>
          <h1>Drive logged.</h1>
          <p className="muted">
            {submitted.count} reports over {submitted.miles.toFixed(2)} miles, marked as Quest Drive captures on the map and counted toward coverage on the data page.
          </p>
          <div className="btn-row" style={{ justifyContent: "center" }}>
            <Link to="/map?src=drive" className="btn btn--primary btn--lg" viewTransition>
              See them on the map
            </Link>
            <button className="btn btn--lg" onClick={discardAll}>
              Another drive
            </button>
            <button className="btn btn--lg btn--ghost" onClick={() => navigate("/app", { viewTransition: true })}>
              Home
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function nearestPlaceName(c: LngLat): string {
  let best = PLACES[0];
  let bd = Infinity;
  for (const p of PLACES) {
    const d = haversine(c, p.lngLat);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return bd < 400 ? `Near ${best.name}` : `${best.neighborhood}, ${c[1].toFixed(4)}, ${c[0].toFixed(4)}`;
}
function nearestNeighborhood(c: LngLat): string {
  let best = PLACES[0];
  let bd = Infinity;
  for (const p of PLACES) {
    const d = haversine(c, p.lngLat);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best.neighborhood;
}

function TrailMap({ trail }: { trail: LngLat[] }) {
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState<mapboxgl.Map | null>(null);

  useEffect(() => {
    const container = node.current;
    if (!container || mapRef.current || !MAPBOX_TOKEN) return;
    let map: mapboxgl.Map | null = null;
    let disposed = false;
    const raf = window.setTimeout(() => {
      if (disposed) return;
      let m: mapboxgl.Map;
      try {
        m = new mapboxgl.Map({ container, style: MAP_STYLE, center: trail[0] ?? SIM_ROUTE[0], zoom: 14, interactive: false, attributionControl: false });
      } catch {
        return;
      }
      map = m;
      m.on("load", () => {
        if (disposed) return;
        tintMap(m);
        m.addSource("trail", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} } });
        m.addLayer({ id: "trail", type: "line", source: "trail", paint: { "line-color": OLIVE_HEX, "line-width": 4, "line-opacity": 0.9 } });
        setReady(m);
      });
      mapRef.current = m;
    });
    return () => {
      disposed = true;
      window.clearTimeout(raf);
      map?.remove();
      mapRef.current = null;
      setReady(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = ready;
    if (!map) return;
    (map.getSource("trail") as mapboxgl.GeoJSONSource | undefined)?.setData({ type: "Feature", geometry: { type: "LineString", coordinates: trail }, properties: {} });
    const last = trail[trail.length - 1];
    if (last) map.easeTo({ center: last, duration: 600 });
  }, [trail, ready]);

  if (!MAPBOX_TOKEN) return null;
  return <div ref={node} className="trail-map" aria-label="GPS trail" />;
}
