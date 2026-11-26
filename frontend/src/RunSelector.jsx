import { useEffect, useId, useState } from "react";
import { api, errorMessage, runPath } from "./api";
import { Popover } from "./overlays";
import { Notice, Pager, Status } from "./ui";
import Icon from "./Icon";

export default function RunSelector({
  selectedId,
  onSelect,
  datasets = [],
  refresh = 0,
  inline = false,
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [dataset, setDataset] = useState(""),
    [date, setDate] = useState(""),
    [page, setPage] = useState(1),
    [result, setResult] = useState(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [active, setActive] = useState(0),
    [selecting, setSelecting] = useState(false);
  const listId = useId();
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!open && !inline) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setActive(0);
    let created_before;
    if (date) {
      const day = new Date(`${date}T00:00:00Z`);
      day.setUTCDate(day.getUTCDate() + 1);
      created_before = day.toISOString();
    }
    api
      .get("/runs", {
        params: {
          search: query,
          page,
          page_size: 10,
          status: status || undefined,
          dataset_id: dataset || undefined,
          created_from: date ? `${date}T00:00:00Z` : undefined,
          created_before,
        },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (!controller.signal.aborted) setResult(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, inline, query, status, dataset, date, page, retry, refresh]);
  async function select(run) {
    if (selecting || loading) return;
    setSelecting(true);
    setError("");
    try {
      const { data } = await api.get(runPath(run.run_id));
      await onSelect(data);
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSelecting(false);
    }
  }
  function filter(setter, value) {
    setter(value);
    setPage(1);
  }
  function keyDown(e) {
    const rows = result?.items || [];
    if (!rows.length || loading) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next =
        (active + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
      setActive(next);
      if (e.target.getAttribute("role") === "option")
        document.getElementById(`${listId}-${next}`)?.focus();
      document
        .getElementById(`${listId}-${next}`)
        ?.scrollIntoView?.({ block: "nearest" });
    }
    if (e.key === "Enter") {
      e.preventDefault();
      select(rows[active]);
    }
  }
  const content = (
    <>
      <label>
        Search previous runs
        <input
          type="search"
          role="combobox"
          aria-expanded={open || inline}
          aria-controls={listId}
          aria-activedescendant={
            result?.items?.[active] ? `${listId}-${active}` : undefined
          }
          aria-autocomplete="list"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={keyDown}
          placeholder="Run name, dataset, date or UUID…"
          maxLength={120}
        />
      </label>
      <div className="history-filters">
        <label>
          Status
          <select
            value={status}
            onChange={(e) => filter(setStatus, e.target.value)}
          >
            <option value="">All statuses</option>
            {["Queued", "Running", "Completed", "Failed"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Filter runs by dataset
          <select
            value={dataset}
            onChange={(e) => filter(setDataset, e.target.value)}
          >
            <option value="">All datasets</option>
            {datasets.map((d) => (
              <option key={d.dataset_id} value={d.dataset_id}>
                {d.name || d.version}
              </option>
            ))}
          </select>
        </label>
        <label>
          Created on
          <input
            type="date"
            value={date}
            onChange={(e) => filter(setDate, e.target.value)}
          />
        </label>
      </div>
      {error && (
        <Notice kind="error">
          {error}
          <button
            type="button"
            className="text-button"
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry
          </button>
        </Notice>
      )}
      <p className="eyebrow">Recent runs</p>
      {loading && (
        <div
          role="status"
          aria-label="Loading previous runs"
          className="skeleton-list"
        >
          {[1, 2, 3].map((n) => (
            <div className="skeleton" key={n} />
          ))}
        </div>
      )}
      {!loading && !error && result?.items?.length === 0 && (
        <p className="muted">
          {query || status || dataset || date
            ? "No matching mining runs."
            : "No previous runs yet. Start a mining run to save your first analysis."}
        </p>
      )}
      <div
        role="listbox"
        id={listId}
        aria-label="Previous mining runs"
        className="run-list"
        aria-busy={loading}
      >
        {!loading &&
          !error &&
          result?.items?.map((r, i) => (
            <button
              type="button"
              role="option"
              id={`${listId}-${i}`}
              aria-selected={r.run_id === selectedId}
              tabIndex={0}
              disabled={selecting}
              key={r.run_id}
              className={`run-option ${active === i ? "keyboard-active" : ""}`}
              onFocus={() => setActive(i)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") keyDown(e);
              }}
              onClick={() => select(r)}
            >
              <strong>{r.name}</strong>
              <span className="muted">{r.dataset_name}</span>
              <span className="muted">
                {r.execution?.rule_count ?? "—"} rules ·{" "}
                {r.execution?.adjacency_count ?? "—"} recommendations
              </span>
              <span className="run-option-footer">
                <Status status={r.status} />
                <time dateTime={r.created_at}>
                  {new Date(r.created_at).toLocaleString()}
                </time>
                {r.run_id === selectedId && <span>Selected</span>}
              </span>
            </button>
          ))}
      </div>
      {!loading && !error && result?.total > 10 && (
        <Pager page={page} setPage={setPage} total={result.total} size={10} />
      )}
      {selecting && <p role="status">Loading selected analysis…</p>}
    </>
  );
  return inline ? (
    <section className="panel run-history">
      <h2>Previous mining runs</h2>
      {content}
    </section>
  ) : (
    <Popover
      open={open}
      onOpenChange={setOpen}
      className="run-selector"
      label="Load a previous run"
      trigger={
        <button type="button" className="button secondary">
          <Icon name="clock" />
          Load a previous run
          <Icon name="chevron" />
        </button>
      }
    >
      {content}
    </Popover>
  );
}
