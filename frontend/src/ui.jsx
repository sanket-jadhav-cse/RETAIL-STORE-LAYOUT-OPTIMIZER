import Icon from "./Icon";
export function Status({ status }) {
  return (
    <span className={`status status-${(status || "idle").toLowerCase()}`}>
      <Icon name={{ Completed: "check", Failed: "close" }[status] || "clock"} />
      {status || "No run selected"}
    </span>
  );
}
export function Notice({ children, kind = "info", title }) {
  const Element = kind === "error" ? "div" : "output";
  return (
    <Element
      className={`notice notice-${kind}`}
      role={kind === "error" ? "alert" : undefined}
    >
      <Icon name="info" />
      <span className="notice-content">
        {title && <strong>{title}</strong>}
        <span>{children}</span>
      </span>
    </Element>
  );
}
export function SectionHeading({ eyebrow, title, children, action }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {children && <p className="muted">{children}</p>}
      </div>
      {action}
    </div>
  );
}
export function Pager({ page, setPage, total, size = 25 }) {
  return (
    <div className="pager">
      <span className="muted">
        Page {page} <span aria-hidden="true">·</span> {total.toLocaleString()}{" "}
        results
      </span>
      <div className="button-group">
        <button
          type="button"
          className="button secondary"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={page * size >= total}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
export function EmptyResults({ children }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name="search" />
      </span>
      <h2>No qualifying results</h2>
      <p>
        {children ||
          "Try a lower lift filter, or create a new run with different thresholds."}
      </p>
    </div>
  );
}
