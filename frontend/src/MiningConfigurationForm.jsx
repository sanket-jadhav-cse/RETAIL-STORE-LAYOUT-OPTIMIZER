import Icon from "./Icon";
import HelpTip from "./HelpTip";
export function MiningScreen({
  params,
  setParams,
  busy,
  datasetId,
  run,
  onSubmit,
  datasetControl,
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
  let submissionHelp = "Select a dataset to begin.";
  if (datasetId)
    submissionHelp = "Uses every eligible basket in the selected dataset.";
  if (active) submissionHelp = "A run is already in progress.";
  return (
    <div className="mining-layout">
      <section className="panel">
        <form onSubmit={onSubmit}>
          {datasetControl}
          <label className="run-name-field">
            <span>Run name (optional)</span>
            <input
              value={params.name || ""}
              maxLength={120}
              placeholder="For example, High-Confidence Product Associations"
              onChange={(e) => setParams({ ...params, name: e.target.value })}
            />
            <span className="field-help">
              A meaningful name to identify this analysis.
            </span>
          </label>
          <div className="form-grid">
            {fields.map(([key, title, min, max, step, help]) => {
              const field = (
                <label key={key} htmlFor={key}>
                  <span className="field-label">{title}<HelpTip label={title}>{help}</HelpTip></span>
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
                    onChange={(e) =>
                      setParams({
                        ...params,
                        [key]:
                          e.target.value === "" ? "" : Number(e.target.value),
                      })
                    }
                  />
                </label>
              );
              return key === "max_itemset_size" ? (
                <details className="advanced-settings" key={key}>
                  <summary>Advanced settings</summary>
                  {field}
                </details>
              ) : (
                field
              );
            })}
          </div>
          <p className="muted">
            Runs and results are private to your signed-in account.
          </p>
          <div className="form-actions">
            <span className="muted">{submissionHelp}</span>
            <button
              type="submit"
              className="button primary"
              disabled={busy || !datasetId || active}
            >
              <Icon name={busy ? "clock" : "activity"} />
              {busy ? "Starting analysis…" : "Run FP-Growth"}
            </button>
          </div>
        </form>
      </section>
      <aside className="compact-help-row">
        <span>Threshold guide</span>
        <HelpTip label="Threshold guide">
          Begin with the default thresholds, then adjust based on the number and relevance of the relationships you find. Support measures pattern coverage, confidence measures directional frequency, and lift measures association strength. Lower support may create many more patterns and use additional memory. Confidence is directional. FP-Growth mines observed co-purchases.
        </HelpTip>
      </aside>
    </div>
  );
}
