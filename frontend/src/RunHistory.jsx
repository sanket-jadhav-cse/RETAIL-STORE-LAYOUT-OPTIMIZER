import { useEffect, useState } from "react";
import { useResource } from "./queries";
import { PageSkeleton, QueryError, Pager, SectionHeading, Status } from "./ui";
export function useDebounced(value, delay = 250) {
  const [debounced, set] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => set(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
export default function RunHistory({
  datasets,
  selectedId,
  onSelect,
  compact = false,
  onViewAll,
  datasetId,
}) {
  const [search, setSearch] = useState(""),
    [filters, setFilters] = useState({
      status: "",
      dataset: "",
      date: "",
      page: 1,
    });
  const query = useDebounced(search);
  const { status, dataset, date, page } = filters;
  const params = compact
    ? { page: 1, page_size: 5, dataset_id: datasetId || undefined }
    : {
        page,
        page_size: 10,
        search: query,
        status: status || undefined,
        dataset_id: dataset || undefined,
        created_from: date ? `${date}T00:00:00Z` : undefined,
        created_before: date
          ? new Date(
              new Date(`${date}T00:00:00Z`).getTime() + 86400000,
            ).toISOString()
          : undefined,
      };
  const history = useResource(
    ["runs", compact ? "recent" : "history", compact ? datasetId : "all"],
    "/runs",
    params,
    {
      enabled: !compact || !!datasetId,
      refetchInterval: (q) =>
        !compact &&
        q.state.data?.items?.some((r) =>
          ["Queued", "Running"].includes(r.status),
        )
          ? 1500
          : false,
    },
  );
  function filter(key, value) {
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  }
  return (
    <section className="panel history-panel">
      <SectionHeading
        title={compact ? "Recent mining runs" : "Run history"}
        action={
          compact && (
            <button type="button" className="text-button" onClick={onViewAll}>
              View All Runs →
            </button>
          )
        }
      />
      {!compact && (
        <div className="history-toolbar">
          <label className="history-search">
            <span>Search runs</span>
            <input
              type="search"
              maxLength={120}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                filter("page", 1);
              }}
              placeholder="Run name, dataset, date or ID…"
            />
          </label>
          <label>
            <span>Status</span>
            <select
              value={status}
              onChange={(e) => filter("status", e.target.value)}
            >
              <option value="">All statuses</option>
              {["Queued", "Running", "Completed", "Failed"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Dataset filter</span>
            <select
              value={dataset}
              onChange={(e) => filter("dataset", e.target.value)}
            >
              <option value="">All datasets</option>
              {datasets.map((d) => (
                <option value={d.dataset_id} key={d.dataset_id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Created on</span>
            <input
              type="date"
              value={date}
              onChange={(e) => filter("date", e.target.value)}
            />
          </label>
        </div>
      )}
      {history.isPending ? (
        <PageSkeleton />
      ) : history.isError ? (
        <QueryError query={history} />
      ) : (
        <>
          <div
            className="table-scroll"
            tabIndex="0"
            role="region"
            aria-label="Mining run history"
          >
            <table className="run-history-table">
              <caption className="sr-only">
                {compact
                  ? "Recent mining runs"
                  : "Searchable mining run history"}
              </caption>
              <thead>
                <tr>
                  <th>Run name</th>
                  {!compact && <th>Dataset</th>}
                  <th>Created</th>
                  <th>Support</th>
                  <th>Confidence</th>
                  <th>Rules</th>
                  <th>Pairs</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.data?.items?.map((r) => (
                  <tr
                    key={r.run_id}
                    className={r.run_id === selectedId ? "selected-row" : ""}
                  >
                    <td>
                      <button
                        className="text-button run-name"
                        type="button"
                        onClick={() => onSelect(r)}
                        aria-label={`Select run ${r.name}`}
                      >
                        {r.name}
                      </button>
                    </td>
                    {!compact && <td>{r.dataset_name}</td>}
                    <td>
                      <time dateTime={r.created_at}>
                        {new Date(r.created_at).toLocaleString()}
                      </time>
                    </td>
                    <td className="numeric">{r.min_support}</td>
                    <td className="numeric">{r.min_confidence}</td>
                    <td className="numeric">
                      {r.execution?.rule_count ?? "—"}
                    </td>
                    <td className="numeric">
                      {r.execution?.adjacency_count ?? "—"}
                    </td>
                    <td>
                      <Status status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!history.data?.items?.length && (
            <div className="empty-state">
              <h3>
                {query || status || dataset || date
                  ? "No matching runs"
                  : "No previous runs"}
              </h3>
              <p>
                {query || status || dataset || date
                  ? "Adjust the search or filters."
                  : "Start a mining run to save your first analysis."}
              </p>
            </div>
          )}
          {!compact && (
            <Pager
              page={page}
              setPage={(v) => filter("page", v)}
              total={history.data?.total || 0}
              size={10}
            />
          )}
        </>
      )}
    </section>
  );
}
