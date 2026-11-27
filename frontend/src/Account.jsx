import { useEffect, useState } from "react";
import { useAuth, supabase } from "./auth";
import { api, errorMessage } from "./api";
import { Popover } from "./overlays";
import { Notice } from "./ui";

export function UserMenu({ onAccount }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  if (!auth?.user) return null;
  const name = auth.user.user_metadata?.display_name || auth.user.email;
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label="Account menu"
      trigger={
        <button
          className="icon-button account-avatar"
          type="button"
          aria-label="Open account menu"
          title={name}
        >
          {name?.slice(0, 1).toUpperCase() || "●"}
        </button>
      }
    >
      <p className="account-name">{name}</p>
      <p className="muted account-email">{auth.user.email}</p>
      {error && <Notice kind="error">{error}</Notice>}
      <button
        type="button"
        className="button secondary"
        onClick={() => {
          setOpen(false);
          onAccount();
        }}
      >
        Profile settings and account information
      </button>
      <button
        type="button"
        className="button secondary"
        onClick={async () => {
          const result = await auth.signOut();
          if (result.error) setError("Sign out failed. Please retry.");
        }}
      >
        Sign out
      </button>
    </Popover>
  );
}

export default function Account({ collapsed, setCollapsed }) {
  const auth = useAuth();
  const [profile, setProfile] = useState(null),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [feedback, setFeedback] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api
      .get("/account", { signal: controller.signal })
      .then(({ data }) => {
        setProfile(data);
        setName(data.display_name || "");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [retry]);
  async function action(task, message) {
    if (busy) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const result = await task();
      if (result.error) throw result.error;
      setFeedback(message);
    } catch {
      setError("Unable to update your account. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel account-panel">
      <h2>Account information</h2>
      {error && (
        <Notice kind="error">
          {error}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setError("");
              setRetry((n) => n + 1);
            }}
          >
            Retry
          </button>
        </Notice>
      )}
      {feedback && <Notice kind="success">{feedback}</Notice>}
      {!profile ? (
        <output>Loading account…</output>
      ) : (
        <>
          <dl className="source-metadata">
            <div>
              <dt>Email</dt>
              <dd>{profile.email}</dd>
            </div>
            <div>
              <dt>Email verification</dt>
              <dd>
                {profile.email_verified ? "Verified" : "Verification pending"}
              </dd>
            </div>
            <div>
              <dt>Account created</dt>
              <dd>
                {profile.created_at
                  ? new Date(profile.created_at).toLocaleDateString()
                  : "Unavailable"}
              </dd>
            </div>
          </dl>
          <form
            className="auth-form"
            onSubmit={(e) => {
              e.preventDefault();
              void action(
                () =>
                  supabase.auth.updateUser({
                    data: { display_name: name.trim() },
                  }),
                "Profile saved.",
              );
            }}
          >
            <label>
              <span>Display name</span>
              <input
                value={name}
                maxLength={80}
                required
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button
              type="submit"
              className="button primary"
              disabled={busy || !name.trim()}
            >
              Save profile
            </button>
          </form>
          {setCollapsed && (
            <label className="preference-control">
              <input
                type="checkbox"
                checked={collapsed}
                onChange={(e) => setCollapsed(e.target.checked)}
              />
              <span>Collapse sidebar</span>
            </label>
          )}
          <div className="button-group">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() =>
                action(
                  () => auth.requestReset(profile.email),
                  "If your account can receive email, reset instructions will arrive shortly.",
                )
              }
            >
              Send password reset
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => action(auth.signOut, "Signed out.")}
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </section>
  );
}
