import { expect, it } from "vitest";
import { publicEnvironment } from "../env-public";
it("projects only approved public settings from the shared environment", () => {
  expect(
    publicEnvironment({
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
      API_BASE_URL: "https://api.example.test",
      DATABASE_URL: "private-database-fixture",
      MIGRATION_DATABASE_URL: "private-owner-fixture",
      SUPABASE_SECRET_KEY: "private-server-fixture",
      VITE_UNRELATED_SECRET: "private-mistake-fixture",
    }),
  ).toEqual({
    VITE_API_BASE_URL: "https://api.example.test",
    VITE_SUPABASE_URL: "https://test.supabase.co",
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  });
});
it("rejects privileged keys before a browser bundle can expose them", () => {
  expect(() =>
    publicEnvironment({ SUPABASE_PUBLISHABLE_KEY: "sb_secret_fixture" }),
  ).toThrow(/public publishable/);
  const token = Buffer.from(JSON.stringify({ role: "service_role" })).toString(
    "base64url",
  );
  expect(() =>
    publicEnvironment({
      SUPABASE_PUBLISHABLE_KEY: `header.${token}.signature`,
    }),
  ).toThrow(/anon JWT/);
});
it("supports explicit public frontend-host settings and legacy anon keys", () => {
  const token = `header.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.signature`;
  expect(
    publicEnvironment({
      SUPABASE_URL: "https://old.example.test",
      VITE_SUPABASE_URL: "https://new.example.test",
      VITE_SUPABASE_PUBLISHABLE_KEY: token,
    }).VITE_SUPABASE_URL,
  ).toBe("https://new.example.test");
  expect(
    publicEnvironment({ SUPABASE_PUBLISHABLE_KEY: token })
      .VITE_SUPABASE_PUBLISHABLE_KEY,
  ).toBe(token);
});
