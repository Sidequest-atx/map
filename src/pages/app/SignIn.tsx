import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { requestPasswordReset, resetPasswordWithCode, signInDemo, signInWithPassword, signOut, useSession, type Session } from "../../data/session";
import { friendlyAuthError } from "../../lib/authErrors";
import { DEMO } from "../../lib/supabase";
import { ROLE_LABELS, type Role } from "../../types";

/** Same-site paths only: "//host" and "/\host" would point off the site. */
function safeNext(next: string | null): string {
  return next && /^\/(?![/\\])/.test(next) ? next : "/portal";
}

export default function SignIn() {
  const [params] = useSearchParams();
  const dest = safeNext(params.get("next"));
  if (DEMO) return <DemoSignIn dest={dest} />;
  return <RealSignIn dest={dest} />;
}

type Mode = "signin" | "forgot" | "code";

function RealSignIn({ dest }: { dest: string }) {
  const navigate = useNavigate();
  const session = useSession();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const go = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };

  // Moderators continue to where they were headed; everyone else stays here
  // and sees the signed-in panel, because reports are made in the app.
  const done = (s: Session) => {
    if (s.role === "moderator") navigate(dest, { replace: true, viewTransition: true });
    else go("signin");
  };

  async function run(e: FormEvent, fn: () => Promise<void>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      console.warn("[SideQuest] auth:", err);
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  if (session && mode === "signin") return <SignedIn session={session} dest={dest} />;

  if (mode === "forgot") {
    return (
      <form
        className="signin"
        onSubmit={(e) =>
          run(e, async () => {
            await requestPasswordReset(email);
            go("code");
            setNotice(`If ${email.trim()} has a SideQuest account, a 6-digit code is on its way. It works for one hour.`);
          })
        }
      >
        <div>
          <h1>Reset your password.</h1>
          <p className="muted">We'll email you a 6-digit code. There is no link to click.</p>
        </div>
        <label className="field">
          <span>Email</span>
          <input id="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        {error && <Alert>{error}</Alert>}
        <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Email me a code"}
        </button>
        <p className="small muted" style={{ textAlign: "center" }}>
          <button type="button" className="linklike" onClick={() => go("signin")} disabled={busy}>
            Back to sign in
          </button>
        </p>
      </form>
    );
  }

  if (mode === "code") {
    return (
      <form className="signin" onSubmit={(e) => run(e, async () => done(await resetPasswordWithCode(email, code, newPassword)))}>
        <div>
          <h1>Enter your code.</h1>
          <p className="muted">Look for a message from SideQuest{email.trim() ? ` at ${email.trim()}` : ""}.</p>
        </div>
        {notice && (
          <div className="notice" role="status">
            <div>{notice}</div>
          </div>
        )}
        <label className="field">
          <span>6-digit code</span>
          <input id="reset-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>New password (at least 8 characters)</span>
          <input
            id="reset-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        {error && <Alert>{error}</Alert>}
        <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={busy}>
          {busy ? "One moment…" : "Set password and sign in"}
        </button>
        <p className="small muted" style={{ textAlign: "center" }}>
          <button type="button" className="linklike" onClick={() => go("forgot")} disabled={busy}>
            Send a new code
          </button>
          {" · "}
          <button type="button" className="linklike" onClick={() => go("signin")} disabled={busy}>
            Back to sign in
          </button>
        </p>
      </form>
    );
  }

  return (
    <form className="signin" onSubmit={(e) => run(e, async () => done(await signInWithPassword(email, password)))}>
      <div>
        <h1>Sign in.</h1>
        <p className="muted">The website is the public map and the moderator portal. Reports are made in the iPhone app, with the same account.</p>
      </div>
      <label className="field">
        <span>Email</span>
        <input id="signin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
      </label>
      <label className="field">
        <span>Password</span>
        <input id="signin-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </label>
      {error && <Alert>{error}</Alert>}
      <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={busy}>
        {busy ? "One moment…" : "Sign in"}
      </button>
      <p className="small muted" style={{ textAlign: "center" }}>
        <button type="button" className="linklike" onClick={() => go("forgot")} disabled={busy}>
          Forgot your password?
        </button>
      </p>
      <p className="small muted" style={{ textAlign: "center" }}>
        New to SideQuest? Accounts are created in the iPhone app:{" "}
        <Link to="/app" viewTransition>
          get the app
        </Link>
        .{" "}
        <Link to="/map" viewTransition>
          The map needs no account.
        </Link>
      </p>
    </form>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <div className="notice notice--warn" role="alert">
      <div>{children}</div>
    </div>
  );
}

function SignedIn({ session, dest }: { session: Session; dest: string }) {
  const mod = session.role === "moderator";
  return (
    <div className="signin">
      <div>
        <h1>You're signed in.</h1>
        <p className="muted">
          Signed in as <b>{session.name}</b>
          {mod
            ? ", moderator."
            : ". Reports are made in the SideQuest iPhone app; the website is the public map and a portal for moderators."}
        </p>
      </div>
      <div className="btn-row">
        {mod ? (
          <Link className="btn btn--primary" to={dest} viewTransition>
            Go to the Portal
          </Link>
        ) : (
          <Link className="btn btn--primary" to="/map" viewTransition>
            Open the live map
          </Link>
        )}
        <button type="button" className="btn" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}

/* Demo mode (VITE_DEMO=1): pick a role, no credentials, seeded data. */
const ROLES: { role: Role; blurb: string }[] = [
  { role: "reporter", blurb: "Photograph hazards on foot and submit them to the map." },
  { role: "drive-captain", blurb: "Everything a reporter can do, plus Quest Drive batch capture from the passenger seat." },
  { role: "moderator", blurb: "Route reports to 311, print door-hangers, verify after-photos, sign close-outs." },
];

function DemoSignIn({ dest }: { dest: string }) {
  const navigate = useNavigate();
  const session = useSession();
  const [name, setName] = useState(session?.name ?? "");
  const [role, setRole] = useState<Role>(session?.role ?? "moderator");

  function go(e: FormEvent) {
    e.preventDefault();
    signInDemo(name, role);
    navigate(dest, { replace: true, viewTransition: true });
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
