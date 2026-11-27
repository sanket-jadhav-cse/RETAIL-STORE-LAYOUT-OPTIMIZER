import Icon from "./Icon";
import { lazy, Suspense } from "react";
import { pct } from "./format";
const Graph = lazy(() => import("./Graph"));
import { EmptyResults, Pager, PageSkeleton } from "./ui";
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
  support,
  setSupport,
  confidence,
  setConfidence,
  lift,
  setLift,
  sort,
  setSort,
}) {
  const rows = screen === 5 ? result?.recommendations?.items : result?.items;
  const total = screen === 5 ? result?.recommendations?.total : result?.total;
  const totalPersisted =
    screen === 3 ? run?.execution?.rule_count : run?.execution?.adjacency_count;
  const reset = () => {
    setSearch("");
    setSupport(0);
    setConfidence(0);
    setLift(0);
    setSort("lift");
  };
  const toolbar = (
    <div className="results-toolbar">
      <label className="search-field">
        <span>Search products</span>
        <div className="input-with-icon">
          <Icon name="search" />
          <input
            type="search"
            maxLength={100}
            value={search}
            placeholder="Product name or code…"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </label>
      {screen === 3 && (
        <label>
          <span>Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {["lift", "support", "confidence"].map((s) => (
              <option value={s} key={s}>
                {s[0].toUpperCase() + s.slice(1)} (high to low)
              </option>
            ))}
          </select>
        </label>
      )}
      {screen === 3 && (
        <label>
          <span>Min. support</span>
          <input
            aria-label="Minimum support"
            type="number"
            min="0"
            max="1"
            step="any"
            value={support}
            onChange={(e) =>
              setSupport(Math.min(1, Math.max(0, Number(e.target.value))))
            }
          />
        </label>
      )}
      <label
        title={
          screen === 3
            ? "Directional confidence"
            : "Either qualifying direction: at least one available directional confidence meets the threshold."
        }
      >
        <span>Min. confidence</span>
        <input
          aria-label="Minimum confidence"
          type="number"
          min="0"
          max="1"
          step="any"
          value={confidence}
          onChange={(e) =>
            setConfidence(Math.min(1, Math.max(0, Number(e.target.value))))
          }
        />
      </label>
      <label>
        <span>Min. lift</span>
        <input
          aria-label="Minimum lift"
          type="number"
          min="0"
          step="any"
          value={lift}
          onChange={(e) => setLift(Math.max(0, Number(e.target.value)))}
        />
      </label>
      <button type="button" className="button secondary" onClick={reset}>
        <Icon name="refresh" />
        Reset filters
      </button>
    </div>
  );
  return (
    <section className="panel results-panel" aria-busy={loading}>
      {screen === 5 && result && (
        <dl className="report-thresholds">
          {[
            ["Minimum support", pct(run.min_support)],
            ["Minimum confidence", pct(run.min_confidence)],
            ["Minimum lift", run.min_lift],
            ["Maximum itemset size", run.max_itemset_size ?? "Unbounded"],
            [
              "Mining duration",
              `${run.execution?.elapsed_seconds?.toFixed(2) ?? "—"} s`,
            ],
          ].map(([t, v]) => (
            <div key={t}>
              <dt>{t}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {(screen !== 4 || !rows?.length) && toolbar}
      <div className="result-count-strip">
        <span>
          {total ?? "—"} matching {screen === 3 ? "rules" : "recommendations"} ·{" "}
          {totalPersisted ?? "—"} total
          {screen === 4 && rows
            ? ` · ${rows.length} displayed relationships`
            : ""}
        </span>
        {loading && result && <span role="status">Updating…</span>}
      </div>
      {loading && !result ? (
        <PageSkeleton />
      ) : !rows?.length ? (
        <EmptyResults>
          {search || lift || confidence || support
            ? "No matching results. Reset or adjust the filters."
            : screen === 3
              ? "No qualifying rules for this run. Try different mining thresholds."
              : "No adjacency recommendations for this run."}
        </EmptyResults>
      ) : (
        <>
          {screen === 3 && (
            <section
              className="table-scroll"
              tabIndex="0"
              aria-label="Scrollable association rules"
            >
              <table className="rules-table">
                <caption className="sr-only">
                  Directional association rules with support, confidence and
                  lift
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
                      <th
                        key={h}
                        scope="col"
                        aria-sort={
                          h.toLowerCase() === sort ? "descending" : undefined
                        }
                      >
                        {["Support", "Confidence", "Lift"].includes(h) ? (
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => setSort(h.toLowerCase())}
                          >
                            {h}
                            {h.toLowerCase() === sort ? " ↓" : ""}
                          </button>
                        ) : (
                          h
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.rule_id}>
                      <td>
                        <span className="product-name">
                          {r.antecedent_names.join(" + ")}{" "}
                          <span aria-label="leads to">→</span>
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
            </section>
          )}
          {screen === 4 && (
            <Suspense fallback={<PageSkeleton />}>
              <Graph
                key={`${runId}-${page}-${lift}-${confidence}-${search}`}
                pairs={rows}
                filters={toolbar}
              />
            </Suspense>
          )}
          {screen === 5 && (
            <section
              className="table-scroll"
              tabIndex="0"
              aria-label="Scrollable recommendation report"
            >
              <table className="recommendation-table">
                <caption className="sr-only">
                  Ranked product recommendations and supporting evidence
                </caption>
                <thead>
                  <tr>
                    {[
                      "Rank",
                      "Product pair",
                      "Support",
                      "Confidence A → B",
                      "Confidence B → A",
                      "Lift",
                      "Explanation",
                    ].map((t) => (
                      <th scope="col" key={t}>
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.rank}>
                      <td className="numeric">{p.rank}</td>
                      <td>
                        <strong className="product-name">{p.name_a}</strong>
                        <span className="muted">↔</span>
                        <strong className="product-name">{p.name_b}</strong>
                        <span className="product-code">
                          {p.product_a} / {p.product_b}
                        </span>
                      </td>
                      <td className="numeric">{pct(p.support)}</td>
                      <td className="numeric">{pct(p.confidence_a_b)}</td>
                      <td className="numeric">{pct(p.confidence_b_a)}</td>
                      <td className="numeric">
                        <span className="lift-badge">{p.lift.toFixed(3)}</span>
                      </td>
                      <td>
                        Co-purchased in {pct(p.support)} of baskets; lift{" "}
                        {p.lift.toFixed(2)}. Review for merchandising.
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
      {result && (
        <Pager page={page} setPage={setPage} total={total || 0} size={10} />
      )}
      {screen === 5 && (
        <p className="conceptual-note">
          Conceptual adjacency supports merchandising review; it does not prove
          increased sales or an optimal physical store layout. Unavailable
          confidence means that direction did not qualify. Complete CSV export
          retains the full persisted explanation.
        </p>
      )}
    </section>
  );
}
