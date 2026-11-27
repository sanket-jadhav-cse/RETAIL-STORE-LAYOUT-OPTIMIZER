import { useId, useMemo, useState } from "react";
import Icon from "./Icon";
import { SearchSelect } from "./Selectors";
import { layoutGraph, wrapLabel } from "./graph-layout";
import { pct } from "./format";
export { pct } from "./format";
export function PairDetails({ pair }) {
  return pair ? (
    <div className="pair-details">
      <h3>{pair.name_a}</h3>
      <span className="product-code">Code: {pair.product_a}</span>
      <span className="pair-connector">↔</span>
      <h3>{pair.name_b}</h3>
      <span className="product-code">Code: {pair.product_b}</span>
      <dl className="pair-metrics">
        {[
          ["Support", pct(pair.support)],
          ["Lift", pair.lift.toFixed(3)],
          ["Confidence A to B", pct(pair.confidence_a_b)],
          ["Confidence B to A", pct(pair.confidence_b_a)],
        ].map(([t, v]) => (
          <div key={t}>
            <dt>{t}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <h3>Recommendation evidence</h3>
      <p className="pair-rationale">{pair.rationale}</p>
    </div>
  ) : (
    <p className="muted">Select a relationship to inspect its evidence.</p>
  );
}
function activate(event, action) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}
export default function Graph({ pairs, filters }) {
  const [selected, setSelected] = useState(pairs[0] || null),
    [product, setProduct] = useState(""),
    [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [drag, setDrag] = useState(null);
  const graph = useMemo(() => layoutGraph(pairs), [pairs]);
  const patternId = useId().replaceAll(":", "");
  const w = graph.width,
    h = graph.height;
  const connected = new Set(
    pairs
      .filter(
        (p) => !product || p.product_a === product || p.product_b === product,
      )
      .flatMap((p) => [p.product_a, p.product_b]),
  );
  function reset() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }
  return (
    <>
      <div className="graph-local-toolbar">
        {filters}
        <SearchSelect
          label="Focus product"
          value={product}
          options={[
            { value: "", label: "All products" },
            ...graph.nodes.map((n) => ({
              value: n.id,
              label: n.label,
              detail: n.id,
            })),
          ]}
          onChange={setProduct}
        />
        <span className="muted">
          {graph.nodes.length} products · {graph.groups} connected{" "}
          {graph.groups === 1 ? "group" : "groups"}
        </span>
        <span className="confidence-mode">
          Confidence: either qualifying direction
        </span>
      </div>
      <div className="graph-layout">
        <div className="graph-canvas-container">
          <fieldset className="graph-canvas">
            <legend className="sr-only">Product adjacency graph</legend>
            <svg
              role="presentation"
              viewBox={`0 0 ${w} ${h}`}
              className="graph-svg"
              onPointerDown={(e) => {
                if (e.target.closest("[data-interactive]")) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                setDrag({ x: e.clientX, y: e.clientY, pan });
              }}
              onPointerMove={(e) => {
                if (drag) {
                  const scale =
                    w / e.currentTarget.getBoundingClientRect().width;
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
              <rect width={w} height={h} fill={`url(#${patternId})`} />
              <g
                transform={`translate(${pan.x} ${pan.y}) translate(${w / 2} ${h / 2}) scale(${zoom}) translate(${-w / 2} ${-h / 2})`}
              >
                {graph.edges.map(({ source: a, target: b, pair: p }) => (
                  <g
                    className={`graph-edge-group ${product && p.product_a !== product && p.product_b !== product ? "dimmed" : ""}`}
                    key={p.rank}
                    data-interactive="true"
                    role="button"
                    tabIndex="0"
                    aria-label={`${p.name_a} with ${p.name_b}`}
                    aria-pressed={selected?.rank === p.rank}
                    onClick={() => setSelected(p)}
                    onKeyDown={(e) => activate(e, () => setSelected(p))}
                  >
                    <line
                      className={`graph-edge ${selected?.rank === p.rank ? "active" : ""}`}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                    />
                    <line
                      className="graph-hit-area"
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                    />
                    {selected?.rank === p.rank && (
                      <g className="edge-metric" aria-hidden="true">
                        <rect
                          x={(a.x + b.x) / 2 - 37}
                          y={(a.y + b.y) / 2 - 12}
                          width="74"
                          height="24"
                          rx="5"
                        />
                        <text
                          x={(a.x + b.x) / 2}
                          y={(a.y + b.y) / 2 + 4}
                          textAnchor="middle"
                        >
                          Lift {p.lift.toFixed(2)}
                        </text>
                      </g>
                    )}
                    <title>
                      {p.name_a} ↔ {p.name_b}; lift {p.lift.toFixed(2)}
                    </title>
                  </g>
                ))}
                {graph.nodes.map((n) => (
                  <g
                    className={`graph-product group-${n.group % 5} ${product && !connected.has(n.id) ? "dimmed" : ""}`}
                    key={n.id}
                    data-interactive="true"
                    role="button"
                    tabIndex="0"
                    aria-label={`Focus product ${n.label}`}
                    aria-pressed={product === n.id}
                    onClick={() => {
                      setProduct(n.id);
                      setSelected(
                        pairs.find(
                          (p) => p.product_a === n.id || p.product_b === n.id,
                        ),
                      );
                    }}
                    onKeyDown={(e) =>
                      activate(e, () => {
                        setProduct(n.id);
                        setSelected(
                          pairs.find(
                            (p) => p.product_a === n.id || p.product_b === n.id,
                          ),
                        );
                      })
                    }
                  >
                    <rect
                      className={`graph-node ${product === n.id ? "selected" : ""}`}
                      x={n.x - 78}
                      y={n.y - 36}
                      width="156"
                      height="72"
                      rx="9"
                    />
                    <text className="graph-node-label" textAnchor="middle">
                      {wrapLabel(n.label).map((line, i, lines) => (
                        <tspan
                          x={n.x}
                          y={n.y - (lines.length - 1) * 7 + i * 14}
                          key={i}
                        >
                          {line}
                        </tspan>
                      ))}
                    </text>
                    <title>
                      {n.label} ({n.id}) · connected group {n.group + 1}
                    </title>
                  </g>
                ))}
              </g>
            </svg>
            <div className="graph-view-controls">
              {[
                ["Fit to view", reset, "⛶"],
                ["Zoom in", () => setZoom((z) => Math.min(3, z + 0.2)), "+"],
                ["Zoom out", () => setZoom((z) => Math.max(0.4, z - 0.2)), "−"],
                [
                  "Reset view",
                  () => {
                    reset();
                    setProduct("");
                    setSelected(null);
                  },
                  "↺",
                ],
              ].map(([label, action, symbol]) => (
                <button
                  type="button"
                  className="icon-button"
                  key={label}
                  aria-label={label}
                  onClick={action}
                >
                  {symbol}
                </button>
              ))}
            </div>
            <div className="graph-legend">
              <span>Color groups show actual connectivity</span>
              <span>{Math.round(zoom * 100)}%</span>
            </div>
          </fieldset>
          <div className="graph-pan">
            <span>Pan view</span>
            {[
              ["left", 40, 0, "←"],
              ["up", 0, 40, "↑"],
              ["down", 0, -40, "↓"],
              ["right", -40, 0, "→"],
            ].map(([dir, x, y, symbol]) => (
              <button
                type="button"
                className="icon-button"
                key={dir}
                aria-label={`Pan ${dir}`}
                onClick={() => setPan((p) => ({ x: p.x + x, y: p.y + y }))}
              >
                {symbol}
              </button>
            ))}
          </div>
        </div>
        <aside className="graph-selection">
          <h2>Relationship Details</h2>
          <SearchSelect
            label="Inspect relationship"
            value={String(selected?.rank || "")}
            options={pairs.map((p) => ({
              value: String(p.rank),
              label: `#${p.rank} ${p.name_a} ↔ ${p.name_b}`,
            }))}
            onChange={(v) =>
              setSelected(pairs.find((p) => String(p.rank) === v) || null)
            }
          />
          <PairDetails pair={selected} />
        </aside>
      </div>
      <p className="conceptual-note">
        Undirected conceptual adjacency, not a physical floor plan. Use
        pagination to access all matching relationships. Missing reverse
        confidence is unavailable; it is not zero.
      </p>
    </>
  );
}
