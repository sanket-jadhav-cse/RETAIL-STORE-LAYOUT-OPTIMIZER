import { useEffect, useState } from "react";
import { api, errorMessage, downloadReport } from "./api";
import Graph, { pct, PairDetails } from "./Graph";
const pages = [
  "Dashboard",
  "Dataset",
  "Configure mining",
  "Association rules",
  "Layout visualization",
  "Recommendation report",
];
const headings = [
  "Purchase patterns, made practical.",
  "Know your source data.",
  "Find meaningful relationships.",
  "Inspect the evidence.",
  "Explore product connections.",
  "Recommendations with context.",
];
function Pager({ page, setPage, total, size = 25 }) {
  return (
    <div className="flex gap-4 items-center mt-5">
      <button disabled={page === 1} onClick={() => setPage(page - 1)}>
        Previous
      </button>
      <span className="muted">
        Page {page} · {total} results
      </span>
      <button disabled={page * size >= total} onClick={() => setPage(page + 1)}>
        Next
      </button>
    </div>
  );
}
function Notice({ children }) {
  return (
    <p role="status" className="panel my-4">
      {children}
    </p>
  );
}
export default function App() {
  const [screen, setScreen] = useState(0),
    [datasets, setDatasets] = useState([]),
    [datasetId, setDatasetId] = useState(""),
    [run, setRun] = useState(null),
    [runId, setRunId] = useState(
      window.localStorage.getItem("retailRun") || "",
    ),
    [runInput, setRunInput] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [result, setResult] = useState(null),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [lift, setLift] = useState(0),
    [sort, setSort] = useState("lift"),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [params, setParams] = useState({
      min_support: 0.02,
      min_confidence: 0.5,
      min_lift: 1,
      max_itemset_size: 3,
    });
  const dataset = datasets.find((d) => d.dataset_id === datasetId);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .get("/datasets")
      .then(({ data }) => {
        if (active) {
          setDatasets(data);
          setDatasetId((id) => id || data[0]?.dataset_id || "");
          setRunId((id) => id || data[0]?.latest_run_id || "");
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (!runId) return;
    let active = true,
      timer;
    const poll = () =>
      api
        .get(`/runs/${runId}`)
        .then(({ data }) => {
          if (active) {
            setRun(data);
            if (data.dataset_id) setDatasetId(data.dataset_id);
            window.localStorage.setItem("retailRun", runId);
            if (["Queued", "Running"].includes(data.status))
              timer = setTimeout(poll, 1500);
          }
        })
        .catch((e) => {
          if (active) setError(errorMessage(e));
        });
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [runId, refresh]);
  useEffect(() => {
    setPage(1);
    setResult(null);
  }, [screen, runId, search, lift, sort]);
  useEffect(() => {
    if (run?.status !== "Completed" || screen < 3) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const path =
      screen === 3 ? "rules" : screen === 4 ? "adjacencies" : "report";
    api
      .get(`/runs/${runId}/${path}`, {
        params: { page, page_size: 25, search, min_lift: lift, sort },
        signal: controller.signal,
      })
      .then(({ data }) => setResult(data))
      .catch((e) => {
        if (e.code !== "ERR_CANCELED") setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [screen, runId, run?.status, page, search, lift, sort]);
  const navigate = (i) => {
    setResult(null);
    setScreen(i);
    setError("");
    setPage(1);
  };
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(
        "/runs",
        {
          ...params,
          max_itemset_size:
            params.max_itemset_size === ""
              ? null
              : Number(params.max_itemset_size),
          dataset_id: datasetId,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setRun(data);
      setRunId(data.run_id);
      setToken("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const rows = screen === 5 ? result?.recommendations?.items : result?.items;
  return (
    <div className="min-h-screen md:flex">
      <aside className="md:w-64 bg-slate-950 text-slate-200 p-6 md:fixed md:h-screen">
        <div className="font-semibold text-2xl text-white">
          Retail<span className="text-teal-400">Atlas</span>
        </div>
        <p className="text-sm text-slate-400 mt-2 mb-10">STORE INTELLIGENCE</p>
        <nav
          aria-label="Main navigation"
          className="flex flex-wrap md:flex-col gap-2"
        >
          {pages.map((p, i) => (
            <button
              key={p}
              aria-current={screen === i ? "page" : undefined}
              onClick={() => navigate(i)}
              className={`text-left text-sm ${screen === i ? "bg-teal-700" : "bg-transparent hover:bg-slate-800"}`}
            >
              {p}
            </button>
          ))}
        </nav>
        <p className="text-sm text-slate-400 mt-10">
          FP-Growth · Evidence-based planning
          <br />
          Sanket Jadhav
        </p>
      </aside>
      <main className="md:ml-64 p-5 md:p-10 w-full max-w-screen-2xl">
        <header className="flex flex-wrap justify-between gap-4 mb-8">
          <div>
            <p className="text-teal-800 text-sm font-semibold uppercase tracking-widest mb-2">
              {pages[screen]}
            </p>
            <h1>{headings[screen]}</h1>
          </div>
          <button
            className="self-start"
            onClick={() => {
              setError("");
              setRefresh((x) => x + 1);
            }}
          >
            Refresh
          </button>
        </header>
        <div className="panel controls">
          <label>
            Dataset
            <select
              value={datasetId}
              onChange={(e) => {
                const id = e.target.value;
                setDatasetId(id);
                setRun(null);
                setResult(null);
                setRunId(
                  datasets.find((d) => d.dataset_id === id)?.latest_run_id ||
                    "",
                );
                window.localStorage.removeItem("retailRun");
              }}
            >
              <option value="">Select a dataset</option>
              {datasets.map((d) => (
                <option key={d.dataset_id} value={d.dataset_id}>
                  {d.version} · {d.basket_count.toLocaleString()} baskets
                </option>
              ))}
            </select>
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setRun(null);
              setResult(null);
              setError("");
              setRunId(runInput.trim());
            }}
            className="flex flex-wrap gap-2 items-end"
          >
            <label>
              Retrieve persisted run
              <input
                placeholder="Run UUID"
                value={runInput}
                onChange={(e) => setRunInput(e.target.value)}
              />
            </label>
            <button disabled={!runInput.trim()}>Load run</button>
          </form>
        </div>
        {error && (
          <div role="alert" className="panel border-red-300 text-red-800 mb-4">
            {error}
          </div>
        )}
        {loading && <Notice>Loading data…</Notice>}
        {!loading && !datasets.length && (
          <Notice>
            No dataset imported. Run the controlled backend import script to get
            started.
          </Notice>
        )}
        {run && (
          <p className="muted mb-5">
            Run {run.run_id} · {run.status} · Dataset {run.dataset_id}
            {run.error && ` · ${run.error}`}
          </p>
        )}
        {screen === 0 && (
          <>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {[
                ["Available datasets", datasets.length],
                ["Eligible transactions", dataset?.basket_count],
                ["Products", dataset?.summary.product_count],
                ["Frequent itemsets", run?.execution.itemset_count],
                ["Association rules", run?.execution.rule_count],
                ["Recommended pairs", run?.execution.adjacency_count],
              ].map(([title, value]) => (
                <div key={title} className="metric">
                  <span className="muted">{title}</span>
                  <strong>
                    {value == null ? "—" : value.toLocaleString()}
                  </strong>
                </div>
              ))}
            </div>
            <section className="panel mt-6">
              <h2>Turn purchase history into planning evidence</h2>
              <p className="mb-5">
                Select a dataset, configure thresholds, and inspect the
                resulting associations. Recommendations suggest adjacency
                candidates; they do not guarantee sales improvements.
              </p>
              <button onClick={() => navigate(2)}>
                Configure a mining run
              </button>
            </section>
          </>
        )}
        {screen === 1 && dataset && (
          <section className="panel">
            <h2>{dataset.source}</h2>
            <p className="muted mb-6">
              Version {dataset.version} · Imported{" "}
              {new Date(dataset.imported_at).toLocaleString()}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full">
                <tbody>
                  {Object.entries(dataset.summary)
                    .filter(([k]) => k !== "excluded")
                    .map(([k, v]) => (
                      <tr key={k}>
                        <th>{k.replaceAll("_", " ")}</th>
                        <td>{String(v)}</td>
                      </tr>
                    ))}
                  {Object.entries(dataset.summary.excluded || {}).map(
                    ([k, v]) => (
                      <tr key={k}>
                        <th>Excluded: {k.replaceAll("_", " ")}</th>
                        <td>{v}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {screen === 2 && (
          <section className="panel">
            <h2>FP-Growth configuration</h2>
            <p className="muted mb-6">
              Lower support can produce many patterns and require more memory.
              Itemset size limits pattern complexity without removing baskets.
            </p>
            <form onSubmit={submit} className="grid sm:grid-cols-2 gap-5">
              {[
                ["min_support", "Minimum support", 0.0001, 1, 0.0001],
                ["min_confidence", "Minimum confidence", 0.0001, 1, 0.0001],
                ["min_lift", "Minimum lift", 0, 1000000, 0.01],
                [
                  "max_itemset_size",
                  "Maximum itemset size (optional)",
                  1,
                  8,
                  1,
                ],
              ].map(([key, title, min, max, step]) => (
                <label key={key}>
                  {title}
                  <input
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
              ))}
              <label>
                Operator token
                <input
                  aria-label="Operator token"
                  type="password"
                  autoComplete="off"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
                <span className="muted">
                  Used for this request only; never saved in browser storage.
                </span>
              </label>
              <div className="self-end">
                <button
                  disabled={
                    busy ||
                    !datasetId ||
                    ["Queued", "Running"].includes(run?.status)
                  }
                >
                  {busy ? "Submitting…" : "Run FP-Growth"}
                </button>
              </div>
            </form>
          </section>
        )}
        {screen >= 3 && run?.status !== "Completed" && (
          <Notice>Select a completed run to inspect results.</Notice>
        )}
        {screen >= 3 && run?.status === "Completed" && (
          <section className="panel">
            {screen < 5 && (
              <div className="controls">
                {screen === 3 && (
                  <>
                    <label>
                      Search products
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <label>
                      Sort by
                      <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        {["lift", "support", "confidence"].map((s) => (
                          <option key={s}>{s}</option>
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
                    onChange={(e) =>
                      setLift(Math.max(0, Number(e.target.value)))
                    }
                  />
                </label>
              </div>
            )}
            {!loading && rows?.length === 0 && (
              <Notice>No qualifying results. Try different thresholds.</Notice>
            )}
            {screen === 3 && rows?.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      {[
                        "Antecedent",
                        "Consequent",
                        "Support",
                        "Confidence",
                        "Lift",
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.rule_id}>
                        <td>
                          {r.antecedent_names.join(" + ")}
                          <small className="block muted">
                            {r.antecedent.join(", ")}
                          </small>
                        </td>
                        <td>
                          {r.consequent_names.join(" + ")}
                          <small className="block muted">
                            {r.consequent.join(", ")}
                          </small>
                        </td>
                        <td>{pct(r.support)}</td>
                        <td>{pct(r.confidence)}</td>
                        <td>{r.lift.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {screen === 4 && rows?.length > 0 && <Graph pairs={rows} />}
            {screen === 5 && result && (
              <>
                <h2>Recommendation evidence</h2>
                <p className="mb-3">
                  {result.dataset.source} · {result.dataset.version}
                </p>
                <p className="muted mb-3">
                  Support ≥ {result.run.min_support}; confidence ≥{" "}
                  {result.run.min_confidence}; lift ≥ {result.run.min_lift}.
                  Maximum itemset size:{" "}
                  {result.run.max_itemset_size ?? "unbounded"}. Runtime:{" "}
                  {result.run.execution.elapsed_seconds?.toFixed(2)} seconds.
                </p>
                <p className="mb-5">{result.review}</p>
                <button
                  onClick={() =>
                    downloadReport(runId).catch((e) =>
                      setError(errorMessage(e)),
                    )
                  }
                >
                  Export complete CSV report
                </button>
                <div className="space-y-6 mt-6">
                  {rows?.map((p) => (
                    <article key={p.rank} className="border-t pt-5">
                      <p className="muted">
                        Rank {p.rank} · {p.product_a} / {p.product_b}
                      </p>
                      <PairDetails pair={p} />
                    </article>
                  ))}
                </div>
              </>
            )}
            {result && (
              <Pager
                page={page}
                setPage={setPage}
                total={
                  screen === 5 ? result.recommendations.total : result.total
                }
              />
            )}
          </section>
        )}
        <footer className="muted mt-10">
          Retail Store Layout Optimizer · FP-Growth · Conceptual decision
          support
        </footer>
      </main>
    </div>
  );
}
