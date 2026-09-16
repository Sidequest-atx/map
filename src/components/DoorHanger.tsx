import { CONTACT_EMAIL, SITE_HOST } from "../lib/site";

/**
 * The vegetation door-hanger. /how shows it as a sample; the Portal renders
 * it for a specific report so the printed card carries that report's number,
 * link and photo. Print styles in global.css isolate `.hanger`.
 */
export function DoorHanger({ reportRef, photo, sample = false }: { reportRef: string; photo?: string; sample?: boolean }) {
  return (
    <div className="hanger" aria-label={sample ? "Sample door-hanger" : `Door-hanger for ${reportRef}`}>
      <div className="hanger-hole" aria-hidden />
      <h3>Your hedge is on the sidewalk.</h3>
      <p>
        Hi, neighbor. A walker photographed the sidewalk in front of this address and it is currently blocked by plants. People in wheelchairs,
        with strollers, or with a cane have to step into the street here.
      </p>
      {photo && <img className="hanger-photo" src={photo} alt="The blocked sidewalk, as photographed" />}
      <p>
        Austin code asks the adjacent property owner to keep the walk clear to its full width and to eight feet overhead. Trimming usually
        takes twenty minutes.
      </p>
      <p>
        <b>Need a hand?</b> Email {CONTACT_EMAIL} and a volunteer crew will bring loppers on the next Saturday.
      </p>
      <p className="ref-line">
        Report {reportRef} · {SITE_HOST}/map?r={reportRef}
      </p>
    </div>
  );
}
