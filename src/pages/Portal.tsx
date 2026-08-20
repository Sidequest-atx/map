import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { priorityLabel, rankReport } from "../ai/rank";
import { verifyRepair, type VerificationResult } from "../ai/verify";
import { DemoBadge, Lifecycle, SevBadge, SourceBadge, StatusBadge } from "../components/Bits";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Download } from "../components/Icons";
import { toast } from "../components/Toast";
import { NEIGHBORHOODS } from "../data/places";
import { useSession } from "../data/session";
import { getStore, useDrives, useReports } from "../data/store";
import { exportCsv, exportGeoJSON } from "../lib/export";
import { daysBetween, fmtInt, median, relativeDays, shortDate } from "../lib/format";
import { downscalePhoto } from "../lib/image";
import {
  fixPath,
  HAZARD_SHORT,
  STATUS_FLOW,
  STATUS_LABELS,
  type HazardReport,
  type HazardType,
  type ReportStatus,
} from "../types";

type Sort = "priority" | "newest" | "oldest";

export default function Portal() {
  const session = useSession();
  const reports = useReports();
  const drives = useDrives();
  const [status, setStatus] = useState<ReportStatus | "all">("all");
  const [type, setType] = useState<HazardType | "all">("all");
  const [hood, setHood] = useState<string>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("priority");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const ranked = useMemo(() => reports.filter((r) => !r.duplicateOf).map((r) => ({ r, rank: rankReport(r) })), [reports]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = ranked.filter(
      ({ r }) =>
        (status === "all" || r.status === status) &&
        (type === "all" || r.type === type) &&
        (hood === "all" || r.neighborhood === hood) &&
        (!needle || [r.ref, r.place, r.description, r.ticket311 ?? "", r.reporter ?? ""].join(" ").toLowerCase().includes(needle)),
    );
    list.sort((a, b) =>
      sort === "priority"
        ? b.rank.score - a.rank.score || a.r.createdAt.localeCompare(b.r.createdAt)
        : sort === "newest"
          ? b.r.createdAt.localeCompare(a.r.createdAt)
          : a.r.createdAt.localeCompare(b.r.createdAt),
    );
    return list;
  }, [ranked, status, type, hood, q, sort]);

  const kpi = useMemo(() => {
    const live = ranked.map((x) => x.r);
    const open = live.filter((r) => r.status === "open");
    const in311 = live.filter((r) => r.status === "submitted-311" || r.status === "scheduled");
    const resolved = live.filter((r) => r.status === "resolved");
    const veg = live.filter((r) => r.type === "vegetation" && r.status !== "resolved");
    const urgent = ranked.filter((x) => x.r.status !== "resolved" && x.rank.score >= 75).length;
    const unverified = resolved.filter((r) => !r.verified).length;
    const dupCount = reports.filter((r) => r.duplicateOf).length;
    return {
      open: open.length,
      in311: in311.length,
      resolved: resolved.length,
      unverified,
      veg: veg.length,
      urgent,
      dupCount,
      medianOpenAge: median(open.map((r) => daysBetween(r.createdAt))),
      medianCycle: median(resolved.map((r) => daysBetween(r.createdAt, r.resolvedAt ?? r.updatedAt))),
    };
  }, [ranked, reports]);

  const selected = selectedId ? reports.find((r) => r.id === selectedId) ?? null : null;

  return (
    <div className="portal">
      <ConfirmDialog
        open={resetOpen}
        title="Reset to demo data?"
        confirmLabel="Reset"
        danger
        onCancel={() => setResetOpen(false)}
        onConfirm={() => {
          getStore().resetDemo();
          setSelectedId(null);
          setResetOpen(false);
          toast("Demo data restored");
        }}
      >
        <p className="muted">This wipes every report and drive stored on this device and restores the seed set. Only for the prototype.</p>
      </ConfirmDialog>

      <div className="portal-head">
        <div>
          <h1>Operations</h1>
          <p className="muted">
            Signed in as {session?.name}. <DemoBadge />
          </p>
        </div>
        <div className="btn-row">
          <button className="btn btn--sm" onClick={() => exportCsv(reports.filter((r) => !r.duplicateOf))}>
            <Download style={{ width: 16, height: 16 }} /> CSV
          </button>
          <button className="btn btn--sm" onClick={() => exportGeoJSON(reports.filter((r) => !r.duplicateOf))}>
            <Download style={{ width: 16, height: 16 }} /> GeoJSON
          </button>
          <button className="btn btn--sm btn--ghost" onClick={() => setResetOpen(true)}>
            Reset demo
          </button>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <b>{fmtInt(kpi.open)}</b>
          <span>open, not yet routed</span>
          <small>{kpi.medianOpenAge == null ? "" : `median ${kpi.medianOpenAge}d waiting`}</small>
        </div>
        <div className="kpi">
          <b>{fmtInt(kpi.urgent)}</b>
          <span>urgent priority (≥75)</span>
          <small>route these first</small>
        </div>
        <div className="kpi">
          <b>{fmtInt(kpi.veg)}</b>
          <span>vegetation to door-hang</span>
          <small>free fixes</small>
        </div>
        <div className="kpi">
          <b>{fmtInt(kpi.in311)}</b>
          <span>with the city</span>
          <small>submitted or scheduled</small>
        </div>
        <div className="kpi">
          <b>{fmtInt(kpi.resolved)}</b>
          <span>resolved</span>
          <small>{kpi.unverified ? `${kpi.unverified} awaiting verification` : "all verified"}</small>
        </div>
        <div className="kpi">
          <b>{kpi.medianCycle == null ? "–" : `${kpi.medianCycle}d`}</b>
          <span>median days to resolve</span>
          <small>{kpi.dupCount} duplicates merged</small>
        </div>
      </div>

      <div className="toolbar">
        <input className="grow" style={{ minHeight: "2.5rem", padding: ".4rem .7rem", borderRadius: "var(--r-md)", border: "1px solid var(--line-strong)", background: "var(--surface)", minWidth: "12rem" }} placeholder="Search ref, place, ticket, reporter" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search reports" />
        <select value={status} onChange={(e) => setStatus(e.target.value as ReportStatus | "all")} aria-label="Status" style={selStyle}>
          <option value="all">All statuses</option>
          {STATUS_FLOW.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as HazardType | "all")} aria-label="Hazard type" style={selStyle}>
          <option value="all">All types</option>
          {(Object.keys(HAZARD_SHORT) as HazardType[]).map((t) => (
            <option key={t} value={t}>
              {HAZARD_SHORT[t]}
            </option>
          ))}
        </select>
        <select value={hood} onChange={(e) => setHood(e.target.value)} aria-label="Neighborhood" style={selStyle}>
          <option value="all">All neighborhoods</option>
          {NEIGHBORHOODS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <div className="seg" role="radiogroup" aria-label="Sort">
          {(["priority", "newest", "oldest"] as Sort[]).map((s) => (
            <button key={s} role="radio" aria-checked={sort === s} className={sort === s ? "is-on" : ""} onClick={() => setSort(s)}>
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="portal-layout">
        <div className="table-wrap">
          {rows.length === 0 ? (
            <div className="empty" style={{ border: 0 }}>
              <h3>No reports match.</h3>
              <button
                className="btn btn--sm"
                onClick={() => {
                  setStatus("all");
                  setType("all");
                  setHood("all");
                  setQ("");
                }}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Ref</th>
                  <th>Hazard</th>
                  <th>Place</th>
                  <th>Status</th>
                  <th>Age</th>
                  <th>311</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ r, rank }) => (
                  <tr key={r.id} className={selectedId === r.id ? "is-on" : ""} onClick={() => setSelectedId(r.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSelectedId(r.id)}>
                    <td>
                      <span className={`priority is-${priorityLabel(rank.score).toLowerCase()}`}>
                        <i style={{ "--p": `${rank.score}%` } as React.CSSProperties} />
                        <b>{rank.score}</b>
                      </span>
                    </td>
                    <td className="ref">{r.ref}</td>
                    <td>
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <i className={`sev-dot sev-dot--${r.severity}`} /> {HAZARD_SHORT[r.type]}
                      </span>
                    </td>
                    <td className="place">
                      {r.place}
                      <br />
                      <span className="small muted">
                        {r.neighborhood}
                        {r.source === "drive" ? " · drive" : ""}
                      </span>
                    </td>
                    <td>
                      <StatusBadge s={r.status} />
                    </td>
                    <td className="muted">{daysBetween(r.createdAt)}d</td>
                    <td className="ref">{r.ticket311 ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside className="portal-side">
          {selected ? (
            <RowDetail key={selected.id} r={selected} moderator={session?.name ?? "moderator"} onClose={() => setSelectedId(null)} allReports={reports} />
          ) : (
            <div className="stack">
              <div className="empty">
                <h3>Select a report.</h3>
                <p>Route it to 311, print a door-hanger, merge a duplicate, or verify a close-out.</p>
              </div>
              <div className="row-detail">
                <h2>Quest Drives</h2>
                {drives.length ? (
                  <ul className="recent-list">
                    {drives.slice(0, 5).map((d) => (
                      <li key={d.id}>
                        <span className="sev-dot sev-dot--low" />
                        <span>
                          <span className="place">{d.captain}</span>
                          <br />
                          <span className="when">
                            {shortDate(d.startedAt)} · {d.miles.toFixed(1)} mi · {d.frames} frames → {d.reports} reports
                          </span>
                        </span>
                        <Link to="/map?src=drive" className="small" viewTransition>
                          Map
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small">No drives logged yet.</p>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

const selStyle: React.CSSProperties = { minHeight: "2.5rem", padding: ".4rem .7rem", borderRadius: "var(--r-md)", border: "1px solid var(--line-strong)", background: "var(--surface)" };

function RowDetail({ r, moderator, onClose, allReports }: { r: HazardReport; moderator: string; onClose: () => void; allReports: HazardReport[] }) {
  const rank = rankReport(r);
  const idx = STATUS_FLOW.indexOf(r.status);
  const next = STATUS_FLOW[idx + 1];
  const [ticket, setTicket] = useState(r.ticket311 ?? "");
  const [after, setAfter] = useState<string | null>(r.afterPhoto ?? null);
  const [verifying, setVerifying] = useState(false);
  const [verdict, setVerdict] = useState<VerificationResult | null>(null);
  const [mergeRef, setMergeRef] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const path = fixPath(r.type);

  async function onAfterFile(file: File | undefined) {
    if (!file) return;
    try {
      const url = await downscalePhoto(file);
      setAfter(url);
      setVerdict(null);
      setVerifying(true);
      try {
        const v = await verifyRepair(r, url);
        setVerdict(v);
      } catch {
        setVerdict(null);
      } finally {
        setVerifying(false);
      }
    } catch {
      toast("Could not read that image", "danger");
    }
  }

  function advance() {
    if (!next) return;
    if (next === "submitted-311" && path === "city" && !ticket.trim()) {
      toast("Enter the 311 service request number first", "danger");
      return;
    }
    const res = getStore().setStatus(r.id, next, {
      ticket311: ticket.trim() || undefined,
      afterPhoto: after ?? undefined,
      by: moderator,
      verified: next === "resolved" ? Boolean(verdict?.looksFixed) : undefined,
    });
    if (!res.ok) {
      toast(res.reason, "danger");
      return;
    }
    toast(`${r.ref} → ${STATUS_LABELS[next]}`, "ok");
  }

  function resolveVegetation() {
    const res = getStore().setStatus(r.id, "resolved", { afterPhoto: after ?? undefined, by: moderator, verified: Boolean(verdict?.looksFixed) });
    if (!res.ok) toast(res.reason, "danger");
    else toast(`${r.ref} resolved without a city ticket`, "ok");
  }

  function merge() {
    const target = allReports.find((x) => x.ref.toLowerCase() === mergeRef.trim().toLowerCase() && x.id !== r.id && !x.duplicateOf);
    if (!target) {
      toast("No open report with that ref", "danger");
      return;
    }
    getStore().update(r.id, { duplicateOf: target.id });
    toast(`${r.ref} merged into ${target.ref}`, "ok");
    onClose();
  }

  const canResolveNow = Boolean(after);

  return (
    <div className="row-detail">
      <ConfirmDialog
        open={reopenOpen}
        title={`Reopen ${r.ref}?`}
        confirmLabel="Reopen"
        danger
        onCancel={() => setReopenOpen(false)}
        onConfirm={() => {
          getStore().setStatus(r.id, "open", { by: moderator });
          setReopenOpen(false);
          toast(`${r.ref} reopened`);
        }}
      >
        <p className="muted">The record keeps its history; verification is cleared.</p>
      </ConfirmDialog>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}>
        <div>
          <div className="detail-meta" style={{ marginBottom: 6 }}>
            <span className="badge mono">{r.ref}</span>
            <SevBadge s={r.severity} />
            <StatusBadge s={r.status} />
            <SourceBadge r={r} />
          </div>
          <h2>{r.place}</h2>
        </div>
        <button className="btn btn--sm btn--ghost" onClick={onClose} aria-label="Close detail">
          ✕
        </button>
      </div>

      {r.photo || r.afterPhoto ? (
        <div className="photos">
          {r.photo ? <img src={r.photo} alt="Before" /> : <div className="skeleton" style={{ aspectRatio: "4/3" }} />}
          {after ? <img src={after} alt="After" /> : <div className="upload-tile" onClick={() => fileRef.current?.click()}>No after-photo yet</div>}
        </div>
      ) : null}

      <p className="muted small">{r.description}</p>
      <Lifecycle status={r.status} />

      <dl className="kv">
        <dt>Reported</dt>
        <dd>
          {shortDate(r.createdAt)} · {relativeDays(r.createdAt)} · {r.reporter ?? "anonymous"}
        </dd>
        <dt>Fix path</dt>
        <dd>{path === "landowner" ? "Adjacent landowner (door-hanger)" : "City of Austin via 311"}</dd>
        {r.ai && (
          <>
            <dt>AI read</dt>
            <dd>
              {HAZARD_SHORT[r.ai.label]} · {Math.round(r.ai.confidence * 100)}% · <span className="mono">{r.ai.model}</span>
            </dd>
          </>
        )}
        {r.resolvedAt && (
          <>
            <dt>Resolved</dt>
            <dd>
              {shortDate(r.resolvedAt)} by {r.resolvedBy} {r.verified ? "· verified" : "· not verified"}
            </dd>
          </>
        )}
      </dl>

      <div className="rank-explain" aria-label="Priority breakdown">
        <div>
          <span>Trip risk</span>
          <i style={{ "--p": `${(rank.risk / 55) * 100}%` } as React.CSSProperties} />
          <b>{rank.risk}</b>
        </div>
        <div>
          <span>Who walks here</span>
          <i style={{ "--p": `${(rank.exposure / 30) * 100}%` } as React.CSSProperties} />
          <b>{rank.exposure}</b>
        </div>
        <div>
          <span>Time waiting</span>
          <i style={{ "--p": `${(rank.age / 15) * 100}%` } as React.CSSProperties} />
          <b>{rank.age}</b>
        </div>
        <div>
          <span>Priority</span>
          <span className="small">{rank.anchors.length ? rank.anchors.map((a) => `${a.place.name} (${a.distanceM} m)`).join(" · ") : "No schools, transit, or senior housing within 600 m"}</span>
          <b>{rank.score}</b>
        </div>
      </div>

      <div className="status-actions">
        {r.status !== "resolved" && (
          <>
            {path === "city" && r.status === "open" && (
              <label className="field">
                <span>Austin 311 service request number</span>
                <input value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="e.g. 24-00318842" />
                <span className="hint">
                  File it at{" "}
                  <a href="https://311.austintexas.gov/" rel="noopener">
                    311.austintexas.gov
                  </a>{" "}
                  then paste the number here.
                </span>
              </label>
            )}
            {path === "landowner" && r.status === "open" && (
              <div className="notice">
                <div>
                  <b>Vegetation path.</b> Print the door-hanger and leave it. Resolve here when the after-photo comes back; no 311 ticket needed.
                  <div className="btn-row" style={{ marginTop: 8 }}>
                    <Link to="/how" className="btn btn--sm" viewTransition>
                      Print door-hanger
                    </Link>
                  </div>
                </div>
              </div>
            )}

            <div className="field">
              <span>After-photo {next === "resolved" || path === "landowner" ? "(required to resolve)" : "(optional until resolution)"}</span>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onAfterFile(e.target.files?.[0])} />
              <div className="upload-tile" onClick={() => fileRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}>
                {after ? <img src={after} alt="After-photo preview" /> : <span>Upload the after-photo</span>}
                {after && <span className="small">Tap to replace</span>}
              </div>
              {verifying && <span className="hint">Checking the after-photo…</span>}
              {verdict && (
                <div className={`notice ${verdict.looksFixed ? "notice--ok" : "notice--warn"}`} role="status">
                  <div>
                    <span className="badge badge--ai">AI</span> {verdict.note} <span className="mono">{verdict.model}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="btn-row">
              {next && !(path === "landowner" && r.status === "open") && (
                <button className="btn btn--primary" onClick={advance} disabled={next === "resolved" && !canResolveNow}>
                  Mark {STATUS_LABELS[next].toLowerCase()}
                </button>
              )}
              {(path === "landowner" || r.status === "open") && (
                <button className="btn" onClick={resolveVegetation} disabled={!canResolveNow} title={!canResolveNow ? "Needs an after-photo" : ""}>
                  Resolve with after-photo
                </button>
              )}
            </div>
            {!canResolveNow && (next === "resolved" || path === "landowner") && (
              <p className="small muted">Resolution is blocked until an after-photo is attached. That rule is enforced in the data store, not just here.</p>
            )}
          </>
        )}
        {r.status === "resolved" && (
          <div className="btn-row">
            <button className="btn btn--danger btn--sm" onClick={() => setReopenOpen(true)}>
              Reopen
            </button>
            {!r.verified && after && (
              <button
                className="btn btn--sm"
                onClick={() => {
                  getStore().update(r.id, { verified: true, resolvedBy: moderator });
                  toast(`${r.ref} verified by ${moderator}`, "ok");
                }}
              >
                Mark verified
              </button>
            )}
          </div>
        )}

        <details>
          <summary className="small muted" style={{ cursor: "pointer" }}>
            Merge as duplicate of another report
          </summary>
          <div className="btn-row" style={{ marginTop: 8 }}>
            <input value={mergeRef} onChange={(e) => setMergeRef(e.target.value)} placeholder="SQ-0001" style={{ ...selStyle, width: "8rem" }} aria-label="Target ref" />
            <button className="btn btn--sm" onClick={merge} disabled={!mergeRef.trim()}>
              Merge
            </button>
          </div>
        </details>
      </div>

      <div className="btn-row">
        <Link to={`/map?r=${r.ref}`} className="btn btn--sm" viewTransition>
          View on map
        </Link>
        <a className="btn btn--sm btn--ghost" href={`https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`} rel="noopener">
          Street view
        </a>
      </div>
    </div>
  );
}
