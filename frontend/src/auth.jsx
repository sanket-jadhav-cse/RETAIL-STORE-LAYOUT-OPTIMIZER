import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@supabase/supabase-js";
import { api } from "./api";
import { Notice } from "./ui";
import { config } from "./config";
import Icon from "./Icon";

const url = config.supabaseUrl;
const key = config.supabasePublishableKey;
function callbackErrorMessage() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  if (fragment.has("error") || query.has("error"))
    return "This email link is invalid or has expired. Request a new verification or password reset email.";
  return "";
}
// Capture before the SDK consumes and cleans the callback URL. Never reflect
// provider-supplied descriptions or retain token/link parameters in app state.
const initialCallbackError = callbackErrorMessage();
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
  const [error, setError] = useState(initialCallbackError);
  const scope = useRef({ id: null, controller: new AbortController() });
  useEffect(() => {
    try {
      localStorage.removeItem("retailRun");
    } catch {
      /* Optional browser storage. */
    }
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
        throw failure;
      },
    );
    return () => {
      api.interceptors.request.eject(request);
      api.interceptors.response.eject(response);
    };
  }, []);
  // Remount all private state on logout/account switch; no private run IDs in storage.
  const value = useMemo(
    () => ({
      user: session?.user,
      signOut: () => supabase.auth.signOut(),
      requestReset: (email) =>
        supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/reset-password`,
        }),
    }),
    [session?.user],
  );
  if (!ready)
    return (
      <main className="auth-shell">
        <output>Restoring your session…</output>
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

function formText(fields, name) {
  const value = fields.get(name);
  return typeof value === "string" ? value : "";
}
function sendAuthRequest(mode, fields) {
  const email = formText(fields, "email").trim(),
    password = formText(fields, "password");
  const requests = {
    signin: () => supabase.auth.signInWithPassword({ email, password }),
    signup: () =>
      supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: location.origin,
          data: { display_name: formText(fields, "display_name").trim() },
        },
      }),
    forgot: () =>
      supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/reset-password`,
      }),
    reset: () => supabase.auth.updateUser({ password }),
    resend: () =>
      supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: location.origin },
      }),
  };
  return requests[mode]();
}
function authFailureMessage(mode, error_) {
  if (mode === "signin")
    return "Sign in failed. Check your credentials and email verification, then retry.";
  if (mode === "reset")
    return "This reset link may have expired. Request a new link and try again.";
  if (["forgot", "resend"].includes(mode))
    return "Unable to send instructions. Please retry shortly.";
  if (error_.code === "weak_password")
    return "Choose a stronger password with at least 8 characters.";
  return "Unable to create an account. Check the fields or try signing in.";
}

export function AuthScreen({
  initialMode = "signin",
  message = "",
  onReset = () => {},
}) {
  const [mode, setMode] = useState(initialMode),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(() => message || callbackErrorMessage()),
    [feedback, setFeedback] = useState(""),
    [visible, setVisible] = useState(false);
  const titles = {
    signin: "Sign in",
    signup: "Create account",
    forgot: "Forgot password",
    reset: "Reset password",
    verify: "Verify your email",
    resend: "Resend verification",
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
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const result = await sendAuthRequest(mode, fields);
      if (result?.error) throw result.error;
      if (mode === "signup") navigate("verify");
      if (mode === "forgot")
        setFeedback(
          "If an account can receive email, password reset instructions will arrive shortly.",
        );
      if (mode === "resend")
        setFeedback(
          "If an account needs verification, a new email will arrive shortly. Use the newest link only.",
        );
      if (mode === "reset") {
        setFeedback("Password updated.");
        onReset();
      }
    } catch (error_) {
      setError(authFailureMessage(mode, error_));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <div className="auth-introduction">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="grid" />
          </span>
          <div>
            <span>RetailAtlas</span>
            <small>Retail Analytics Platform</small>
          </div>
        </div>
        <h2>
          Turn Retail Data into
          <br />
          Store Layout Decisions
        </h2>
        <p>
          Mine purchase patterns, discover product associations and plan your
          next merchandising review.
        </p>
        <div className="retail-illustration" aria-hidden="true">
          <Icon name="network" />
          <div className="illustration-shelves">
            {[1, 2, 3].map((row) => (
              <div key={row}>
                {[1, 2, 3, 4, 5].map((column) => (
                  <span key={column} />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="auth-feature-row">
          <span>
            <Icon name="layers" />
            FP-Growth mining
          </span>
          <span>
            <Icon name="network" />
            Product relationships
          </span>
          <span>
            <Icon name="report" />
            Explainable evidence
          </span>
        </div>
      </div>
      <section className="panel auth-card">
        <p className="eyebrow">RetailAtlas · Retail Store Layout Optimizer</p>
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
                <span>Display name</span>
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
                <span>Email address</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                />
              </label>
            )}
            {!["forgot", "resend"].includes(mode) && (
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
            <button
              type="submit"
              className="button primary"
              disabled={busy || !supabase}
            >
              {busy ? "Please wait…" : titles[mode]}
            </button>
          </form>
        )}
        <nav aria-label="Account access" className="auth-links">
          {Object.entries(titles)
            .filter(
              ([key]) =>
                key !== mode &&
                ["signin", "signup", "forgot", "resend"].includes(key),
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
