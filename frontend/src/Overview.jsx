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
          {cleaned == null
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
      <div className="overview-banner">
        <div>
          <span className="eyebrow">From baskets to better placement</span>
          <h2>
            Find the products that
            <br className="desktop-break" /> belong together.
          </h2>
          <p>
            Explore purchase patterns, understand the evidence, and plan your
            next product display with confidence.
          </p>
          <button
            type="button"
            className="button banner-action"
            onClick={() => onNavigate(2)}
          >
            <Icon name="sliders" />
            Configure a mining run
          </button>
        </div>
        <div className="banner-art" aria-hidden="true">
          <svg viewBox="0 0 320 210">
            <path d="M52 80 145 47 256 87 221 161 111 160 52 80M145 47l76 114M111 160l145-73M52 80l169 81" />
            <g>
              <rect x="29" y="57" width="46" height="46" rx="13" />
              <rect x="122" y="24" width="46" height="46" rx="13" />
              <rect x="233" y="64" width="46" height="46" rx="13" />
              <rect x="198" y="138" width="46" height="46" rx="13" />
              <rect x="88" y="137" width="46" height="46" rx="13" />
            </g>
            <g className="art-points">
              <circle cx="52" cy="80" r="7" />
              <circle cx="145" cy="47" r="7" />
              <circle cx="256" cy="87" r="7" />
              <circle cx="221" cy="161" r="7" />
              <circle cx="111" cy="160" r="7" />
            </g>
          </svg>
          <span>Discover. Connect. Plan.</span>
        </div>
      </div>
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
