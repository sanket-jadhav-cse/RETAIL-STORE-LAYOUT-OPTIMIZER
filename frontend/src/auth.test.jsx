import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  resend: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: mocks }),
}));
vi.mock("./config", () => ({
  config: {
    supabaseUrl: "https://test.supabase.co",
    supabasePublishableKey: "public-test-key",
  },
}));
const { AuthScreen } = await import("./auth");
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  history.replaceState(null, "", "/");
});
function fill() {
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "account@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "test-password-123" },
  });
}
it("signs in and prevents duplicate submissions, with password visibility", async () => {
  let finish;
  mocks.signInWithPassword.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<AuthScreen />);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Show password" }));
  expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
  fireEvent.click(screen.getByRole("button", { name: "Sign in", exact: true }));
  expect(screen.getByRole("button", { name: "Please wait…" })).toBeDisabled();
  expect(mocks.signInWithPassword).toHaveBeenCalledWith({
    email: "account@example.test",
    password: "test-password-123",
  });
  finish({ data: {} });
  await waitFor(() =>
    expect(screen.queryByText("Please wait…")).not.toBeInTheDocument(),
  );
});
it("does not expose account existence on failed sign in", async () => {
  mocks.signInWithPassword.mockResolvedValue({
    error: { message: "User not found" },
  });
  render(<AuthScreen />);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Sign in", exact: true }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Sign in failed");
  expect(screen.queryByText("User not found")).not.toBeInTheDocument();
});
it("signup leads to email verification and forgot password gives neutral feedback", async () => {
  mocks.signUp.mockResolvedValue({ data: {} });
  mocks.resetPasswordForEmail.mockResolvedValue({ data: {} });
  render(<AuthScreen initialMode="signup" />);
  fill();
  fireEvent.change(screen.getByLabelText("Display name"), {
    target: { value: "Planner" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Create account", exact: true }),
  );
  expect(
    await screen.findByRole("heading", { name: "Verify your email" }),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Forgot password", exact: true }),
  );
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "account@example.test" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Forgot password", exact: true }),
  );
  expect(
    await screen.findByText(/If an account can receive email/),
  ).toBeInTheDocument();
});
it("expired password reset gives a recoverable error", async () => {
  mocks.updateUser.mockResolvedValue({ error: { message: "Expired link" } });
  render(<AuthScreen initialMode="reset" />);
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "test-password-123" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Reset password", exact: true }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("expired");
});

it("restores a session and remounts private state on account switching and logout", async () => {
  let change;
  mocks.getSession = vi.fn().mockResolvedValue({
    data: { session: { user: { id: "account-a", email: "a@example.test" } } },
  });
  mocks.onAuthStateChange = vi.fn((callback) => {
    change = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  const { AuthProvider } = await import("./auth");
  const { useState, act } = await import("react");
  function PrivateState() {
    const [value, setValue] = useState("empty");
    return <button onClick={() => setValue("private-a")}>{value}</button>;
  }
  localStorage.setItem("retailRun", "legacy-selection");
  render(
    <AuthProvider>
      <PrivateState />
    </AuthProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "empty" }));
  expect(localStorage.getItem("retailRun")).toBeNull();
  expect(screen.getByText("private-a")).toBeInTheDocument();
  act(() =>
    change("SIGNED_IN", { user: { id: "account-b", email: "b@example.test" } }),
  );
  expect(screen.getByRole("button", { name: "empty" })).toBeInTheDocument();
  act(() => change("SIGNED_OUT", null));
  expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  expect(screen.queryByText("private-a")).not.toBeInTheDocument();
});

it("explains expired email links without reflecting provider error text", () => {
  history.replaceState(
    null,
    "",
    "/#error=access_denied&error_code=otp_expired&error_description=untrusted-provider-text",
  );
  render(<AuthScreen />);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "This email link is invalid or has expired",
  );
  expect(screen.queryByText("untrusted-provider-text")).not.toBeInTheDocument();
  history.replaceState(null, "", "/");
});

it("requests a fresh verification email with neutral feedback", async () => {
  mocks.resend.mockResolvedValue({ data: {} });
  render(<AuthScreen />);
  fireEvent.click(
    screen.getByRole("button", { name: "Resend verification", exact: true }),
  );
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "account@example.test" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Resend verification", exact: true }),
  );
  await waitFor(() =>
    expect(mocks.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "account@example.test",
      options: { emailRedirectTo: location.origin },
    }),
  );
  expect(
    await screen.findByText(/If an account needs verification/),
  ).toBeInTheDocument();
});
