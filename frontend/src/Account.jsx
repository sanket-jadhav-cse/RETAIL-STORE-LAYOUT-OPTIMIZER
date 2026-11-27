import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, supabase } from "./auth";
import { useResource } from "./queries";
import { PageSkeleton, QueryError } from "./ui";
import Icon from "./Icon";
import { Notice } from "./ui";

export default function Account({
  collapsed,
  setCollapsed,
  theme,
  toggleTheme,
}) {
  const client = useQueryClient();
  const auth = useAuth(),
    account = useResource(["account"], "/account");
  const [draft, setDraft] = useState(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [feedback, setFeedback] = useState("");
  const profile = account.data,
    name = draft ?? profile?.display_name ?? "";
  async function action(key, task, message) {
    if (busy) return;
    setBusy(key);
    setError("");
    setFeedback("");
    try {
      const result = await task();
      if (result.error) throw result.error;
      if (key === "profile")
        client.setQueryData(
          [auth?.user?.id || "isolated-test", "account", {}],
          (old) => ({ ...old, display_name: name.trim() }),
        );
      setFeedback(message);
    } catch {
      setError("Unable to update your account. Please retry.");
    } finally {
      setBusy("");
    }
  }
  if (account.isPending) return <PageSkeleton />;
  if (account.isError) return <QueryError query={account} />;
  return (
    <>
      {error && <Notice kind="error">{error}</Notice>}
      {feedback && <Notice kind="success">{feedback}</Notice>}
      <div className="account-columns">
        <section className="panel account-profile">
          <div className="profile-heading">
            <span className="profile-avatar">
              {(profile.display_name || profile.email || "?")
                .slice(0, 1)
                .toUpperCase()}
            </span>
            <div>
              <h2>{profile.display_name || "Your profile"}</h2>
              <span className="muted">RetailAtlas workspace</span>
            </div>
          </div>
          <h3>Profile information</h3>
          <form
            className="auth-form"
            onSubmit={(e) => {
              e.preventDefault();
              void action(
                "profile",
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
                maxLength={80}
                required
                value={name}
                onChange={(e) => setDraft(e.target.value)}
              />
            </label>
            <dl className="account-metadata">
              <div>
                <dt>Email address</dt>
                <dd>{profile.email}</dd>
              </div>
              <div>
                <dt>Email verification</dt>
                <dd className="ready-indicator">
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
            <button
              type="submit"
              className="button primary"
              disabled={!!busy || !name.trim()}
            >
              {busy === "profile" ? (
                <>
                  <span className="spinner" />
                  Saving profile…
                </>
              ) : (
                "Save profile"
              )}
            </button>
          </form>
        </section>
        <section className="panel account-security">
          <span className="guide-icon">
            <Icon name="shield" />
          </span>
          <h2>Security</h2>
          <p className="muted">Manage access to your RetailAtlas account.</p>
          <h3>Password reset</h3>
          <p className="muted">Receive a secure link to set a new password.</p>
          <button
            type="button"
            className="button secondary"
            disabled={!!busy}
            onClick={() =>
              action(
                "reset",
                () => auth.requestReset(profile.email),
                "If your account can receive email, reset instructions will arrive shortly.",
              )
            }
          >
            {busy === "reset" ? (
              <>
                <span className="spinner" />
                Sending reset…
              </>
            ) : (
              "Send password reset"
            )}
          </button>
          <div className="account-session">
            <h3>Current session</h3>
            <p className="muted">Sign out of this workspace.</p>
            <button
              type="button"
              className="button secondary"
              disabled={!!busy}
              onClick={() => action("signout", auth.signOut, "Signed out.")}
            >
              Sign out
            </button>
          </div>
        </section>
        <section className="panel account-preferences">
          <span className="guide-icon">
            <Icon name="sliders" />
          </span>
          <h2>Preferences</h2>
          <p className="muted">Customize your workspace appearance.</p>
          <h3>Theme</h3>
          <div className="theme-options">
            {["dark", "light"].map((t) => (
              <button
                type="button"
                className="theme-option"
                key={t}
                aria-pressed={theme === t}
                onClick={() => {
                  if (theme !== t) toggleTheme();
                }}
              >
                <Icon name={t === "dark" ? "moon" : "sun"} />
                {t === "dark" ? "Dark" : "Light"}
              </button>
            ))}
          </div>
          <h3>Sidebar</h3>
          <label className="preference-control">
            <input
              type="checkbox"
              checked={collapsed}
              onChange={(e) => setCollapsed(e.target.checked)}
            />
            <span>Collapse sidebar</span>
          </label>
          <p className="muted">
            Appearance preferences are saved on this browser.
          </p>
        </section>
      </div>
    </>
  );
}
