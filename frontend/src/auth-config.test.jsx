import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
const { AuthScreen } = await import("./auth");
afterEach(cleanup);
it("keeps deployment instructions off the public sign-in screen and fails closed", () => {
  render(<AuthScreen />);
  expect(screen.queryByText("Account setup required")).not.toBeInTheDocument();
  expect(
    screen.queryByText(/Configure the public Supabase URL/),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/Sign-in is temporarily unavailable/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeDisabled();
});
