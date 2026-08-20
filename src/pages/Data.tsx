import { useMemo } from "react";
import { Link } from "react-router-dom";
import { priorityLabel, rankReport } from "../ai/rank";
import { DemoBadge, SevBadge } from "../components/Bits";
import { Download } from "../components/Icons";
import { NEIGHBORHOODS, NETWORK_MILES } from "../data/places";
import { useDrives, useReports } from "../data/store";
import { exportCsv, exportGeoJSON } from "../lib/export";
import { daysBetween, fmtInt, fmtPct, median } from "../lib/format";
import { HAZARD_SHORT, STATUS_FLOW, STATUS_LABELS, type HazardType } from "../types";

export default function Data() {
  const reports = useReports();
  const drives = useDrives();

  const m = useMemo(() => {
    const live = reports.filter((r) => !r.duplicateOf);
    const resolved = live.filter((r) => r.status === "resolved");
    const verified = resolved.filter((r) => r.verified);
    const vegFree = resolved.filter((r) => r.type === "vegetation" && !r.ticket311);
    const tickets = live.filter((r) => r.ticket311);
    const cycle = resolved.map((r) => daysBetween(r.createdAt, r.resolvedAt ?? r.updatedAt));
    const openAges = live.filter((r) => r.status !== "resolved").map((r) => daysBetween(r.createdAt));

    const byType = (Object.keys(HAZARD_SHORT) as HazardType[])
      .map((t) => ({ t, n: live.filter((r) => r.type === t).length }))
      .filter((x) => x.n)
      .sort((a, b) => b.n - a.n);

    const byHood = NEIGHBORHOODS.map((h) => {
      const rs = live.filter((r) => r.neighborhood === h);
      const res = rs.filter((r) => r.status === "resolved");
      const cyc = median(res.map((r) => daysBetween(r.createdAt, r.resolvedAt ?? r.updatedAt)));
      const driveMiles = drives.filter((d) => rs.some((r) => r.driveId === d.id)).reduce((s, d) => s + d.miles, 0);
      const walkMiles = rs.filter((r) => r.source === "walk").length * 0.08; // ~one block per walk report
      const audited = Math.min(NETWORK_MILES[h], driveMiles + walkMiles);
      return { h, total: rs.length, open: rs.length - res.length, resolved: res.length, cycle: cyc, audited, network: NETWORK_MILES[h] };
    });

    const funnel = STATUS_FLOW.map((s) => ({ s, n: live.filter((r) => STATUS_FLOW.indexOf(r.status) >= STATUS_FLOW.indexOf(s)).length }));
    const top = [...live.filter((r) => r.status !== "resolved")]
      .map((r) => ({ r, score: rankReport(r).score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const auditedTotal = byHood.reduce((s, x) => s + x.audited, 0);
    const networkTotal = byHood.reduce((s, x) => s + x.network, 0);

    return {
      live: live.length,
      resolved: resolved.length,
      verified: verified.length,
      vegFree: vegFree.length,
      tickets: tickets.length,
      medianCycle: median(cycle),
      medianOpenAge: median(openAges),
      byType,
      byHood,
      funnel,
      top,
      auditedTotal,
      networkTotal,
      driveMiles: drives.reduce((s, d) => s + d.miles, 0),
    };
  }, [reports, drives]);

  const maxType = Math.max(1, ...m.byType.map((x) => x.n));
  const maxHood = Math.max(1, ...m.byHood.map((x) => x.total));

  return (
    <>
      <section className="section">
        <div className="wrap split">
          <div className="stack">
            <h1 className="h1">Open data.</h1>
            <DemoBadge />
          </div>
          <p className="lede">
            Everything on the map, as numbers you can check and files you can load. Updated live from the same store the map reads. No photos and no
            reporter names in the public exports.
          </p>
        </div>
      </section>

      <div className="wrap stack stack--lg">
        <div className="data-kpis">
          <div className="data-kpi">
            <b>{fmtInt(m.live)}</b>
            <span>hazards on file</span>
            <small>duplicates merged</small>
          </div>
          <div className="data-kpi">
            <b>{fmtInt(m.verified)}</b>
            <span>verified fixed</span>
            <small>after-photo checked, moderator signed</small>
          </div>
          <div className="data-kpi">
            <b>{fmtInt(m.vegFree)}</b>
            <span>cleared without the city</span>
            <small>vegetation closed by landowners or volunteers</small>
          </div>
          <div className="data-kpi">
            <b>{m.medianCycle == null ? "–" : `${m.medianCycle}d`}</b>
            <span>median days to resolution</span>
            <small>{m.medianOpenAge == null ? "" : `open reports: median ${m.medianOpenAge}d old`}</small>
          </div>
          <div className="data-kpi">
            <b>{fmtInt(m.tickets)}</b>
            <span>Austin 311 tickets tracked</span>
            <small>service request number on record</small>
          </div>
          <div className="data-kpi">
            <b>{fmtPct(m.networkTotal ? m.auditedTotal / m.networkTotal : 0)}</b>
            <span>of NW Austin network audited</span>
            <small>
              {m.auditedTotal.toFixed(1)} of ~{m.networkTotal} mi · {m.driveMiles.toFixed(1)} mi by Quest Drive
            </small>
          </div>
        </div>

        <div className="charts">
          <div className="chart">
            <h3>Hazards by type</h3>
            <div className="bars">
              {m.byType.map((x) => (
                <div key={x.t} className="bar-row">
                  <span>{HAZARD_SHORT[x.t]}</span>
                  <span className="track">
                    <i style={{ "--w": `${(x.n / maxType) * 100}%` } as React.CSSProperties} />
                  </span>
                  <span className="val">{x.n}</span>
                </div>
              ))}
            </div>
            <p className="caption">Vegetation is the cheapest category to close and the one we push hardest on first.</p>
          </div>

          <div className="chart">
            <h3>Ticket life cycle</h3>
            <div className="funnel">
              {m.funnel.map((f) => (
                <div key={f.s}>
                  <b>{f.n}</b>
                  <i style={{ "--w": `${(f.n / Math.max(1, m.funnel[0].n)) * 100}%` } as React.CSSProperties} />
                  <span>{STATUS_LABELS[f.s]}</span>
                </div>
              ))}
            </div>
            <p className="caption">Each stage counts reports that reached at least that stage. Resolution requires an after-photo.</p>
          </div>

          <div className="chart">
            <h3>By neighborhood: open vs resolved</h3>
            <div className="bars">
              {m.byHood.map((x) => (
                <div key={x.h} className="bar-row">
                  <span>{x.h}</span>
                  <span className="track" style={{ display: "flex", gap: 2 }}>
                    <i style={{ "--w": `${(x.resolved / maxHood) * 100}%`, borderRadius: "5px 0 0 5px" } as React.CSSProperties} />
                    <i className="is-alt" style={{ "--w": `${(x.open / maxHood) * 100}%`, borderRadius: "0 5px 5px 0" } as React.CSSProperties} />
                  </span>
                  <span className="val">
                    {x.resolved}/{x.total}
                  </span>
                </div>
              ))}
            </div>
            <p className="caption">
              <i className="sev-dot sev-dot--low" /> resolved <i className="sev-dot sev-dot--moderate" /> still open
            </p>
          </div>

          <div className="chart">
            <h3>Median days to resolution, by neighborhood</h3>
            <div className="bars">
              {m.byHood.map((x) => (
                <div key={x.h} className="bar-row">
                  <span>{x.h}</span>
                  <span className="track">
                    <i style={{ "--w": `${x.cycle == null ? 0 : Math.min(100, (x.cycle / 60) * 100)}%` } as React.CSSProperties} />
                  </span>
                  <span className="val">{x.cycle == null ? "–" : `${x.cycle}d`}</span>
                </div>
              ))}
            </div>
            <p className="caption">This is the number we will hold the process to. Scale: 0–60 days.</p>
          </div>
        </div>

        <div className="chart">
          <h3>Coverage: audited miles against the network</h3>
          <div className="bars">
            {m.byHood.map((x) => (
              <div key={x.h} className="bar-row">
                <span>{x.h}</span>
                <span className="track">
                  <i style={{ "--w": `${(x.audited / x.network) * 100}%` } as React.CSSProperties} />
                </span>
                <span className="val">
                  {x.audited.toFixed(1)}/{x.network}
                </span>
              </div>
            ))}
          </div>
          <p className="caption">
            Network miles are estimates from the City inventory for our study area; audited miles combine Quest Drive trails and walked blocks.
          </p>
        </div>

        <div className="split">
          <div className="stack">
            <h2 className="h2">Highest priority right now.</h2>
            <p className="prose muted">
              Ranked by trip risk, who walks there, and time waiting. The score is shown on every record and is meant to be argued with.
            </p>
          </div>
          <ol className="top-list">
            {m.top.map(({ r, score }) => (
              <li key={r.id}>
                <div>
                  <div className="place">
                    <Link to={`/map?r=${r.ref}`} viewTransition>
                      {r.place}
                    </Link>
                  </div>
                  <div className="sub">
                    {r.ref} · {HAZARD_SHORT[r.type]} · {r.neighborhood}
                  </div>
                </div>
                <div style={{ display: "grid", gap: 4, justifyItems: "end" }}>
                  <SevBadge s={r.severity} />
                  <span className="small muted">
                    {score} · {priorityLabel(score)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="split">
          <div className="stack">
            <h2 className="h2">Downloads.</h2>
            <p className="prose muted">CC BY 4.0. Built for the City's Sidewalk Program, council offices, and researchers. Photos are available on request.</p>
          </div>
          <ul className="download-list">
            <li>
              <div>
                <b>All reports (CSV)</b>
                <br />
                <span>One row per report with priority score and 311 ticket.</span>
              </div>
              <button className="btn" onClick={() => exportCsv(reports.filter((r) => !r.duplicateOf))}>
                <Download style={{ width: 18, height: 18 }} /> CSV
              </button>
            </li>
            <li>
              <div>
                <b>All reports (GeoJSON)</b>
                <br />
                <span>Point features, loads directly into QGIS, ArcGIS, or the City's tools.</span>
              </div>
              <button className="btn" onClick={() => exportGeoJSON(reports.filter((r) => !r.duplicateOf))}>
                <Download style={{ width: 18, height: 18 }} /> GeoJSON
              </button>
            </li>
            <li>
              <div>
                <b>Open reports only (GeoJSON)</b>
                <br />
                <span>What is still waiting, for a repair crew's route planning.</span>
              </div>
              <button className="btn" onClick={() => exportGeoJSON(reports.filter((r) => !r.duplicateOf && r.status !== "resolved"))}>
                <Download style={{ width: 18, height: 18 }} /> GeoJSON
              </button>
            </li>
          </ul>
        </div>
        <div style={{ height: "3rem" }} />
      </div>
    </>
  );
}
