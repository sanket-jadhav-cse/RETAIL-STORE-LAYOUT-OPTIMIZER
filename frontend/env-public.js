// Build-time projection. Never spread server environment into browser code.
export function publicEnvironment(env) {
  const key =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? "";
  if (key.startsWith("sb_secret_"))
    throw new Error(
      "Supabase browser configuration requires a public publishable or anon key.",
    );
  if (key.split(".").length === 3) {
    let role;
    try {
      role = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      ).role;
    } catch {
      throw new Error("Invalid public Supabase API key configuration.");
    }
    if (role !== "anon")
      throw new Error(
        "Only an anon JWT API key may be exposed to the browser.",
      );
  }
  return {
    VITE_API_BASE_URL:
      env.VITE_API_BASE_URL ?? env.API_BASE_URL ?? "http://localhost:8000",
    VITE_SUPABASE_URL: env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? "",
    VITE_SUPABASE_PUBLISHABLE_KEY: key,
  };
}
