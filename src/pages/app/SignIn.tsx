import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { signInDemo, signInWithPassword, signUpWithPassword, useSession } from "../../data/session";
import { DEMO } from "../../lib/supabase";
import { ROLE_LABELS, type Role } from "../../types";

export default function SignIn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get("next") || "/portal";
  const dest = next.startsWith("/") ? next : "/portal";

  if (DEMO) return <DemoSignIn onDone={() => navigate(dest, { replace: true, viewTransition: true })} />;
  return <RealSignIn onDone={() => navigate(dest, { replace: true, viewTransition: true })} />;
}

function RealSignIn({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") await signUpWithPassword(name, email, password);
      else await signInWithPassword(email, password);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="signin" onSubmit={go}>
      <div>
        <h1>{mode === "signup" ? "Create an account." : "Sign in."}</h1>
        <p className="muted">
          The same account works here and in the iPhone app. On the website an account is only needed for the moderator portal; photos are
          captured in the app.
        </p>
      </div>
      {mode === "signup" && (
        <label className="field">
          <span>Your name (shown on your reports)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mei" autoComplete="given-name" required />
        </label>
      )}
      <label className="field">
        <span>Email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          minLength={8}
          required
        />
      </label>
      {error && (
        <div className="notice notice--warn" role="alert">
          <div>{error}</div>
        </div>
      )}
      <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={busy}>
        {busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
      </button>
      <p className="small muted" style={{ textAlign: "center" }}>
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <button type="button" className="linklike" onClick={() => setMode("signin")}>
              Sign in
            </button>
          </>
        ) : (
          <>
            New here?{" "}
            <button type="button" className="linklike" onClick={() => setMode("signup")}>
              Create an account
            </button>
          </>
        )}
        {" · "}
        <Link to="/map" viewTransition>
          The map needs no account.
        </Link>
      </p>
    </form>
  );
}

/* Demo mode (VITE_DEMO=1): pick a role, no credentials, seeded data. */
const ROLES: { role: Role; blurb: string }[] = [
  { role: "reporter", blurb: "Photograph hazards on foot and submit them to the map." },
  { role: "drive-captain", blurb: "Everything a reporter can do, plus Quest Drive batch capture from the passenger seat." },
  { role: "moderator", blurb: "Route reports to 311, print door-hangers, verify after-photos, sign close-outs." },
];

function DemoSignIn({ onDone }: { onDone: () => void }) {
  const session = useSession();
  const [name, setName] = useState(session?.name ?? "");
  const [role, setRole] = useState<Role>(session?.role ?? "moderator");

  function go(e: React.FormEvent) {
    e.preventDefault();
    signInDemo(name, role);
    onDone();
  }

  return (
    <form className="signin" onSubmit={go}>
      <div>
        <h1>Sign in to quest.</h1>
        <p className="muted">Demo mode: pick a role and explore with seeded data. Nothing here touches the live map.</p>
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
    </form>
  );
}
