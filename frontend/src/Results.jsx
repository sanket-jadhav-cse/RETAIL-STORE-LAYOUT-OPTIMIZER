import Icon from "./Icon";
import Graph, { PairDetails, pct } from "./Graph";
import { DatasetQuality } from "./Overview";
import { EmptyResults, Pager, SectionHeading, Notice } from "./ui";

const qualityLabels = {
  original_records: "Original records",
  cleaned_records: "Cleaned records",
  basket_count: "Eligible transaction baskets",
  product_count: "Distinct product codes",
  repeated_product_lines: "Repeated product lines collapsed",
  policy: "Preprocessing policy",
  missing_invoice: "Missing invoice identifiers",
  missing_product: "Missing product identifiers",
  cancelled: "Cancelled transactions",
  invalid_quantity: "Invalid or non-positive quantities",
  exact_duplicates: "Exact duplicate records",
};
export function DatasetScreen({ dataset }) {
  if (!dataset)
    return (
      <Notice>
        Select an imported dataset to inspect its source and quality.
      </Notice>
    );
  return (
    <>
      <section className="panel">
        <SectionHeading
          eyebrow="Source and provenance"
          title="Online Retail dataset"
        >
          <span>{dataset.source}</span>
        </SectionHeading>
        <div className="source-metadata">
          <div>
            <span className="muted">Dataset version</span>
            <strong>{dataset.version}</strong>
          </div>
          <div>
            <span className="muted">Imported</span>
            <strong>
              {dataset.imported_at
                ? new Date(dataset.imported_at).toLocaleString()
                : "Not available"}
            </strong>
          </div>
          <div>
            <span className="muted">Mining level</span>
            <strong>One basket per invoice</strong>
          </div>
        </div>
        <DatasetQuality dataset={dataset} />
      </section>
      <div className="dataset-columns">
        <section className="panel">
          <SectionHeading title="Preprocessing summary">
            Every eligible invoice stays in the support denominator.
          </SectionHeading>
          <div className="table-scroll">
            <table>
              <caption className="sr-only">
                Dataset preprocessing summary
              </caption>
              <tbody>
                {Object.entries(dataset.summary)
                  .filter(([key]) => key !== "excluded" && key !== "policy")
                  .map(([key, value]) => (
                    <tr key={key}>
                      <th scope="row">
                        {qualityLabels[key] || key.replaceAll("_", " ")}
                      </th>
                      <td className="numeric">
                        {typeof value === "number"
                          ? value.toLocaleString()
                          : String(value)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <SectionHeading title="Excluded records">
            Counts are applied sequentially, without double counting.
          </SectionHeading>
          <div className="exclusion-list">
            {Object.entries(dataset.summary.excluded || {}).map(
              ([key, value]) => (
                <div key={key}>
                  <span>{qualityLabels[key] || key.replaceAll("_", " ")}</span>
                  <strong>{Number(value).toLocaleString()}</strong>
                </div>
              ),
            )}
          </div>
          <div className="subtle-note">
            <Icon name="shield" />
            <p>
              Customer identifiers are neither required for mining nor shown in
              these results.
            </p>
          </div>
        </section>
      </div>
      {dataset.summary.policy && (
        <section className="panel policy-panel">
          <Icon name="info" />
          <div>
            <h2>How baskets are prepared</h2>
            <p>{dataset.summary.policy}</p>
          </div>
        </section>
      )}
    </>
  );
}
export function MiningScreen({
  params,
  setParams,
  token,
  setToken,
  busy,
  datasetId,
  run,
  onSubmit,
}) {
  const fields = [
    [
      "min_support",
      "Minimum support",
      0.0001,
      1,
      0.0001,
      "Share of eligible baskets containing a pattern. For example, 0.02 means 2%.",
    ],
    [
      "min_confidence",
      "Minimum confidence",
      0.0001,
      1,
      0.0001,
      "How often the consequent appears when the antecedent is purchased.",
    ],
    [
      "min_lift",
      "Minimum lift",
      0,
      1000000,
      0.01,
      "A lift above 1 indicates a positive observed association.",
    ],
    [
      "max_itemset_size",
      "Maximum itemset size (optional)",
      1,
      8,
      1,
      "Limit products in each pattern. Leave blank for no size limit.",
    ],
  ];
  const active = ["Queued", "Running"].includes(run?.status);
  return (
    <div className="mining-layout">
      <section className="panel">
        <SectionHeading
          eyebrow="Pattern discovery"
          title="FP-Growth configuration"
        >
          Set thresholds that balance pattern coverage and relationship
          strength.
        </SectionHeading>
        <form onSubmit={onSubmit}>
          <div className="form-grid">
            {fields.map(([key, title, min, max, step, help]) => (
              <label key={key} htmlFor={key}>
                {title}
                <input
                  id={key}
                  aria-label={title}
                  name={key}
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  required={key !== "max_itemset_size"}
                  value={params[key]}
                  aria-describedby={`${key}-help`}
                  onChange={(e) =>
                    setParams({
                      ...params,
                      [key]:
                        e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                />
                <span id={`${key}-help`} className="field-help">
                  {help}
                </span>
              </label>
            ))}
          </div>
          <div className="operator-section">
            <Icon name="shield" />
            <div>
              <h3>Authorized mining access</h3>
              <p className="muted">
                Reading results is open. Starting a run requires your operator
                token.
              </p>
            </div>
          </div>
          <label className="token-field" htmlFor="operator-token">
            Operator token
            <input
              id="operator-token"
              aria-label="Operator token"
              name="operator_token"
              type="password"
              autoComplete="off"
              required
              value={token}
              aria-describedby="token-help"
              onChange={(e) => setToken(e.target.value)}
            />
            <span id="token-help" className="field-help">
              Used for this request only; never saved in browser storage.
            </span>
          </label>
          <div className="form-actions">
            <span className="muted">
              {active
                ? "A run is already in progress."
                : datasetId
                  ? "Uses every eligible basket in the selected dataset."
                  : "Select a dataset to begin."}
            </span>
            <button
              className="button primary"
              disabled={busy || !datasetId || active}
            >
              <Icon name={busy ? "clock" : "activity"} />
              {busy ? "Submitting…" : "Run FP-Growth"}
            </button>
          </div>
        </form>
      </section>
      <aside className="mining-guide">
        <div className="panel">
          <span className="guide-icon">
            <Icon name="layers" />
          </span>
          <h2>A useful starting point</h2>
          <p>
            Begin with the default thresholds, then adjust based on the number
            and relevance of the relationships you find.
          </p>
          <dl className="guide-values">
            <div>
              <dt>Support</dt>
              <dd>Pattern coverage</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>Directional frequency</dd>
            </div>
            <div>
              <dt>Lift</dt>
              <dd>Association strength</dd>
            </div>
          </dl>
          <div className="subtle-note">
            <Icon name="info" />
            <p>
              Lower support may create many more patterns and use additional
              memory. Confidence is directional.
            </p>
          </div>
        </div>
        <p className="evidence-note">
          FP-Growth mines observed co-purchases. It does not train a predictive
          sales model.
        </p>
      </aside>
    </div>
  );
}
export function ResultsScreen({
  screen,
  runId,
  run,
  result,
  loading,
  page,
  setPage,
  search,
  setSearch,
  lift,
  setLift,
  sort,
  setSort,
  onExport,
  exporting,
}) {
  const rows = screen === 5 ? result?.recommendations?.items : result?.items;
  const total = screen === 5 ? result?.recommendations?.total : result?.total;
  if (run?.status !== "Completed")
    return (
      <div className="panel">
        <EmptyResults>
          Select a completed run, or start a new analysis to inspect its
          results.
        </EmptyResults>
      </div>
    );
  return (
    <section className="panel results-panel" aria-busy={loading}>
      <SectionHeading
        eyebrow={
          screen === 3
            ? "Directional relationships"
            : screen === 4
              ? "Conceptual product adjacency"
              : "Evidence-based decision support"
        }
        title={
          screen === 3
            ? "Association rule explorer"
            : screen === 4
              ? "Product relationship map"
              : "Recommendation evidence"
        }
        action={
          total != null && (
            <span className="count-badge">
              {total.toLocaleString()} {screen === 3 ? "rules" : "pairs"}
            </span>
          )
        }
      >
        {screen === 3
          ? "Search product names or codes, then compare the metrics behind each rule."
          : screen === 4
            ? "Select a connection to inspect why two products may belong nearby."
            : "Ranked product pairs, their supporting metrics, and practical review guidance."}
      </SectionHeading>
      {screen < 5 && (
        <div className="results-toolbar">
          {screen === 3 && (
            <>
              <label className="search-field">
                Search products
                <div className="input-with-icon">
                  <Icon name="search" />
                  <input
                    type="search"
                    value={search}
                    placeholder="Product name or code…"
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </label>
              <label>
                Sort by
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  {["lift", "support", "confidence"].map((s) => (
                    <option key={s} value={s}>
                      {s[0].toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label>
            Minimum lift
            <input
              type="number"
              min="0"
              step=".1"
              value={lift}
              onChange={(e) => setLift(Math.max(0, Number(e.target.value)))}
            />
          </label>
        </div>
      )}
      {!loading && rows?.length === 0 && <EmptyResults />}
      {screen === 3 && rows?.length > 0 && (
        <div
          className="table-scroll"
          tabIndex="0"
          aria-label="Scrollable association rules"
        >
          <table className="rules-table">
            <caption className="sr-only">
              Association rules with support, confidence and lift
            </caption>
            <thead>
              <tr>
                {[
                  "Antecedent",
                  "Consequent",
                  "Support",
                  "Confidence",
                  "Lift",
                ].map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rule_id}>
                  <td>
                    <span className="product-name">
                      {r.antecedent_names.join(" + ")}
                    </span>
                    <span className="product-code">
                      {r.antecedent.join(", ")}
                    </span>
                  </td>
                  <td>
                    <span className="product-name">
                      {r.consequent_names.join(" + ")}
                    </span>
                    <span className="product-code">
                      {r.consequent.join(", ")}
                    </span>
                  </td>
                  <td className="numeric">{pct(r.support)}</td>
                  <td className="numeric">{pct(r.confidence)}</td>
                  <td className="numeric">
                    <span className="lift-badge">{r.lift.toFixed(3)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {screen === 4 && rows?.length > 0 && (
        <Graph key={`${runId}-${page}-${lift}`} pairs={rows} />
      )}
      {screen === 5 && result && (
        <>
          <div className="report-overview">
            <div>
              <h3>{result.dataset.source}</h3>
              <p className="muted">Dataset version {result.dataset.version}</p>
            </div>
            <button
              className="button primary"
              onClick={onExport}
              disabled={exporting}
            >
              <Icon name="download" />
              {exporting ? "Preparing CSV…" : "Export complete CSV report"}
            </button>
          </div>
          <dl className="report-thresholds">
            {[
              ["Minimum support", pct(result.run.min_support)],
              ["Minimum confidence", pct(result.run.min_confidence)],
              ["Minimum lift", result.run.min_lift],
              ["Max. itemset size", result.run.max_itemset_size ?? "Unbounded"],
              [
                "Mining time",
                `${result.run.execution.elapsed_seconds?.toFixed(2) ?? "—"} s`,
              ],
            ].map(([title, value]) => (
              <div key={title}>
                <dt>{title}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="subtle-note report-review">
            <Icon name="info" />
            <p>{result.review}</p>
          </div>
          <div className="report-pairs">
            {rows?.map((pair) => (
              <article key={pair.rank} className="report-pair">
                <div className="report-pair-top">
                  <span className="pair-rank">#{pair.rank}</span>
                  <span className="product-code">
                    {pair.product_a} / {pair.product_b}
                  </span>
                </div>
                <PairDetails pair={pair} />
              </article>
            ))}
          </div>
        </>
      )}
      {result && <Pager page={page} setPage={setPage} total={total} />}
    </section>
  );
}
