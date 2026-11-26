export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        card: "var(--card)",
        sidebar: "var(--sidebar)",
        border: "var(--border)",
        foreground: "var(--text-primary)",
        muted: "var(--text-secondary)",
        accent: "var(--accent)",
        primary: "var(--button-primary)",
        success: "var(--success)",
        destructive: "var(--error)",
        warning: "var(--warning)",
        purple: "var(--purple)",
      },
      borderRadius: { lg: "var(--radius)", md: "var(--radius-sm)" },
    },
  },
  plugins: [],
};
