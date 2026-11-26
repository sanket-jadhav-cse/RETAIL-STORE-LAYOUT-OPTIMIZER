import { useMemo, useState } from "react";
export const pct = (v) =>
  v == null ? "Unavailable" : `${(v * 100).toFixed(2)}%`;
export function PairDetails({ pair }) {
  return pair ? (
    <div className="space-y-3">
      <h2>
        {pair.name_a} + {pair.name_b}
      </h2>
      <p>{pair.rationale}</p>
      <p>
        Support {pct(pair.support)} · Lift {pair.lift.toFixed(3)}
      </p>
      <p>
        A to B {pct(pair.confidence_a_b)} · B to A {pct(pair.confidence_b_a)}
      </p>
    </div>
  ) : (
    <p className="muted">Select a relationship to inspect its evidence.</p>
  );
}
export default function Graph({ pairs }) {
  const [selected, setSelected] = useState(null),
    [product, setProduct] = useState(""),
    [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [drag, setDrag] = useState(null);
  const nodes = useMemo(
    () =>
      [...new Set(pairs.flatMap((p) => [p.product_a, p.product_b]))].map(
        (id, i, all) => ({
          id,
          x: 400 + 260 * Math.cos((i / all.length) * 2 * Math.PI),
          y: 300 + 220 * Math.sin((i / all.length) * 2 * Math.PI),
        }),
      ),
    [pairs],
  );
  const positions = Object.fromEntries(nodes.map((n) => [n.id, n]));
  return (
    <>
      <div className="controls">
        <label>
          Focus product
          <select value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="">All products</option>
            {nodes.map((n) => (
              <option key={n.id}>{n.id}</option>
            ))}
          </select>
        </label>
        <label>
          Zoom
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
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
            setProduct("");
            setSelected(null);
          }}
        >
          Reset view
        </button>
      </div>
      <p className="muted">
        Conceptual adjacency graph, not a physical floor plan. Drag to pan.
        Showing this page of ranked relationships.
      </p>
      <svg
        role="img"
        aria-label="Product adjacency graph"
        viewBox="0 0 800 600"
        className="w-full bg-slate-50 rounded-xl touch-none"
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({ x: e.clientX, y: e.clientY, pan });
        }}
        onPointerMove={(e) => {
          if (drag) {
            const scale = 800 / e.currentTarget.getBoundingClientRect().width;
            setPan({
              x: drag.pan.x + (e.clientX - drag.x) * scale,
              y: drag.pan.y + (e.clientY - drag.y) * scale,
            });
          }
        }}
        onPointerUp={() => setDrag(null)}
      >
        <g
          transform={`translate(${pan.x} ${pan.y}) translate(400 300) scale(${zoom}) translate(-400 -300)`}
        >
          {pairs
            .filter(
              (p) =>
                !product || p.product_a === product || p.product_b === product,
            )
            .map((p) => (
              <g
                key={p.rank}
                role="button"
                tabIndex="0"
                aria-label={`${p.name_a} with ${p.name_b}`}
                onClick={() => setSelected(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSelected(p);
                }}
              >
                <line
                  x1={positions[p.product_a].x}
                  y1={positions[p.product_a].y}
                  x2={positions[p.product_b].x}
                  y2={positions[p.product_b].y}
                  stroke={selected?.rank === p.rank ? "#f97316" : "#0f766e"}
                  strokeWidth={selected?.rank === p.rank ? 6 : 3}
                />
                <title>
                  {p.name_a} + {p.name_b}; lift {p.lift.toFixed(2)}
                </title>
              </g>
            ))}
          {nodes.map((n) => (
            <g key={n.id} onClick={() => setProduct(n.id)}>
              <circle cx={n.x} cy={n.y} r="18" fill="#134e4a" />
              <text
                x={n.x}
                y={n.y + 34}
                textAnchor="middle"
                fontSize="14"
                pointerEvents="none"
              >
                {n.id}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <div className="mt-5">
        <PairDetails pair={selected} />
      </div>
    </>
  );
}
