import HelpTip from "./HelpTip";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "./api";
import { useResource } from "./queries";
import Icon from "./Icon";
import { Notice, QueryError } from "./ui";
const fields = [
  "InvoiceNo",
  "StockCode",
  "Quantity",
  "Description",
  "InvoiceDate",
  "UnitPrice",
  "Country",
];
export default function DatasetUpload({ onReady, onNavigate }) {
  const configuration = useResource(["upload-config"], "/upload-config");
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [file, setFile] = useState(null),
    [stage, setStage] = useState(0),
    [preview, setPreview] = useState(null),
    [mapping, setMapping] = useState({}),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [progress, setProgress] = useState(null),
    [error, setError] = useState(""),
    [ready, setReady] = useState(null),
    [dragging, setDragging] = useState(false);
  const input = useRef(null),
    inFlight = useRef(false),
    client = useQueryClient();
  const max = configuration.data?.max_bytes;
  function choose(next) {
    if (busy || !next) return;
    setError("");
    setPreview(null);
    setReady(null);
    setStage(0);
    setProgress(null);
    const extension = next.name.split(".").pop().toLowerCase();
    if (!["csv", "xlsx"].includes(extension)) {
      setError("Select a CSV or XLSX file.");
      return;
    }
    if (next.size === 0) {
      setError("The selected file is empty.");
      return;
    }
    if (max && next.size > max) {
      setError(
        `Select a file smaller than ${(max / 1024 ** 2).toFixed(0)} MiB.`,
      );
      return;
    }
    setFile(next);
    if (!name)
      setName(
        next.name
          .replace(/\.[^.]+$/, "")
          .replaceAll("_", " ")
          .slice(0, 200),
      );
  }
  async function action(e) {
    e.preventDefault();
    if (inFlight.current || !file) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setProgress(null);
    const extension = file.name.split(".").pop().toLowerCase();
    try {
      if (stage === 0) {
        setStatus("Validating file…");
        const { data } = await api.post("/datasets/preview", file, {
          params: { format: extension },
          headers: { "Content-Type": "application/octet-stream" },
          timeout: 150000,
        });
        setPreview(data);
        setMapping(data.mapping || {});
        setStage(1);
      } else {
        setStatus("Uploading dataset…");
        const { data } = await api.post("/datasets", file, {
          params: {
            format: extension,
            name: name.trim(),
            description,
            mapping: JSON.stringify(mapping),
          },
          headers: { "Content-Type": "application/octet-stream" },
          timeout: 150000,
          onUploadProgress: (event) => {
            if (event.total)
              setProgress(Math.round((event.loaded / event.total) * 100));
            if (event.loaded >= event.total) setStatus("Processing dataset…");
          },
        });
        setReady(data);
        setStage(3);
        onReady(data);
        await client.invalidateQueries({
          predicate: (q) => q.queryKey[1] === "datasets",
        });
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      inFlight.current = false;
      setStatus("");
    }
  }
  return (
    <div className="upload-layout">
      <section className="panel upload-main">
        <ol className="upload-steps" aria-label="Upload steps">
          {["Select file", "Validate & map", "Processing", "Ready"].map(
            (title, i) => (
              <li
                key={title}
                aria-current={
                  i === (busy && stage === 1 ? 2 : stage) ? "step" : undefined
                }
              >
                <span>{i < stage ? "✓" : i + 1}</span>
                {title}
              </li>
            ),
          )}
        </ol>
        {configuration.isError && <QueryError query={configuration} />}
        <form onSubmit={action}>
          {stage === 3 ? (
            <div className="upload-success">
              <span className="success-mark">
                <Icon name="check" />
              </span>
              <h2>Dataset ready for mining</h2>
              <p>{ready.name}</p>
              <div className="dataset-stat-row">
                {[
                  ["Eligible baskets", ready.basket_count],
                  ["Products", ready.summary.product_count],
                  ["Cleaned rows", ready.summary.cleaned_records],
                ].map(([t, v]) => (
                  <div key={t}>
                    <span className="muted">{t}</span>
                    <strong>{v.toLocaleString()}</strong>
                  </div>
                ))}
              </div>
              <div className="button-group">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => onNavigate(1)}
                >
                  View in Datasets
                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={() => onNavigate(3)}
                >
                  Start Mining →
                </button>
              </div>
            </div>
          ) : (
            <>
              <label>
                <span>Dataset name</span>
                <input
                  required
                  maxLength={200}
                  value={name}
                  disabled={busy}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="For example, November retail transactions"
                />
              </label>
              <label>
                <span>Description (optional)</span>
                <textarea
                  maxLength={1000}
                  value={description}
                  disabled={busy}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the source and purpose of this dataset"
                  rows={2}
                />
              </label>
              {stage === 0 ? (
                <>
                  <div
                    className="file-dropzone"
                    data-dragging={dragging}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!busy) setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      choose(e.dataTransfer.files[0]);
                    }}
                  >
                    <Icon name="upload" />
                    <strong>Drag and drop a file here</strong>
                    <span className="muted">
                      CSV or XLSX ·{" "}
                      {max
                        ? `Maximum ${(max / 1024 ** 2).toFixed(0)} MiB`
                        : "Checking upload limit…"}
                    </span>
                    <input
                      ref={input}
                      type="file"
                      className="sr-only"
                      accept=".csv,.xlsx"
                      aria-label="Transaction file"
                      disabled={busy}
                      onChange={(e) => choose(e.target.files[0])}
                    />
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy}
                      onClick={() => input.current.click()}
                    >
                      Browse File
                    </button>
                  </div>
                  {file && (
                    <div className="selected-file">
                      <Icon name="report" />
                      <div>
                        <strong>{file.name}</strong>
                        <small>
                          {(file.size / 1024).toFixed(1)} KiB · Selected
                        </small>
                      </div>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Remove selected file"
                        disabled={busy}
                        onClick={() => {
                          setFile(null);
                          input.current.value = "";
                        }}
                      >
                        <Icon name="close" />
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="mapping-stage">
                  <h2>Preview and map columns</h2>
                  <p className="muted">
                    Confirm each source column. InvoiceNo, StockCode and
                    Quantity are required; other fields are optional.
                  </p>
                  <div className="column-mapping">
                    {fields.map((target, i) => (
                      <label key={target}>
                        <span>
                          {target}
                          {i < 3 ? " *" : " (optional)"}
                        </span>
                        <select
                          value={mapping[target] || ""}
                          disabled={busy}
                          required={i < 3}
                          onChange={(e) =>
                            setMapping((m) => ({
                              ...m,
                              [target]: e.target.value,
                            }))
                          }
                        >
                          <option value="">
                            {i < 3 ? "Select source column" : "Not provided"}
                          </option>
                          {preview.columns.map((h) => (
                            <option value={h} key={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <div
                    className="table-scroll"
                    tabIndex="0"
                    role="region"
                    aria-label="Sample transaction rows"
                  >
                    <table>
                      <caption>
                        Preview · first {preview.sample.length} rows
                      </caption>
                      <thead>
                        <tr>
                          {preview.columns.map((h) => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.sample.map((r, i) => (
                          <tr key={i}>
                            {r.map((c, j) => (
                              <td key={j}>{c}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {error && <Notice kind="error">{error}</Notice>}
              {busy && (
                <div className="upload-progress" role="status">
                  <span className="spinner" />
                  {status}
                  {progress != null && status === "Uploading dataset…" && (
                    <>
                      <progress max={100} value={progress} />
                      <span>{progress}% transferred</span>
                    </>
                  )}
                </div>
              )}
              <div className="form-actions">
                {stage === 1 ? (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setStage(0)}
                  >
                    Choose another file
                  </button>
                ) : (
                  <span className="muted">
                    Files and results are private to your account.
                  </span>
                )}
                <button
                  type="submit"
                  className="button primary"
                  disabled={busy || !file || !max}
                >
                  {busy ? (
                    <>
                      <span className="spinner" />
                      {status}
                    </>
                  ) : stage === 0 ? (
                    "Validate & Continue"
                  ) : (
                    "Upload & Process"
                  )}
                </button>
              </div>
            </>
          )}
        </form>
      </section>
      <aside className="upload-guide compact-upload-guide">
        <div className="compact-help-row">
          <span>Dataset requirements</span>
          <HelpTip label="Dataset requirements">
            One row per product line in a transaction. InvoiceNo identifies the transaction, StockCode identifies the product, and Quantity must be positive. Optional columns: Description, InvoiceDate, UnitPrice, Country. CustomerID is not required. Alternative names can be mapped in the next step. Formula cells and macro-enabled workbooks are unsupported.
          </HelpTip>
        </div>
        <div className="compact-help-row">
          <span>Example files</span>
          <HelpTip label="Example files">Deterministic synthetic transactions with independently verifiable product combinations.</HelpTip>
        </div>
        <div className="button-group">
          <a className="button secondary" href="/examples/synthetic-retail.csv" download><Icon name="download" />Example CSV</a>
          <a className="button secondary" href="/examples/synthetic-retail.xlsx" download><Icon name="download" />Example XLSX</a>
        </div>
      </aside>
    </div>
  );
}
