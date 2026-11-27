import Icon from "./Icon";
export function DatasetQuality({ dataset }) {
  const original = dataset?.summary?.original_records,
    cleaned = dataset?.summary?.cleaned_records;
  const retained = original && cleaned != null ? cleaned / original : null;
  return (
    <div className="quality-visual">
      <div className="quality-ring">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle className="ring-track" cx="60" cy="60" r="50" />
          <circle
            className="ring-value"
            cx="60"
            cy="60"
            r="50"
            pathLength="100"
            strokeDasharray={`${retained == null ? 0 : retained * 100} 100`}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div>
          <strong>
            {retained == null ? "—" : `${(retained * 100).toFixed(1)}%`}
          </strong>
          <span>rows retained</span>
        </div>
      </div>
      <div>
        <h3>Ready for invoice-level analysis</h3>
        <p className="muted">
          {cleaned == null || original == null
            ? "Import a dataset to inspect its quality."
            : `${cleaned.toLocaleString()} cleaned records from ${original.toLocaleString()} source rows.`}
        </p>
        <p className="quality-note">
          <Icon name="shield" />
          Customer identifiers are not required.
        </p>
      </div>
    </div>
  );
}
