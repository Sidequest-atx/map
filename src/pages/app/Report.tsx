import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { classifyHazardPhoto, type ClassificationResult } from "../../ai/classify";
import { findDuplicates, likelyDuplicate, type DuplicateMatch } from "../../ai/dedup";
import { SevBadge } from "../../components/Bits";
import { Camera, Check, Upload } from "../../components/Icons";
import { toast } from "../../components/Toast";
import { PLACES } from "../../data/places";
import { useSession } from "../../data/session";
import { getStore, useReports } from "../../data/store";
import { haversine } from "../../lib/geo";
import { downscalePhoto } from "../../lib/image";
import { MAP_STYLE, MAPBOX_TOKEN, mapboxgl, NW_AUSTIN, OLIVE_HEX, tintMap } from "../../lib/mapbox";
import { fixPath, HAZARD_LABELS, HAZARD_SHORT, SEVERITY_LABELS, type HazardReport, type HazardType, type Severity } from "../../types";

type Step = "photo" | "classify" | "location" | "details" | "done";
const STEPS: Step[] = ["photo", "classify", "location", "details"];

const SEV_HINT: Record<Severity, string> = {
  low: "Cosmetic, under half an inch",
  moderate: "Catches a toe or a wheel",
  severe: "Could put someone on the ground",
};

export default function Report() {
  const session = useSession();
  const reports = useReports();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const step = (params.get("s") as Step) || "photo";
  const prevIdx = useRef(0);
  const idx = STEPS.indexOf(step);
  const back = idx < prevIdx.current;
  useEffect(() => {
    prevIdx.current = idx;
  }, [idx]);

  const [photo, setPhoto] = useState<string | null>(null);
  const [ai, setAi] = useState<ClassificationResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiFailed, setAiFailed] = useState(false);
  const [type, setType] = useState<HazardType | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [coords, setCoords] = useState<[number, number]>(NW_AUSTIN);
  const [located, setLocated] = useState(false);
  const [place, setPlace] = useState("");
  const [description, setDescription] = useState("");
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupChoice, setDupChoice] = useState<"new" | "merge" | null>(null);
  const [submitted, setSubmitted] = useState<HazardReport | null>(null);

  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  const goto = useCallback(
    (s: Step, replace = false) => {
      setParams(
        (p) => {
          if (s === "photo") p.delete("s");
          else p.set("s", s);
          return p;
        },
        { replace },
      );
    },
    [setParams],
  );

  // If someone deep-links to a later step without a photo, send them to the start.
  useEffect(() => {
    if (step !== "photo" && step !== "done" && !photo) goto("photo", true);
    if (step === "done" && !submitted) goto("photo", true);
  }, [step, photo, submitted, goto]);

  async function acceptFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file is not an image.");
      return;
    }
    setError(null);
    try {
      const dataUrl = await downscalePhoto(file);
      setPhoto(dataUrl);
      setAi(null);
      setAiFailed(false);
      setType(null);
      setSeverity(null);
      goto("classify");
      setAiBusy(true);
      try {
        const result = await classifyHazardPhoto(dataUrl);
        setAi(result);
        setType(result.label);
        setSeverity(result.severity);
      } catch {
        setAiFailed(true);
      } finally {
        setAiBusy(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that image.");
    }
  }

  // Geolocate when entering the location step (once).
  useEffect(() => {
    if (step !== "location" || located || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords([pos.coords.longitude, pos.coords.latitude]);
        setLocated(true);
      },
      () => setLocated(true), // denied or failed: keep the default, the map is draggable
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 },
    );
  }, [step, located]);

  const dups: DuplicateMatch[] = useMemo(() => (type ? findDuplicates({ lngLat: coords, type }, reports) : []), [type, coords, reports]);
  const strongDup = likelyDuplicate(dups);
  const nearestPlace = useMemo(() => {
    let best: { name: string; d: number } | null = null;
    for (const p of PLACES) {
      const d = haversine(coords, p.lngLat);
      if (!best || d < best.d) best = { name: p.name, d };
    }
    return best && best.d < 500 ? best : null;
  }, [coords]);

  function submit() {
    if (!session) return;
    const now = new Date().toISOString();
    const merge = strongDup && dupChoice === "merge";
    const neighborhood = nearestNeighborhood(coords);
    const created = getStore().add({
      id: crypto.randomUUID(),
      type: type ?? "other",
      severity: severity ?? "moderate",
      status: "open",
      source: "walk",
      lng: coords[0],
      lat: coords[1],
      place: place.trim() || nearestPlace?.name || "Northwest Austin",
      neighborhood,
      description: description.trim(),
      photo: photo ?? undefined,
      ai: ai ? { label: ai.label, severity: ai.severity, confidence: ai.confidence, model: ai.model } : undefined,
      reporter: session.name,
      duplicateOf: merge ? strongDup.report.id : undefined,
      createdAt: now,
      updatedAt: now,
    });
    if (merge) getStore().update(strongDup.report.id, { updatedAt: now, photo: strongDup.report.photo ?? photo ?? undefined });
    setSubmitted(created);
    goto("done");
    toast(merge ? `Added to ${strongDup.report.ref}` : `${created.ref} is on the map`, "ok");
  }

  function reset() {
    setPhoto(null);
    setAi(null);
    setType(null);
    setSeverity(null);
    setPlace("");
    setDescription("");
    setDupChoice(null);
    setSubmitted(null);
    setError(null);
    goto("photo", true);
  }

  if (step === "done" && submitted) {
    const merged = Boolean(submitted.duplicateOf);
    const target = merged ? getStore().get(submitted.duplicateOf!) : submitted;
    const path = fixPath(submitted.type);
    return (
      <div className="done">
        <div className="done-check" aria-hidden>
          <Check />
        </div>
        <h1>{merged ? "Added to the record." : "It is on the map."}</h1>
        <span className="ref-pill">{target?.ref ?? submitted.ref}</span>
        <p className="muted">
          {merged
            ? "Your photo strengthens an existing report instead of splitting the count."
            : "Public from this second, with your photo, until a second photo proves it is fixed."}
        </p>
        <div className="next-steps">
          <h3>What happens next</h3>
          {path === "landowner" ? (
            <ol>
              <li>A moderator prints a door-hanger for the adjacent property.</li>
              <li>If nothing changes in two weeks, a volunteer crew visits with loppers.</li>
              <li>An after-photo closes it. You will see before and after on the map.</li>
            </ol>
          ) : (
            <ol>
              <li>A moderator submits it to Austin 311 and attaches the ticket number.</li>
              <li>We track scheduling and publish the days it takes.</li>
              <li>Resolution needs an after-photo; the model checks the hazard is gone.</li>
            </ol>
          )}
        </div>
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <Link to={`/map?r=${target?.ref ?? submitted.ref}`} className="btn btn--primary btn--lg" viewTransition>
            See it on the map
          </Link>
          <button className="btn btn--lg" onClick={reset}>
            Report another
          </button>
          <Link to="/app" className="btn btn--lg btn--ghost" viewTransition>
            Home
          </Link>
        </div>
      </div>
    );
  }

  const stepCls = `flow-step ${back ? "flow-step--back" : ""}`;

  return (
    <div className="flow">
      <div className="flow-head">
        <div className="flow-head-row">
          <button className="btn btn--sm btn--ghost" onClick={() => (idx > 0 ? navigate(-1) : navigate("/app", { viewTransition: true }))}>
            ← {idx > 0 ? "Back" : "Home"}
          </button>
          <span className="small muted">
            Step {idx + 1} of {STEPS.length}
          </span>
          {photo ? (
            <button className="btn btn--sm btn--ghost" onClick={reset}>
              Start over
            </button>
          ) : (
            <span />
          )}
        </div>
        <div className="flow-progress" aria-hidden>
          {STEPS.map((s, i) => (
            <i key={s} className={i <= idx ? "is-done" : ""} />
          ))}
        </div>
      </div>

      {step === "photo" && (
        <div className={stepCls} key="photo">
          <h1>Photograph the hazard.</h1>
          <p className="sub">From the sidewalk or the passenger seat, never while driving. One clear frame of the panel is enough.</p>
          <button
            className={`camera-hero ${drag ? "is-drag" : ""}`}
            onClick={() => cameraInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              acceptFile(e.dataTransfer.files[0]);
            }}
          >
            <Camera />
            <b>Open the camera</b>
            <span>Rear camera on a phone · drop an image here on a computer</span>
          </button>
          <button className="btn btn--block" onClick={() => libraryInput.current?.click()}>
            <Upload style={{ width: 18, height: 18 }} /> Choose from your photos instead
          </button>
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => acceptFile(e.target.files?.[0])} />
          <input ref={libraryInput} type="file" accept="image/*" hidden onChange={(e) => acceptFile(e.target.files?.[0])} />
          {error && (
            <div className="notice notice--danger" role="alert">
              {error}
            </div>
          )}
          <p className="small muted">Camera blocked? Use "Choose from your photos"; the browser's site settings can re-enable the camera later.</p>
        </div>
      )}

      {step === "classify" && photo && (
        <div className={stepCls} key="classify">
          <h1>What is it?</h1>
          <p className="sub">The model suggests. You decide. Tap anything that looks wrong.</p>
          <div className="photo-preview">
            <img src={photo} alt="Your hazard photo" />
            <button className="btn btn--sm retake" onClick={() => goto("photo")}>
              Retake
            </button>
          </div>

          <div className="ai-card" aria-live="polite">
            <div className="ai-card-head">
              <span>
                <span className="badge badge--ai">AI</span> Vision read
              </span>
              {ai && <span className="mono">{ai.model}</span>}
            </div>
            {aiBusy ? (
              <div className="scan">
                <div className="ai-card-main">Reading the pavement…</div>
                <div className="scan-bar" />
              </div>
            ) : ai ? (
              <>
                <div className="ai-card-main">
                  Looks like a <b>{HAZARD_LABELS[ai.label].toLowerCase()}</b>, <b>{SEVERITY_LABELS[ai.severity].toLowerCase()}</b> severity.
                </div>
                <div className="confidence" aria-label={`${Math.round(ai.confidence * 100)}% confident`}>
                  <i style={{ transform: `scaleX(${ai.confidence})` }} />
                </div>
                <p className="reason">
                  {Math.round(ai.confidence * 100)}% confident. {ai.reason}
                </p>
                {ai.alternatives.length > 0 && (
                  <div className="chips">
                    <span className="small muted" style={{ alignSelf: "center" }}>
                      Or:
                    </span>
                    {ai.alternatives.map((a) => (
                      <button key={a.label} className={`chip ${type === a.label ? "is-on" : ""}`} onClick={() => setType(a.label)}>
                        {HAZARD_SHORT[a.label]} · {Math.round(a.confidence * 100)}%
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="ai-card-main muted">{aiFailed ? "The classifier is unavailable right now. Pick the type yourself below." : "No read yet."}</div>
            )}
          </div>

          <div className="field">
            <span>Hazard type</span>
            <div className="option-grid" role="group" aria-label="Hazard type">
              {(Object.keys(HAZARD_LABELS) as HazardType[]).map((t) => (
                <button key={t} className={`option ${type === t ? "is-on" : ""}`} onClick={() => setType(t)} aria-pressed={type === t}>
                  {HAZARD_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Severity</span>
            <div className="option-grid" role="group" aria-label="Severity">
              {(Object.keys(SEVERITY_LABELS) as Severity[]).map((s) => (
                <button key={s} className={`option ${severity === s ? "is-on" : ""}`} onClick={() => setSeverity(s)} aria-pressed={severity === s}>
                  <span>
                    <i className={`sev-dot sev-dot--${s}`} /> {SEVERITY_LABELS[s]}
                  </span>
                  <small>{SEV_HINT[s]}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="flow-actions">
            <button className="btn" onClick={() => goto("photo")}>
              Back
            </button>
            <button className="btn btn--primary" disabled={!type || !severity || aiBusy} onClick={() => goto("location")}>
              Next: location
            </button>
          </div>
        </div>
      )}

      {step === "location" && (
        <div className={stepCls} key="location">
          <h1>Where is it?</h1>
          <p className="sub">
            {located ? "Drag the pin to the exact panel." : "Finding you… you can drag the pin meanwhile."}
            {nearestPlace && ` Near ${nearestPlace.name}.`}
          </p>
          <LocationPicker coords={coords} onChange={setCoords} />

          {strongDup ? (
            <div className="notice notice--warn" role="status">
              <div className="stack" style={{ gap: ".5rem" }}>
                <div>
                  <b>Looks like {strongDup.report.ref}</b>, {strongDup.distanceM} m away: {HAZARD_SHORT[strongDup.report.type].toLowerCase()} at{" "}
                  {strongDup.report.place}. <SevBadge s={strongDup.report.severity} />
                </div>
                <div className="seg" role="radiogroup" aria-label="Duplicate handling">
                  <button role="radio" aria-checked={dupChoice !== "new"} className={dupChoice !== "new" ? "is-on" : ""} onClick={() => setDupChoice("merge")}>
                    Add my photo to it
                  </button>
                  <button role="radio" aria-checked={dupChoice === "new"} className={dupChoice === "new" ? "is-on" : ""} onClick={() => setDupChoice("new")}>
                    It is a different spot
                  </button>
                </div>
              </div>
            </div>
          ) : dups.length ? (
            <p className="small muted">
              {dups.length} related report{dups.length > 1 ? "s" : ""} within 40 m ({dups.map((d) => d.report.ref).join(", ")}). Yours will be a new pin.
            </p>
          ) : null}

          <label className="field">
            <span>Describe the spot (street and landmark)</span>
            <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder={nearestPlace ? `e.g. Near ${nearestPlace.name}` : "e.g. Mellow Meadow Dr near Westwood High"} />
          </label>
          <div className="flow-actions">
            <button className="btn" onClick={() => goto("classify")}>
              Back
            </button>
            <button className="btn btn--primary" onClick={() => goto("details")}>
              Next: details
            </button>
          </div>
        </div>
      )}

      {step === "details" && (
        <div className={stepCls} key="details">
          <h1>Last details.</h1>
          <p className="sub">A sentence of context helps whoever fixes it. Optional, but it helps.</p>
          <label className="field">
            <span>What should a repair crew, or a neighbor, know?</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Two-inch lip mid-block; worst after rain. Older walkers use this route to the bus stop."
            />
          </label>
          <div className="notice">
            <div>
              Submitting as <b>{session?.name}</b>. Photo, pin, and type are public; your name shows on the record.
            </div>
          </div>
          <div className="flow-actions">
            <button className="btn" onClick={() => goto("location")}>
              Back
            </button>
            <button className="btn btn--primary btn--lg" onClick={submit}>
              {strongDup && dupChoice !== "new" ? `Add to ${strongDup.report.ref}` : "Submit report"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function nearestNeighborhood(c: [number, number]): string {
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

export function LocationPicker({ coords, onChange, height }: { coords: [number, number]; onChange: (c: [number, number]) => void; height?: number }) {
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = node.current;
    if (!container || mapRef.current || !MAPBOX_TOKEN) return;
    let disposed = false;
    let map: mapboxgl.Map | null = null;
    const raf = window.setTimeout(() => {
    if (disposed) return;
    let m: mapboxgl.Map;
    try {
      m = new mapboxgl.Map({ container, style: MAP_STYLE, center: coords, zoom: 15.5, attributionControl: true });
    } catch {
      setFailed(true);
      return;
    }
    map = m;
    m.on("load", () => tintMap(m));
    m.on("error", (e) => {
      const status = (e as unknown as { error?: { status?: number } }).error?.status;
      if (status === 401 || status === 403) setFailed(true);
    });
    const marker = new mapboxgl.Marker({ draggable: true, color: OLIVE_HEX }).setLngLat(coords).addTo(m);
    marker.on("dragend", () => {
      const p = marker.getLngLat();
      onChangeRef.current([p.lng, p.lat]);
    });
    m.on("click", (e) => {
      marker.setLngLat(e.lngLat);
      onChangeRef.current([e.lngLat.lng, e.lngLat.lat]);
    });
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    const geo = new mapboxgl.GeolocateControl({ trackUserLocation: false });
    geo.on("geolocate", (e) => {
      const { longitude, latitude } = (e as GeolocationPosition).coords;
      marker.setLngLat([longitude, latitude]);
      onChangeRef.current([longitude, latitude]);
    });
    m.addControl(geo, "bottom-right");
    mapRef.current = m;
    markerRef.current = marker;
    });
    return () => {
      disposed = true;
      window.clearTimeout(raf);
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow external coordinate changes (geolocation arriving after mount)
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const cur = marker.getLngLat();
    if (Math.abs(cur.lng - coords[0]) > 1e-6 || Math.abs(cur.lat - coords[1]) > 1e-6) {
      marker.setLngLat(coords);
      map.easeTo({ center: coords, zoom: Math.max(map.getZoom(), 16), duration: 500 });
    }
  }, [coords]);

  if (!MAPBOX_TOKEN || failed) {
    return (
      <div className="notice notice--warn">
        <div>
          <b>Map unavailable.</b> We will use {coords[1].toFixed(5)}, {coords[0].toFixed(5)} (your GPS position if it was granted). You can describe the spot
          below.
        </div>
      </div>
    );
  }
  return (
    <div className="mini-map" style={height ? { height } : undefined}>
      <div ref={node} style={{ position: "absolute", inset: 0 }} />
      <span className="mini-map-hint">Drag the pin or tap the map</span>
    </div>
  );
}
