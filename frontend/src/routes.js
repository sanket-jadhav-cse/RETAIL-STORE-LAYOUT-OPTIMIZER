export const destinations = [
  [
    "Overview",
    "overview",
    "grid",
    "Overview",
    "FP-Growth · Retail Analytics Dashboard",
  ],
  [
    "Datasets",
    "datasets",
    "database",
    "Datasets",
    "Manage datasets and inspect data quality for your analysis.",
  ],
  [
    "Dataset Upload",
    "datasets/upload",
    "upload",
    "Dataset Upload",
    "Import a CSV or XLSX transaction file and prepare it for mining.",
  ],
  [
    "Mining Configuration",
    "mining/configuration",
    "sliders",
    "FP-Growth Configuration",
    "Set thresholds to discover frequent itemsets and association rules.",
  ],
  [
    "Mining Execution",
    "mining/execution",
    "activity",
    "Mining Execution",
    "Run and monitor market basket analysis jobs.",
  ],
  [
    "Association Rules",
    "rules",
    "rules",
    "Association Rules",
    "Explore directional associations between products from FP-Growth.",
  ],
  [
    "Product Relationship Map",
    "layout",
    "network",
    "Product Relationship Map",
    "Explore observed product adjacencies and their supporting evidence.",
  ],
  [
    "Reports",
    "reports",
    "report",
    "Layout Recommendation Report",
    "Ranked product pairs with support, confidence and lift for merchandising review.",
  ],
  [
    "Account",
    "account",
    "shield",
    "My Account",
    "Manage your profile, preferences and account security.",
  ],
];
export function screenFromUrl() {
  const slug = location.hash.slice(1).replace(/^\//, "").split("?")[0];
  if (slug === "mining") return 3;
  return Math.max(
    0,
    destinations.findIndex((d) => d[1] === slug),
  );
}
export function selectionFromUrl(key) {
  return new URLSearchParams(location.hash.split("?")[1] || "").get(key) || "";
}
export function routeHash(screen, datasetId, runId) {
  const params = new URLSearchParams();
  if ([0, 1, 3, 4].includes(screen) && datasetId)
    params.set("dataset", datasetId);
  if ([0, 4, 5, 6, 7].includes(screen) && runId) params.set("run", runId);
  return `#${destinations[screen][1]}${params.size ? "?" + params : ""}`;
}
