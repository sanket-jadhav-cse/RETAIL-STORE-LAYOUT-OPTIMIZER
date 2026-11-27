const apiBase = import.meta.env.VITE_API_BASE_URL;
export const config = Object.freeze({
  // Vite forwards local API requests inside WSL; browsers need only port 5173.
  apiBaseUrl:
    import.meta.env.DEV &&
    ["http://localhost:8000", "http://127.0.0.1:8000"].includes(apiBase)
      ? ""
      : apiBase,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});
