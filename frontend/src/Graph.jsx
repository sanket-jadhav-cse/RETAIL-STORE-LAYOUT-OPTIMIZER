import { useId, useMemo, useState } from "react";
import Icon from "./Icon";
export const pct = (value) =>
  value == null ? "Unavailable" : `${(value * 100).toFixed(2)}%`;
export function PairDetails({ pair }) {
  return pair ? (
    <div className="pair-details">
      <h3>{pair.name_a}</h3>
      <span className="pair-connector">paired with</span>
      <h3>{pair.name_b}</h3>
      <dl className="pair-metrics">
        {[
          ["Support", pct(pair.support)],
          ["Lift", pair.lift.toFixed(3)],
          ["Confidence A to B", pct(pair.confidence_a_b)],
          ["Confidence B to A", pct(pair.confidence_b_a)],
        ].map(([title, value]) => (
          <div key={title}>
            <dt>{title}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="pair-rationale">{pair.rationale}</p>
    </div>
  ) : (
    <div className="graph-empty">
      <span className="guide-icon">
        <Icon name="network" />
      </span>
      <h3>Inspect a connection</h3>
      <p className="muted">Select a relationship to inspect its evidence.</p>
    </div>
  );
}
function activate(event, action) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}
function labelAnchor(cosine) {
  if (cosine > 0.2) return "start";
  if (cosine < -0.2) return "end";
  return "middle";
}
export default function Graph({ pairs }) {
  const [selected, setSelected] = useState(null),
    [product, setProduct] = useState(""),
    [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [drag, setDrag] = useState(null);
  const patternId = useId().replaceAll(":", "");
  const labels = useMemo(
    () =>
      Object.fromEntries(
        pairs.flatMap((p) => [
          [p.product_a, p.name_a],
          [p.product_b, p.name_b],
        ]),
      ),
    [pairs],
  );
  const nodes = useMemo(
    () =>
      [...new Set(pairs.flatMap((p) => [p.product_a, p.product_b]))].map(
        (id, i, all) => ({
          id,
          x: 400 + 270 * Math.cos((i / all.length) * 2 * Math.PI),
          y: 300 + 225 * Math.sin((i / all.length) * 2 * Math.PI),
          labelX: 400 + 300 * Math.cos((i / all.length) * 2 * Math.PI),
          labelY: 304 + 255 * Math.sin((i / all.length) * 2 * Math.PI),
          anchor: labelAnchor(Math.cos((i / all.length) * 2 * Math.PI)),
        }),
      ),
    [pairs],
  );
  const positions = Object.fromEntries(nodes.map((node) => [node.id, node]));
  function reset() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setProduct("");
    setSelected(null);
  }
  return (
    <>
      <div className="graph-controls">
        <label>
          <span>Focus product</span>
          <select value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="">All products</option>
            {nodes.map((node) => (
              <option value={node.id} key={node.id}>
                {labels[node.id]} ({node.id})
              </option>
            ))}
          </select>
        </label>
        <label className="zoom-control">
          Zoom · {Math.round(zoom * 100)}%
          <input
            aria-label="Zoom"
            type="range"
            min=".5"
            max="3"
            step=".1"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <button type="button" className="button secondary" onClick={reset}>
          <Icon name="refresh" />
          Reset view
        </button>
      </div>
      <p className="graph-caption">
        <Icon name="info" />
        Conceptual adjacency, not a physical floor plan. This page shows up to
        25 ranked relationships.
      </p>
      <div className="graph-layout">
        <div>
          <fieldset className="graph-canvas">
            <legend className="sr-only">Product adjacency graph</legend>
            <svg
              role="presentation"
              viewBox="0 0 800 600"
              className="graph-svg"
              onPointerDown={(e) => {
                if (e.target.closest("[data-interactive]")) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                setDrag({ x: e.clientX, y: e.clientY, pan });
              }}
              onPointerMove={(e) => {
                if (drag) {
                  const scale =
                    800 / e.currentTarget.getBoundingClientRect().width;
                  setPan({
                    x: drag.pan.x + (e.clientX - drag.x) * scale,
                    y: drag.pan.y + (e.clientY - drag.y) * scale,
                  });
                }
              }}
              onPointerUp={() => setDrag(null)}
              onPointerCancel={() => setDrag(null)}
              onLostPointerCapture={() => setDrag(null)}
            >
              <defs>
                <pattern
                  id={patternId}
                  width="24"
                  height="24"
                  patternUnits="userSpaceOnUse"
                >
                  <circle className="graph-grid-dot" cx="2" cy="2" r="1" />
                </pattern>
              </defs>
              <rect width="800" height="600" fill={`url(#${patternId})`} />
              <g
                transform={`translate(${pan.x} ${pan.y}) translate(400 300) scale(${zoom}) translate(-400 -300)`}
              >
                {pairs
                  .filter(
                    (pair) =>
                      !product ||
                      pair.product_a === product ||
                      pair.product_b === product,
                  )
                  .map((pair) => (
                    <g
                      className="graph-edge-group"
                      data-interactive="true"
                      key={pair.rank}
                      role="button"
                      tabIndex="0"
                      aria-label={`${pair.name_a} with ${pair.name_b}`}
                      aria-pressed={selected?.rank === pair.rank}
                      onClick={() => setSelected(pair)}
                      onKeyDown={(e) => activate(e, () => setSelected(pair))}
                    >
                      <line
                        className={`graph-edge ${selected?.rank === pair.rank ? "active" : ""}`}
                        x1={positions[pair.product_a].x}
                        y1={positions[pair.product_a].y}
                        x2={positions[pair.product_b].x}
                        y2={positions[pair.product_b].y}
                      />
                      <line
                        className="graph-hit-area"
                        x1={positions[pair.product_a].x}
                        y1={positions[pair.product_a].y}
                        x2={positions[pair.product_b].x}
                        y2={positions[pair.product_b].y}
                      />
                      <title>
                        {pair.name_a} + {pair.name_b}; lift{" "}
                        {pair.lift.toFixed(2)}
                      </title>
                    </g>
                  ))}
                {nodes.map((node) => (
                  <g
                    data-interactive="true"
                    key={node.id}
                    role="button"
                    tabIndex="0"
                    aria-label={`Focus product ${labels[node.id]}`}
                    aria-pressed={product === node.id}
                    onClick={() => setProduct(node.id)}
                    onKeyDown={(e) => activate(e, () => setProduct(node.id))}
                  >
                    <circle
                      className={`graph-node ${product === node.id ? "selected" : ""}`}
                      cx={node.x}
                      cy={node.y}
                      r="15"
                    />
                    <text
                      className="graph-node-label"
                      x={node.labelX}
                      y={node.labelY}
                      textAnchor={node.anchor}
                    >
                      {node.id}
                    </text>
                    <title>{labels[node.id]}</title>
                  </g>
                ))}
              </g>
            </svg>
            <div className="graph-legend">
              <span>
                <span className="legend-point" aria-hidden="true" />
                <span>Product</span>
              </span>
              <span>
                <span className="legend-line" aria-hidden="true" />
                <span>Recommended relationship</span>
              </span>
            </div>
          </fieldset>
          <div className="graph-pan">
            <span>Pan view</span>
            {[
              ["left", 40, 0, "←"],
              ["up", 0, 40, "↑"],
              ["down", 0, -40, "↓"],
              ["right", -40, 0, "→"],
            ].map(([direction, x, y, symbol]) => (
              <button
                type="button"
                className="icon-button"
                key={direction}
                aria-label={`Pan ${direction}`}
                onClick={() =>
                  setPan((current) => ({ x: current.x + x, y: current.y + y }))
                }
              >
                {symbol}
              </button>
            ))}
          </div>
        </div>
        <aside className="graph-selection">
          <label>
            <span>Inspect relationship</span>
            <select
              value={selected?.rank ?? ""}
              onChange={(e) =>
                setSelected(
                  pairs.find((p) => p.rank === Number(e.target.value)) || null,
                )
              }
            >
              <option value="">Choose a connection</option>
              {pairs.map((pair) => (
                <option key={pair.rank} value={pair.rank}>
                  #{pair.rank} {pair.name_a} + {pair.name_b}
                </option>
              ))}
            </select>
          </label>
          <PairDetails pair={selected} />
        </aside>
      </div>
    </>
  );
}
