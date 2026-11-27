import Icon from "./Icon";
import { SectionHeading, Status } from "./ui";
import { pct } from "./Graph";
export function DatasetQuality({ dataset }) {
  const original = dataset?.summary?.original_records,
    cleaned = dataset?.summary?.cleaned_records;
  const retained = original && cleaned != null ? cleaned / original : null;
  return (
    <div className="quality-visual">
      <div className="quality-ring">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle className="ring-track" cx="60" cy="60" r="50" />
          <circle
            className="ring-value"
            cx="60"
            cy="60"
            r="50"
            pathLength="100"
            strokeDasharray={`${retained == null ? 0 : retained * 100} 100`}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div>
          <strong>
            {retained == null ? "—" : `${(retained * 100).toFixed(1)}%`}
          </strong>
          <span>rows retained</span>
        </div>
      </div>
      <div>
        <h3>Ready for invoice-level analysis</h3>
        <p className="muted">
          {cleaned == null || original == null
            ? "Import a dataset to inspect its quality."
            : `${cleaned.toLocaleString()} cleaned records from ${original.toLocaleString()} source rows.`}
        </p>
        <p className="quality-note">
          <Icon name="shield" />
          Customer identifiers are not required.
        </p>
      </div>
    </div>
  );
}
export default function Overview({
  dataset,
  datasets,
  run,
  pairs,
  pairsError,
  onNavigate,
}) {
  let connectionMessage =
    "Complete a mining run to see your strongest product connections.";
  if (run?.status === "Completed") {
    connectionMessage =
      pairs === null
        ? "Loading product connections…"
        : "No adjacency candidates are available for this run.";
  }
  if (pairsError)
    connectionMessage =
      "Product connections could not be loaded. Use Refresh to retry.";
  const metrics = [
    [
      "Eligible transactions",
      dataset?.basket_count,
      "database",
      "Unique purchase baskets",
    ],
    [
      "Products",
      dataset?.summary?.product_count,
      "box",
      "Distinct product identifiers",
    ],
    [
      "Frequent itemsets",
      run?.execution?.itemset_count,
      "layers",
      "Patterns meeting support",
    ],
    [
      "Association rules",
      run?.execution?.rule_count,
      "rules",
      "Qualifying directional rules",
    ],
    [
      "Recommended pairs",
      run?.execution?.adjacency_count,
      "network",
      "Unique adjacency candidates",
    ],
    [
      "Available datasets",
      datasets.length,
      "report",
      "Imported and ready to explore",
    ],
  ];
  return (
    <>
      <section className="panel overview-summary">
        <div>
          <span className="eyebrow">Selected dataset</span>
          <h2>{dataset?.name || "No dataset selected"}</h2>
          <p className="muted">
            {dataset?.transaction_start && dataset?.transaction_end
              ? `${dataset.transaction_start} – ${dataset.transaction_end} · `
              : ""}
            {dataset
              ? `${dataset.basket_count.toLocaleString()} eligible baskets`
              : "Select a dataset to begin"}
          </p>
          <p className="mining-availability">
            {!dataset
              ? "Dataset Unavailable"
              : run?.status === "Running" || run?.status === "Queued"
                ? "Mining Running"
                : run?.status === "Failed"
                  ? "Mining Failed"
                  : run?.status === "Completed"
                    ? "Mining Completed"
                    : "Mining Ready"}
          </p>
        </div>
        <div className="button-group">
          <button
            type="button"
            className="button primary"
            onClick={() => onNavigate(2)}
          >
            <Icon name="activity" />
            New Mining Run
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => onNavigate(5)}
          >
            Open Report
          </button>
        </div>
      </section>
      <div className="section-heading overview-heading">
        <div>
          <h2>Analysis at a glance</h2>
          <p className="muted">
            Live dataset statistics and selected-run results.
          </p>
        </div>
        <Status status={run?.status} />
      </div>
      <div className="metric-grid">
        {metrics.map(([title, value, icon, note]) => (
          <article className="metric" key={title}>
            <div className="metric-heading">
              <span>{title}</span>
              <span className="metric-icon">
                <Icon name={icon} />
              </span>
            </div>
            <strong>{value == null ? "—" : value.toLocaleString()}</strong>
            <p>{note}</p>
          </article>
        ))}
      </div>
      <div className="overview-columns">
        <section className="panel">
          <SectionHeading
            title="Dataset quality"
            action={
              <button
                type="button"
                className="text-button"
                onClick={() => onNavigate(1)}
              >
                View dataset
              </button>
            }
          >
            A clear view of the records behind your results.
          </SectionHeading>
          <DatasetQuality dataset={dataset} />
        </section>
        <section className="panel">
          <SectionHeading title="Your planning workflow">
            One evidence trail, from source data to display ideas.
          </SectionHeading>
          <ol className="workflow-list">
            {[
              [
                "database",
                "Understand your data",
                "Review the source, cleaning decisions and baskets.",
                1,
              ],
              [
                "sliders",
                "Discover purchase patterns",
                "Choose thresholds and run FP-Growth.",
                2,
              ],
              [
                "network",
                "Explore adjacency candidates",
                "Inspect relationships before making placement decisions.",
                4,
              ],
            ].map(([icon, title, text, screen]) => (
              <li key={title}>
                <span className="workflow-icon">
                  <Icon name={icon} />
                </span>
                <div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => onNavigate(screen)}
                  >
                    {title}
                  </button>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <section className="panel">
        <SectionHeading
          eyebrow="Selected run"
          title="Top product connections"
          action={
            <button
              type="button"
              className="button secondary"
              onClick={() => onNavigate(5)}
            >
              View report
            </button>
          }
        >
          Ranked candidates from the same evidence used in your graph.
        </SectionHeading>
        {pairs?.length ? (
          <div className="connection-grid">
            {pairs.map((pair) => (
              <article
                key={pair.adjacency_id || pair.rank}
                className="connection-card"
              >
                <span className="pair-rank">#{pair.rank}</span>
                <h3>{pair.name_a}</h3>
                <span className="connection-word">paired with</span>
                <h3>{pair.name_b}</h3>
                <div className="connection-metrics">
                  <span>
                    Lift <strong>{pair.lift.toFixed(2)}</strong>
                  </span>
                  <span>
                    Support <strong>{pct(pair.support)}</strong>
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="inline-empty">
            <Icon name="network" />
            <p>{connectionMessage}</p>
          </div>
        )}
      </section>
      <p className="evidence-note">
        <Icon name="info" />
        Recommendations support planning decisions. They do not predict sales
        improvements or represent a physical store layout.
      </p>
    </>
  );
}
