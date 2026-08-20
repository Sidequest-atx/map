import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { signIn, useSession } from "../../data/session";
import { ROLE_LABELS, type Role } from "../../types";

const ROLES: { role: Role; blurb: string }[] = [
  { role: "reporter", blurb: "Photograph hazards on foot and submit them to the map." },
  { role: "drive-captain", blurb: "Everything a reporter can do, plus Quest Drive batch capture from the passenger seat." },
  { role: "moderator", blurb: "Route reports to 311, print door-hangers, verify after-photos, sign close-outs." },
];

export default function SignIn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const session = useSession();
  const [name, setName] = useState(session?.name ?? "");
  const [role, setRole] = useState<Role>(session?.role ?? "reporter");
  const next = params.get("next") || "/app";

  function go(e: React.FormEvent) {
    e.preventDefault();
    signIn(name, role);
    navigate(next.startsWith("/") ? next : "/app", { replace: true, viewTransition: true });
  }

  return (
    <form className="signin" onSubmit={go}>
      <div>
        <h1>Sign in to quest.</h1>
        <p className="muted">
          Accounts keep the map trustworthy. For this prototype, pick a role; real accounts arrive with the shared database.
        </p>
      </div>
      <label className="field">
        <span>Your name (shown on your reports)</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mei" autoComplete="given-name" autoFocus />
      </label>
      <div className="field">
        <span>Role</span>
        <div className="role-options" role="radiogroup">
          {ROLES.map((r) => (
            <button
              key={r.role}
              type="button"
              role="radio"
              aria-checked={role === r.role}
              className={`option ${role === r.role ? "is-on" : ""}`}
              onClick={() => setRole(r.role)}
            >
              {ROLE_LABELS[r.role]}
              <small>{r.blurb}</small>
            </button>
          ))}
        </div>
      </div>
      <button className="btn btn--primary btn--lg btn--block" type="submit">
        Continue
      </button>
      <p className="small muted" style={{ textAlign: "center" }}>
        Just want to look?{" "}
        <Link to="/map" viewTransition>
          The map needs no account.
        </Link>
      </p>
    </form>
  );
}
