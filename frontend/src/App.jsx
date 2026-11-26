import { useEffect, useRef, useState } from "react";
import { api, errorMessage, downloadReport, runPath } from "./api";
import Icon from "./Icon";
import Overview from "./Overview";
import { DatasetScreen, MiningScreen, ResultsScreen } from "./Results";
import { Notice, Status } from "./ui";
import { useTheme } from "./theme";

const pages = [
  "Dashboard",
  "Dataset",
  "Configure mining",
  "Association rules",
  "Layout visualization",
  "Recommendation report",
];
const pageIcons = ["grid", "database", "sliders", "rules", "network", "report"];
const headings = [
  "Purchase patterns, made practical.",
  "Know your source data.",
  "Find meaningful relationships.",
  "Inspect the evidence.",
  "Explore product connections.",
  "Recommendations with context.",
];
const descriptions = [
  "A clearer picture of what your customers buy together.",
  "Understand the source and quality behind every recommendation.",
  "Configure your analysis and uncover patterns in purchase history.",
  "Turn association metrics into informed merchandising decisions.",
  "See the connections behind your next product display.",
  "A practical evidence trail for your merchandising review.",
];
export default function App() {
  const [screen, setScreen] = useState(0),
    [datasets, setDatasets] = useState([]),
    [datasetId, setDatasetId] = useState(""),
    [run, setRun] = useState(null),
    [runId, setRunId] = useState(
      () => window.localStorage.getItem("retailRun") || "",
    ),
    [runInput, setRunInput] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [result, setResult] = useState(null),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [searchQuery, setSearchQuery] = useState(""),
    [lift, setLift] = useState(0),
    [sort, setSort] = useState("lift"),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [params, setParams] = useState({
      min_support: 0.02,
      min_confidence: 0.5,
      min_lift: 1,
      max_itemset_size: 3,
    }),
    [theme, toggleTheme] = useTheme(),
    [menuOpen, setMenuOpen] = useState(false),
    [overviewPairs, setOverviewPairs] = useState(null),
    [overviewError, setOverviewError] = useState(false),
    [exporting, setExporting] = useState(false),
    [feedback, setFeedback] = useState("");
  const heading = useRef(null),
    focusNextPage = useRef(false);
  const dataset = datasets.find((d) => d.dataset_id === datasetId);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    document.title = `${pages[screen]} · RetailAtlas`;
    if (focusNextPage.current) {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo?.({ top: 0, behavior: "instant" });
      focusNextPage.current = false;
    }
  }, [screen]);
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
    const poll = async () => {
      try {
        const { data } = await api.get(runPath(runId));
        if (active) {
          setRun(data);
          if (data.dataset_id) setDatasetId(data.dataset_id);
          window.localStorage.setItem("retailRun", runId);
          if (["Queued", "Running"].includes(data.status))
            timer = setTimeout(poll, 1500);
        }
      } catch (error) {
        if (active) setError(errorMessage(error));
      }
    };
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [runId, refresh]);
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setPage(1);
  }, [screen, runId, searchQuery, lift, sort]);
  useEffect(() => {
    if (run?.status !== "Completed" || screen < 3) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const path =
      screen === 3 ? "rules" : screen === 4 ? "adjacencies" : "report";
    api
      .get(runPath(runId, path), {
        params: {
          page,
          page_size: 25,
          search: searchQuery,
          min_lift: lift,
          sort,
        },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (!controller.signal.aborted) setResult(data);
      })
      .catch((e) => {
        if (e.code !== "ERR_CANCELED") setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [screen, runId, run?.status, page, searchQuery, lift, sort]);
  useEffect(() => {
    setOverviewPairs(null);
    setOverviewError(false);
    if (run?.status !== "Completed") return;
    const controller = new AbortController();
    api
      .get(runPath(runId, "adjacencies"), {
        params: { page: 1, page_size: 3 },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (!controller.signal.aborted) setOverviewPairs(data.items || []);
      })
      .catch((error) => {
        if (error.code !== "ERR_CANCELED") {
          setOverviewError(true);
          setOverviewPairs([]);
        }
      });
    return () => controller.abort();
  }, [runId, run?.status, refresh]);
  function navigate(index) {
    if (index === screen) {
      setMenuOpen(false);
      heading.current?.focus({ preventScroll: true });
      return;
    }
    setResult(null);
    setScreen(index);
    setError("");
    setFeedback("");
    setPage(1);
    setMenuOpen(false);
    focusNextPage.current = index !== screen;
  }
  function chooseDataset(id) {
    setDatasetId(id);
    setRun(null);
    setResult(null);
    setOverviewPairs(null);
    setOverviewError(false);
    setRunId(datasets.find((d) => d.dataset_id === id)?.latest_run_id || "");
    window.localStorage.removeItem("retailRun");
    setError("");
  }
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setFeedback("");
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
      setFeedback("Mining run submitted. Its status will update here.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function exportReport() {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      await downloadReport(runId);
      setFeedback("Your recommendation report has been downloaded.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand">
            <span className="brand-mark">
              <Icon name="grid" />
            </span>
            <div>
              <span>RetailAtlas</span>
              <small>Retail intelligence</small>
            </div>
          </div>
          <button
            type="button"
            className="icon-button menu-toggle"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            aria-controls="main-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Icon name={menuOpen ? "close" : "menu"} />
          </button>
        </div>
        <div className="sidebar-body" data-open={menuOpen}>
          <p className="nav-label">Workspace</p>
          <nav id="main-navigation" aria-label="Main navigation">
            {pages.map((name, index) => (
              <button
                type="button"
                key={name}
                onClick={() => navigate(index)}
                aria-current={screen === index ? "page" : undefined}
                className={`nav-item ${screen === index ? "active" : ""}`}
              >
                <Icon name={pageIcons[index]} />
                <span>{name}</span>
                {screen === index && (
                  <span className="nav-indicator" aria-hidden="true" />
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-note">
            <span className="sidebar-note-icon">
              <Icon name="network" />
            </span>
            <h2>Built on evidence.</h2>
            <p>Find useful connections in purchase history with FP-Growth.</p>
            <span className="sidebar-tag">Conceptual adjacency</span>
          </div>
          <div className="sidebar-profile">
            <span className="avatar">SJ</span>
            <div>
              <strong>Sanket Jadhav</strong>
              <small>Retail analytics project</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <div className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span aria-hidden="true">/</span>
            <strong>{pages[screen]}</strong>
          </div>
          <div className="topbar-actions">
            <span className="engine-label">
              <Icon name="layers" />
              FP-Growth
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
              title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
              onClick={toggleTheme}
            >
              <Icon name={theme === "light" ? "moon" : "sun"} />
            </button>
            <span className="topbar-avatar" aria-label="Sanket Jadhav">
              SJ
            </span>
          </div>
        </div>
        <main id="main-content" className="main-content">
          <header className="page-header">
            <div>
              <span className="eyebrow">{pages[screen]}</span>
              <h1 ref={heading} tabIndex="-1">
                {headings[screen]}
              </h1>
              <p>{descriptions[screen]}</p>
            </div>
            <button
              type="button"
              className="button secondary refresh-button"
              onClick={() => {
                setError("");
                setFeedback("");
                setRefresh((n) => n + 1);
              }}
            >
              <Icon name="refresh" />
              Refresh
            </button>
          </header>
          <section className="context-bar" aria-label="Analysis selection">
            <label className="dataset-picker">
              <span>
                <Icon name="database" />
                Dataset
              </span>
              <select
                aria-label="Dataset"
                value={datasetId}
                onChange={(e) => chooseDataset(e.target.value)}
              >
                <option value="">Select a dataset</option>
                {datasets.map((d) => (
                  <option key={d.dataset_id} value={d.dataset_id}>
                    {d.version} · {d.basket_count.toLocaleString()} baskets
                  </option>
                ))}
              </select>
            </label>
            <details className="load-run">
              <summary>
                Load a previous run
                <Icon name="chevron" />
              </summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setRun(null);
                  setResult(null);
                  setError("");
                  setRunId(runInput.trim());
                }}
              >
                <label>
                  Retrieve persisted run
                  <input
                    placeholder="Paste a run UUID"
                    required
                    value={runInput}
                    onChange={(e) => setRunInput(e.target.value)}
                  />
                </label>
                <button type="submit" className="button secondary">
                  Load run
                </button>
              </form>
            </details>
          </section>
          <output className="announcement sr-only">
            {feedback || (run ? `Mining status: ${run.status}` : "")}
          </output>
          {error && (
            <Notice kind="error" title="We couldn’t complete that request">
              {error} Use Refresh to retry, or check your connection and inputs.
            </Notice>
          )}
          {feedback && <Notice kind="success">{feedback}</Notice>}
          <output className="loading-slot">
            {loading ? "Loading data…" : ""}
          </output>
          {!loading && !datasets.length && (
            <Notice title="Start with your transaction data">
              No dataset imported. Use the dataset setup instructions to import
              Online Retail, then refresh this page.
            </Notice>
          )}
          {run && (
            <div className="run-status-row">
              <Status status={run.status} />
              <span className="muted">Selected analysis</span>
              {run.execution?.elapsed_seconds != null && (
                <span className="run-duration">
                  <Icon name="clock" />
                  {run.execution.elapsed_seconds.toFixed(2)} s
                </span>
              )}
              <details className="run-details">
                <summary>
                  Run details
                  <Icon name="chevron" />
                </summary>
                <div>
                  <p>Run {run.run_id}</p>
                  <p>Dataset {run.dataset_id}</p>
                </div>
              </details>
              {run.error && <span className="run-error">{run.error}</span>}
            </div>
          )}
          <div className="page-content">
            {screen === 0 && (
              <Overview
                dataset={dataset}
                datasets={datasets}
                run={run}
                pairs={overviewPairs}
                pairsError={overviewError}
                onNavigate={navigate}
              />
            )}
            {screen === 1 && <DatasetScreen dataset={dataset} />}
            {screen === 2 && (
              <MiningScreen
                params={params}
                setParams={setParams}
                token={token}
                setToken={setToken}
                busy={busy}
                datasetId={datasetId}
                run={run}
                onSubmit={submit}
              />
            )}
            {screen >= 3 && (
              <ResultsScreen
                screen={screen}
                runId={runId}
                run={run}
                result={result}
                loading={loading}
                page={page}
                setPage={setPage}
                search={search}
                setSearch={setSearch}
                lift={lift}
                setLift={setLift}
                sort={sort}
                setSort={setSort}
                onExport={exportReport}
                exporting={exporting}
              />
            )}
          </div>
          <footer className="page-footer">
            <span>
              RetailAtlas <span aria-hidden="true">·</span> Retail Store Layout
              Optimizer
            </span>
            <span>
              <Icon name="shield" />
              Evidence-based planning
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
