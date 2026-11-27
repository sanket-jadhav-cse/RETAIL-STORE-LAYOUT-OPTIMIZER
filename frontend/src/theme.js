import { useState } from "react";
export function initialTheme() {
  try {
    const stored = localStorage.getItem("retailTheme");
    if (["light", "dark"].includes(stored)) return stored;
  } catch {
    /* Storage can be disabled by the browser. */
  }
  return "dark";
}
export function useTheme() {
  const [theme, setTheme] = useState(initialTheme);
  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.dataset.theme = next;
    root.getBoundingClientRect();
    setTheme(next);
    try {
      localStorage.setItem("retailTheme", next);
    } catch {
      /* Theme still works without storage. */
    }
    requestAnimationFrame(() =>
      requestAnimationFrame(() => root.classList.remove("theme-switching")),
    );
  }
  return [theme, toggle];
}
