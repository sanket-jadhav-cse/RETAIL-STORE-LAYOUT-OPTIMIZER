import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { api, errorMessage, runPath, downloadBlob } from "./api";
import { useAuth } from "./auth";
import { useResource } from "./queries";
import { DatasetSelector } from "./Selectors";
import { DatasetQuality } from "./Overview";
import { MiningScreen } from "./MiningConfigurationForm";
import RunHistory from "./RunHistory";
import Icon from "./Icon";
import { Notice, PageSkeleton, QueryError, SectionHeading, Status } from "./ui";
import { pct } from "./format";
import { Popover } from "./overlays";

export default function WorkspacePage(props) {
  if (props.screen === 0) return <OverviewPage {...props} />;
  if (props.screen === 1) return <DatasetsPage {...props} />;
  if (props.screen === 3) return <ConfigurationPage {...props} />;
  return <ExecutionPage {...props} />;
}
function OverviewPage({
  dataset,
  datasets,
  datasetId,
  onDataset,
  run,
  runId,
  onRun,
  onNavigate,
}) {
  const pairs = useResource(
    ["pairs-preview", runId],
    () => runPath(runId, "adjacencies"),
    { page: 1, page_size: 3 },
    { enabled: run?.status === "Completed" },
  );
  const metrics = [
    ["Eligible baskets", dataset?.basket_count, "database"],
    ["Products", dataset?.summary?.product_count, "box"],
    ["Frequent itemsets", run?.execution?.itemset_count, "layers"],
    ["Association rules", run?.execution?.rule_count, "rules"],
    ["Recommended pairs", run?.execution?.adjacency_count, "network"],
  ];
  return (
    <>
      <div className="overview-dataset-control">
        <DatasetSelector
          datasets={datasets}
          value={datasetId}
          onChange={onDataset}
        />
        {dataset && (
          <span className="muted">
            {dataset.transaction_start &&
              `${dataset.transaction_start} – ${dataset.transaction_end}`}{" "}
            ·{" "}
            {run
              ? `Mining ${run.status}`
              : dataset.processing_status || "Ready"}
          </span>
        )}
        <button type="button" className="button primary overview-new-run" onClick={() => onNavigate(3)}>
          <Icon name="activity" />
          New Mining Run
        </button>
      </div>
      {!datasets.length && (
        <Notice title="No available datasets">
          Upload a CSV or XLSX file to begin.{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => onNavigate(2)}
          >
            Upload Dataset
          </button>
        </Notice>
      )}
      <div className="metric-grid">
        {metrics.map(([title, value, icon]) => (
          <article className="metric" key={title}>
            <span className="metric-icon">
              <Icon name={icon} />
            </span>
            <div>
              <span className="muted">{title}</span>
              <strong>{value == null ? "—" : value.toLocaleString()}</strong>
            </div>
          </article>
        ))}
      </div>
      <div className="overview-columns">
        <section className="panel">
          <SectionHeading title="Dataset quality" />
          <DatasetQuality dataset={dataset} />
        </section>
        <section className="panel">
          <SectionHeading title="Top product connections" />
          {pairs.isError ? (
            <QueryError query={pairs} />
          ) : pairs.isFetching && !pairs.data ? (
            <PageSkeleton />
          ) : pairs.data?.items?.length ? (
            <div className="top-connections">
              {pairs.data.items.map((p) => (
                <div key={p.rank}>
                  <span className="rank-badge">#{p.rank}</span>
                  <strong>
                    {p.name_a} <span className="muted">↔</span> {p.name_b}
                  </strong>
                  <div className="connection-evidence">
                    <span>Support {pct(p.support)}</span>
                    <span>
                      Lift <b>{p.lift.toFixed(2)}</b>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              {run?.status === "Completed"
                ? "No adjacency recommendations for this run."
                : "Complete a mining run to see the strongest product connections."}
            </p>
          )}
        </section>
      </div>
      <RunHistory
        compact
        datasets={datasets}
        datasetId={datasetId}
        selectedId={runId}
        onSelect={(r) => {
          onRun(r);
          onNavigate(4, r);
        }}
        onViewAll={() => onNavigate(4)}
      />
    </>
  );
}
function DatasetsPage({ dataset, datasets, onDataset, onNavigate }) {
  const [search, setSearch] = useState(""),
    [scope, setScope] = useState("all"),
    [error, setError] = useState(""),
    [feedback, setFeedback] = useState(""),
    [busy, setBusy] = useState(false),
    [archive, setArchive] = useState(false);
  const client = useQueryClient();
  const owner = useAuth()?.user?.id || "isolated-test";
  const rows = datasets.filter(
    (d) =>
      (scope === "all" || (scope === "shared" ? d.is_shared : !d.is_shared)) &&
      `${d.name} ${d.source}`.toLowerCase().includes(search.toLowerCase()),
  );
  const labels = {
    missing_invoice: "Missing invoice identifiers",
    missing_product: "Missing product identifiers",
    cancelled: "Cancelled transactions",
    invalid_quantity: "Invalid / non-positive quantities",
    exact_duplicates: "Exact duplicates",
  };
  async function update(values) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.patch(`/datasets/${dataset.dataset_id}`, values);
      await client.invalidateQueries({ queryKey: [owner, "datasets"] });
      setFeedback(
        values.name
          ? "Dataset renamed."
          : "Dataset archived. Existing runs and source files are preserved.",
      );
      setArchive(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    setBusy(true);
    setError("");
    try {
      await downloadBlob(
        `/datasets/${dataset.dataset_id}/source`,
        `retail-dataset.${dataset.summary.upload.format}`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error && <Notice kind="error">{error}</Notice>}
      {feedback && <Notice kind="success">{feedback}</Notice>}
      <div className="dataset-master-detail">
        <section className="panel dataset-master">
          <SectionHeading title="Dataset catalog" action={!dataset && (
            <button type="button" className="button primary" onClick={() => onNavigate(2)}>
              <Icon name="upload" />
              Upload Dataset
            </button>
          )} />
          <label>
            <span className="sr-only">Search datasets</span>
            <input
              type="search"
              placeholder="Search datasets…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div
            className="segmented"
            role="group"
            aria-label="Dataset visibility"
          >
            {[
              ["all", "All"],
              ["shared", "Shared"],
              ["mine", "My Datasets"],
            ].map(([v, t]) => (
              <button
                type="button"
                key={v}
                aria-pressed={scope === v}
                onClick={() => setScope(v)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="dataset-catalog">
            {rows.map((d) => (
              <button
                type="button"
                className="dataset-option"
                key={d.dataset_id}
                aria-pressed={d.dataset_id === dataset?.dataset_id}
                onClick={() => onDataset(d.dataset_id)}
              >
                <Icon name="database" />
                <div>
                  <strong>{d.name}</strong>
                  <span className="dataset-tags">
                    <span className="count-badge">
                      {d.is_shared ? "Shared" : "Private"}
                    </span>
                    <span className="ready-indicator">
                      {d.processing_status || "Ready"}
                    </span>
                  </span>
                  <small>
                    {d.basket_count.toLocaleString()} eligible baskets
                  </small>
                </div>
              </button>
            ))}
          </div>
          {!rows.length && (
            <p className="muted">
              {datasets.length
                ? "No matching datasets."
                : "No available datasets. Upload your first file."}
            </p>
          )}
        </section>
        {dataset ? (
          <section className="panel dataset-detail" key={dataset.dataset_id}>
            <SectionHeading
              title={dataset.name}
              action={<div className="button-group dataset-detail-actions">
                <button type="button" className="button secondary" onClick={() => onNavigate(2)}>
                  <Icon name="upload" />
                  Upload Dataset
                </button>
                <button type="button" className="button primary" disabled={dataset.processing_status !== "Ready"} onClick={() => onNavigate(3)}>
                  <Icon name="activity" />
                  Start Mining
                </button>
              </div>}
            >
              {dataset.description || dataset.source}
            </SectionHeading>
            <div className="source-metadata">
              {[
                [
                  "Source organization",
                  dataset.source_organization || "Owner-provided file",
                ],
                [
                  "Transaction period",
                  dataset.transaction_start
                    ? `${dataset.transaction_start} – ${dataset.transaction_end}`
                    : "Dates unavailable",
                ],
                ["Imported", new Date(dataset.imported_at).toLocaleString()],
                [
                  "Checksum / version",
                  dataset.checksum
                    ? `sha256:${dataset.checksum.slice(0, 16)}`
                    : dataset.version?.includes(dataset.transaction_start)
                      ? "Original source import"
                      : dataset.version,
                ],
                ["Processing status", dataset.processing_status],
              ].map(([title, value]) => (
                <div key={title}>
                  <span className="muted">{title}</span>
                  <strong>{value}</strong>
                </div>
              ))}
              {dataset.source_url?.startsWith("https://") && (
                <div>
                  <span className="muted">Source</span>
                  <a href={dataset.source_url} rel="noreferrer" target="_blank">
                    Original dataset ↗
                  </a>
                </div>
              )}
              {dataset.doi?.startsWith("https://doi.org/") && (
                <div>
                  <span className="muted">Citation</span>
                  <a href={dataset.doi} rel="noreferrer" target="_blank">
                    Dataset DOI ↗
                  </a>
                </div>
              )}
            </div>
            <div className="dataset-stat-row">
              {[
                ["Original records", dataset.summary.original_records],
                ["Cleaned records", dataset.summary.cleaned_records],
                ["Eligible baskets", dataset.basket_count],
                ["Unique products", dataset.summary.product_count],
              ].map(([t, v]) => (
                <div key={t}>
                  <span className="muted">{t}</span>
                  <strong>{v?.toLocaleString() ?? "—"}</strong>
                </div>
              ))}
            </div>
            <div className="dataset-quality-columns">
              <div>
                <h3>Data quality</h3>
                <DatasetQuality dataset={dataset} />
              </div>
              <div>
                <h3>Excluded records</h3>
                <div className="exclusion-list">
                  {Object.entries(dataset.summary.excluded || {}).map(
                    ([k, v]) => (
                      <div key={k}>
                        <span>{labels[k] || k.replaceAll("_", " ")}</span>
                        <strong>{v.toLocaleString()}</strong>
                      </div>
                    ),
                  )}
                  <div>
                    <span>Invalid dates (metadata)</span>
                    <strong>
                      {dataset.summary.invalid_dates?.toLocaleString() ??
                        "Not provided"}
                    </strong>
                  </div>
                  <div>
                    <span>Repeated product lines collapsed</span>
                    <strong>
                      {dataset.summary.repeated_product_lines?.toLocaleString() ??
                        "—"}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
            <details className="quality-policy">
              <summary>Preprocessing summary</summary>
              <p className="muted">
                {dataset.summary.policy ||
                  "Invoice-level Boolean product presence; CustomerID is optional."}
              </p>
            </details>
            {!dataset.is_shared && (
              <div className="dataset-actions">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    update({ name: new FormData(e.currentTarget).get("name") });
                  }}
                >
                  <label>
                    <span>Dataset name</span>
                    <input
                      name="name"
                      required
                      maxLength={200}
                      defaultValue={dataset.name}
                    />
                  </label>
                  <button
                    type="submit"
                    className="button secondary"
                    disabled={busy}
                  >
                    Rename
                  </button>
                </form>
                {dataset.summary.upload && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={download}
                  >
                    Download source
                  </button>
                )}
                <Dialog.Root open={archive} onOpenChange={setArchive}>
                  <Dialog.Trigger asChild>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={
                        busy || dataset.processing_status === "Archived"
                      }
                    >
                      Archive dataset
                    </button>
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Overlay className="drawer-overlay" />
                    <Dialog.Content className="confirmation-dialog">
                      <Dialog.Title>Archive this dataset?</Dialog.Title>
                      <Dialog.Description>
                        Existing runs, reports and source files will be
                        preserved. This dataset will no longer accept new mining
                        runs.
                      </Dialog.Description>
                      <div className="button-group">
                        <Dialog.Close asChild>
                          <button
                            type="button"
                            className="button secondary"
                            disabled={busy}
                          >
                            Keep dataset
                          </button>
                        </Dialog.Close>
                        <button
                          type="button"
                          className="button primary"
                          disabled={busy}
                          onClick={() =>
                            update({ processing_status: "Archived" })
                          }
                        >
                          {busy ? "Archiving…" : "Confirm archive"}
                        </button>
                      </div>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>
              </div>
            )}
          </section>
        ) : (
          <section className="panel empty-state">
            <h2>Select a dataset</h2>
            <p>Inspect source metadata and data quality before mining.</p>
          </section>
        )}
      </div>
    </>
  );
}
function ConfigurationPage({
  datasets,
  datasetId,
  onDataset,
  onRun,
  onNavigate,
}) {
  const [params, setParams] = useState({
    name: "",
    min_support: 0.02,
    min_confidence: 0.5,
    min_lift: 1,
    max_itemset_size: 3,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const inFlight = useRef(false),
    submission = useRef(null);
  const client = useQueryClient();
  async function submit(e) {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const body = {
      ...params,
      name: params.name.trim() || null,
      dataset_id: datasetId,
      max_itemset_size:
        params.max_itemset_size === "" ? null : Number(params.max_itemset_size),
    };
    const signature = JSON.stringify(body);
    if (submission.current?.signature !== signature)
      submission.current = { signature, key: crypto.randomUUID() };
    try {
      const { data } = await api.post("/runs", body, {
        headers: { "Idempotency-Key": submission.current.key },
      });
      onRun(data);
      client.invalidateQueries({ predicate: (q) => q.queryKey[1] === "runs" });
      onNavigate(4, data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  return (
    <>
      {error && (
        <Notice kind="error">
          {error} Retry uses the same submission identity to avoid duplicate
          runs.
        </Notice>
      )}
      {!datasets.some((d) => d.processing_status === "Ready") && (
        <Notice title="No ready datasets">
          Upload and process a dataset before configuring a run.
        </Notice>
      )}
      <MiningScreen
        params={params}
        setParams={setParams}
        busy={busy}
        datasetId={datasetId}
        onSubmit={submit}
        datasetControl={
          <DatasetSelector
            datasets={datasets}
            value={datasetId}
            onChange={onDataset}
          />
        }
      />
    </>
  );
}
function ExecutionPage({ run, runQuery, runId, datasets, onRun, onNavigate }) {
  return (
    <>
      {runQuery.isError ? (
        <QueryError query={runQuery} />
      ) : runQuery.isFetching && !run ? (
        <PageSkeleton />
      ) : (
        <section className="panel execution-panel">
          <SectionHeading
            title="Selected execution"
            action={run && <Status status={run.status} />}
          />
          {!run ? (
            <p className="muted">
              No previous runs. Configure your first analysis to begin.
            </p>
          ) : (
            <>
              <div className="execution-title">
                <h3>{run.name}</h3>
                <ExecutionRename run={run} />
              </div>
              <p className="muted">
                Submitted {new Date(run.created_at).toLocaleString()}
              </p>
              {["Queued", "Running"].includes(run.status) && (
                <div className="job-message">
                  <span className="spinner" />
                  <div>
                    <strong>
                      {run.status === "Queued"
                        ? "Waiting for a mining worker"
                        : "Analysis in progress"}
                    </strong>
                    <p className="muted">
                      {run.status === "Queued"
                        ? "Your analysis is waiting for an available mining worker."
                        : "FP-Growth is processing your eligible transaction baskets. Results will appear when saved."}
                    </p>
                    {run.status === "Running" && (
                      <ExecutionElapsed started={run.execution?.started_at} />
                    )}
                  </div>
                </div>
              )}
              {run.status === "Failed" && (
                <Notice kind="error" title="Analysis failed">
                  {run.error || "The worker could not complete this run."}{" "}
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => onNavigate(3)}
                  >
                    Review configuration and retry
                  </button>
                </Notice>
              )}
              <dl className="execution-metrics">
                {[
                  ["Support", pct(run.min_support)],
                  ["Confidence", pct(run.min_confidence)],
                  ["Lift", run.min_lift],
                  ["Maximum itemset", run.max_itemset_size ?? "Unbounded"],
                  [
                    "Mining duration",
                    run.execution?.elapsed_seconds != null
                      ? `${run.execution.elapsed_seconds.toFixed(2)} s`
                      : "Not available yet",
                  ],
                  ...(run.status === "Completed"
                    ? [
                        ["Frequent itemsets", run.execution.itemset_count],
                        ["Association rules", run.execution.rule_count],
                        ["Recommendations", run.execution.adjacency_count],
                      ]
                    : []),
                ].map(([t, v]) => (
                  <div key={t}>
                    <dt>{t}</dt>
                    <dd>{v ?? "—"}</dd>
                  </div>
                ))}
              </dl>
              {run.status === "Completed" && (
                <div className="button-group result-actions">
                  {[
                    ["View Association Rules", 5],
                    ["View Product Relationship Map", 6],
                    ["View Report", 7],
                  ].map(([t, s]) => (
                    <button
                      type="button"
                      className="button secondary"
                      key={s}
                      onClick={() => onNavigate(s)}
                    >
                      {t} →
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}
      <RunHistory datasets={datasets} selectedId={runId} onSelect={onRun} />
    </>
  );
}

function ExecutionElapsed({ started }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!started) return null;
  return (
    <p className="muted">
      Elapsed since worker start:{" "}
      {Math.max(0, Math.floor((now - new Date(started).getTime()) / 1000))} s
    </p>
  );
}

function ExecutionRename({ run }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const client = useQueryClient();
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const name = new FormData(event.currentTarget).get("name");
    try {
      const { data } = await api.patch(runPath(run.run_id), { name });
      client.setQueriesData(
        {
          predicate: (q) =>
            q.queryKey[1] === "run" && q.queryKey[2] === run.run_id,
        },
        data,
      );
      await client.invalidateQueries({
        predicate: (q) => q.queryKey[1] === "runs",
      });
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Popover
      label="Rename mining run"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button type="button" className="button secondary">
          Rename run
        </button>
      }
    >
      <form onSubmit={save}>
        <label>
          <span>Run name</span>
          <input name="name" required maxLength={120} defaultValue={run.name} />
        </label>
        {error && <Notice kind="error">{error}</Notice>}
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? "Saving run name…" : "Save run name"}
        </button>
      </form>
    </Popover>
  );
}
