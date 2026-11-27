export const pct = (value) =>
  value == null ? "Unavailable" : `${(value * 100).toFixed(2)}%`;
