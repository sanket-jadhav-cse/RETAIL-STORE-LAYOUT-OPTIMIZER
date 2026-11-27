import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { api } from "./api";
import { Notice } from "./ui";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
        },
      })
    : null;
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState(
    window.location.pathname === "/reset-password",
  );
  const [error, setError] = useState("");
  const scope = useRef({ id: null, controller: new AbortController() });
  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    let active = true;
    let observedEvent = false;
    const update = (value) => {
      if (active) {
        const id = value?.user.id || null;
        if (scope.current.id !== id) {
          scope.current.controller.abort();
          scope.current = { id, controller: new AbortController() };
        }
        setSession(value);
        setReady(true);
      }
    };
    supabase.auth.getSession().then(({ data, error }) => {
      if (observedEvent) return;
      if (error) {
        setError("Your session could not be restored. Sign in again.");
        update(null);
      } else update(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((event, value) => {
      observedEvent = true;
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      update(value);
    });
    return () => {
      active = false;
      scope.current.controller.abort();
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!supabase) return;
    const request = api.interceptors.request.use(async (config) => {
      const started = scope.current;
      const { data, error } = await supabase.auth.getSession();
      if (started !== scope.current || started.controller.signal.aborted)
        throw Object.assign(new Error("Account changed"), {
          code: "ERR_CANCELED",
        });
      if (error || !data.session) throw new Error("Sign in required");
      config.authScope = started;
      config.signal = config.signal
        ? AbortSignal.any([config.signal, started.controller.signal])
        : started.controller.signal;
      config.headers.Authorization = `Bearer ${data.session.access_token}`;
      return config;
    });
    const response = api.interceptors.response.use(
      (value) => {
        if (value.config.authScope !== scope.current)
          throw Object.assign(new Error("Account changed"), {
            code: "ERR_CANCELED",
          });
        return value;
      },
      async (failure) => {
        if (
          failure.response?.status === 401 &&
          failure.config?.authScope === scope.current
        ) {
          setError("Your session has expired. Sign in again.");
          await supabase.auth.signOut({ scope: "local" });
        }
        return Promise.reject(failure);
      },
    );
    return () => {
      api.interceptors.request.eject(request);
      api.interceptors.response.eject(response);
    };
  }, []);
  // Remount all private state on logout/account switch; no private run IDs in storage.
  const value = {
    user: session?.user,
    signOut: () => supabase.auth.signOut(),
    requestReset: (email) =>
      supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/reset-password`,
      }),
  };
  if (!ready)
    return (
      <main className="auth-shell">
        <p role="status">Restoring your session…</p>
      </main>
    );
  if (!session || recovery)
    return (
      <AuthScreen
        key={recovery ? "recovery" : "signin"}
        initialMode={recovery ? "reset" : undefined}
        message={error}
        onReset={() => {
          setRecovery(false);
          history.replaceState(null, "", "/");
        }}
      />
    );
  return (
    <AuthContext.Provider value={value}>
      <div key={session.user.id}>{children}</div>
    </AuthContext.Provider>
  );
}

export function AuthScreen({
  initialMode = "signin",
  message = "",
  onReset = () => {},
}) {
  const [mode, setMode] = useState(initialMode),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(message),
    [feedback, setFeedback] = useState(""),
    [visible, setVisible] = useState(false);
  const titles = {
    signin: "Sign in",
    signup: "Create account",
    forgot: "Forgot password",
    reset: "Reset password",
    verify: "Verify your email",
  };
  function navigate(next) {
    setMode(next);
    setVisible(false);
    setError("");
    setFeedback("");
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || !supabase) return;
    const fields = new FormData(event.currentTarget),
      email = String(fields.get("email") || "").trim(),
      password = String(fields.get("password") || "");
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      let result;
      if (mode === "signin")
        result = await supabase.auth.signInWithPassword({ email, password });
      if (mode === "signup")
        result = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: location.origin,
            data: {
              display_name: String(fields.get("display_name") || "").trim(),
            },
          },
        });
      if (mode === "forgot")
        result = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/reset-password`,
        });
      if (mode === "reset")
        result = await supabase.auth.updateUser({ password });
      if (result?.error) throw result.error;
      if (mode === "signup") navigate("verify");
      if (mode === "forgot")
        setFeedback(
          "If an account can receive email, password reset instructions will arrive shortly.",
        );
      if (mode === "reset") {
        setFeedback("Password updated.");
        onReset();
      }
    } catch (failure) {
      setError(
        mode === "signin"
          ? "Sign in failed. Check your credentials and email verification, then retry."
          : mode === "reset"
            ? "This reset link may have expired. Request a new link and try again."
            : mode === "forgot"
              ? "Unable to send instructions. Please retry shortly."
              : failure.code === "weak_password"
                ? "Choose a stronger password with at least 8 characters."
                : "Unable to create an account. Check the fields or try signing in.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="panel auth-card">
        <p className="eyebrow">Retail Store Layout Optimizer</p>
        <h1>{titles[mode]}</h1>
        <p className="muted">FP-Growth · Retail Analytics Dashboard</p>
        {!supabase && (
          <Notice>
            Sign-in is temporarily unavailable. Please try again later.
          </Notice>
        )}
        {error && <Notice kind="error">{error}</Notice>}
        {feedback && <Notice kind="success">{feedback}</Notice>}
        {mode === "verify" ? (
          <Notice>
            Check your inbox for a verification link. If an account already
            exists, sign in or request a password reset.
          </Notice>
        ) : (
          <form onSubmit={submit} className="auth-form" key={mode}>
            {mode === "signup" && (
              <label>
                Display name
                <input
                  name="display_name"
                  autoComplete="name"
                  maxLength={80}
                  required
                />
              </label>
            )}
            {mode !== "reset" && (
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                />
              </label>
            )}
            {mode !== "forgot" && (
              <label>
                Password
                <div className="password-control">
                  <input
                    aria-label="Password"
                    name="password"
                    type={visible ? "text" : "password"}
                    autoComplete={
                      mode === "signin" ? "current-password" : "new-password"
                    }
                    minLength={mode === "signin" ? 1 : 8}
                    maxLength={128}
                    required
                  />
                  <button
                    type="button"
                    className="button secondary"
                    aria-label={visible ? "Hide password" : "Show password"}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
            )}
            <button className="button primary" disabled={busy || !supabase}>
              {busy ? "Please wait…" : titles[mode]}
            </button>
          </form>
        )}
        <nav aria-label="Account access" className="auth-links">
          {Object.entries(titles)
            .filter(
              ([key]) =>
                key !== mode && ["signin", "signup", "forgot"].includes(key),
            )
            .map(([key, title]) => (
              <button
                type="button"
                className="text-button"
                key={key}
                onClick={() => navigate(key)}
              >
                {title}
              </button>
            ))}
        </nav>
      </section>
    </main>
  );
}
