import { useState } from "react";
import { useResource } from "./queries";
import { downloadReport, errorMessage, runPath } from "./api";
import { useDebounced } from "./RunHistory";
import RunSelector from "./RunSelector";
import { ResultsScreen } from "./Results";
import { Notice, PageSkeleton, QueryError, Status } from "./ui";
import Icon from "./Icon";
import HelpTip from "./HelpTip";
export default function AnalyticsPage({
  screen,
  run,
  runId,
  runQuery,
  historyQuery,
  onRun,
  onNavigate,
}) {
  return (
    <>
      <section className="run-context">
        <RunSelector
          selectedId={runId}
          selectedName={run?.name}
          onSelect={onRun}
        />
        <div>
          {!run && <strong>Select a saved analysis</strong>}
          {run && (
            <span className="muted">
              {new Date(run.created_at).toLocaleString()} · Support{" "}
              {run.min_support} · Confidence {run.min_confidence} · Lift{" "}
              {run.min_lift}
            </span>
          )}
        </div>
        {run && <Status status={run.status} />}
      </section>
      {runQuery.isError ? (
        <QueryError query={runQuery} />
      ) : historyQuery.isError && !runId ? (
        <QueryError query={historyQuery} />
      ) : runQuery.isFetching && !run ? (
        <PageSkeleton />
      ) : run?.status !== "Completed" ? (
        <Notice title={run ? "Results are not ready" : "No previous runs"}>
          {run
            ? `This run is ${run.status.toLowerCase()}. Open Mining Execution to inspect its status.`
            : "Start an analysis or select a completed saved run."}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => onNavigate(run ? 4 : 3)}
          >
            {run ? "View Mining Execution" : "New Mining Run"}
          </button>
        </Notice>
      ) : (
        <ResultData
          key={`${screen}-${runId}`}
          screen={screen}
          run={run}
          runId={runId}
        />
      )}
    </>
  );
}
function ResultData({ screen, run, runId }) {
  const [filters, setFilters] = useState({
      page: 1,
      query: "",
      support: 0,
      confidence: 0,
      lift: 0,
      sort: "lift",
    }),
    [search, setSearch] = useState(""),
    [exporting, setExporting] = useState(false),
    [error, setError] = useState("");
  const query = useDebounced(search);
  const current = { ...filters, query };
  const path = screen === 5 ? "rules" : screen === 6 ? "adjacencies" : "report";
  const result = useResource(
    ["results", runId, path],
    runPath(runId, path),
    {
      page: current.page,
      page_size: 10,
      search: query,
      min_support: current.support,
      min_confidence: current.confidence,
      min_lift: current.lift,
      sort: current.sort,
    },
    { placeholderData: (previous) => previous },
  );
  const change = (key, value) =>
    setFilters((f) => ({
      ...f,
      [key]: value,
      page: key === "page" ? value : 1,
    }));
  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      await downloadReport(runId);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      {screen === 7 && (
        <div className="report-heading-row">
          <span className="muted">
            {result.data?.dataset?.name || "Recommendation evidence"}
            {result.data?.dataset?.transaction_start
              ? ` · ${result.data.dataset.transaction_start} – ${result.data.dataset.transaction_end}`
              : ""}
          </span>
          <HelpTip label="Report dataset and date range">Dataset used for this report and the transaction date range found in its records.</HelpTip>
          <button
            type="button"
            className="button primary"
            onClick={exportCsv}
            disabled={exporting}
          >
            <Icon name="download" />
            {exporting ? "Exporting report…" : "Export complete CSV"}
          </button>
        </div>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      {result.isError ? (
        <QueryError query={result} />
      ) : (
        <ResultsScreen
          screen={screen - 2}
          runId={runId}
          run={run}
          result={result.data}
          loading={result.isFetching}
          page={filters.page}
          setPage={(v) => change("page", v)}
          search={search}
          setSearch={(v) => {
            setSearch(v);
            change("page", 1);
          }}
          support={filters.support}
          setSupport={(v) => change("support", v)}
          confidence={filters.confidence}
          setConfidence={(v) => change("confidence", v)}
          lift={filters.lift}
          setLift={(v) => change("lift", v)}
          sort={filters.sort}
          setSort={(v) => change("sort", v)}
        />
      )}
    </>
  );
}
