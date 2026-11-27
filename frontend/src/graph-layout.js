import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from "d3-force";
// Stable connected groups and shelf packing avoid a large circular perimeter.
export function layoutGraph(pairs) {
  const labels = new Map(),
    neighbors = new Map();
  for (const p of pairs) {
    labels.set(p.product_a, p.name_a);
    labels.set(p.product_b, p.name_b);
    for (const [a, b] of [
      [p.product_a, p.product_b],
      [p.product_b, p.product_a],
    ]) {
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      neighbors.get(a).add(b);
    }
  }
  const seen = new Set(),
    groups = [];
  for (const id of [...labels.keys()].sort()) {
    if (seen.has(id)) continue;
    const stack = [id],
      group = [];
    seen.add(id);
    while (stack.length) {
      const a = stack.pop();
      group.push(a);
      for (const b of [...neighbors.get(a)].sort())
        if (!seen.has(b)) {
          seen.add(b);
          stack.push(b);
        }
    }
    groups.push(group.sort());
  }
  groups.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
  const components = groups.map((ids, group) => {
    const nodes = ids.map((id, i) => ({
      id,
      label: labels.get(id) || id,
      group,
      x: Math.cos(i * 2.399) * 70,
      y: Math.sin(i * 2.399) * 70,
    }));
    const edges = pairs
      .filter((p) => ids.includes(p.product_a))
      .map((p) => ({ source: p.product_a, target: p.product_b, pair: p }));
    let seed = 42;
    const random = () =>
      (seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296;
    const sim = forceSimulation(nodes)
      .randomSource(random)
      .force(
        "link",
        forceLink(edges)
          .id((n) => n.id)
          .distance(140)
          .strength(0.65),
      )
      .force("charge", forceManyBody().strength(-350))
      .force("collide", forceCollide(58).iterations(3))
      .force("center", forceCenter())
      .stop();
    sim.tick(200);
    sim.stop();
    for (const n of nodes) n.y *= 0.6;
    for (let step = 0; step < 60; step++)
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i],
            b = nodes[j],
            dx = b.x - a.x,
            dy = b.y - a.y,
            ox = 170 - Math.abs(dx),
            oy = 90 - Math.abs(dy);
          if (ox > 0 && oy > 0) {
            if (ox < oy) {
              const shift = (ox / 2 + 0.2) * (dx >= 0 ? 1 : -1);
              a.x -= shift;
              b.x += shift;
            } else {
              const shift = (oy / 2 + 0.2) * (dy >= 0 ? 1 : -1);
              a.y -= shift;
              b.y += shift;
            }
          }
        }
    if (nodes.length === 2) {
      nodes[0].x = 0;
      nodes[0].y = 0;
      nodes[1].x = 188;
      nodes[1].y = 0;
    }
    const minX = Math.min(...nodes.map((n) => n.x)) - 82,
      minY = Math.min(...nodes.map((n) => n.y)) - 40;
    const width = Math.max(...nodes.map((n) => n.x)) - minX + 82,
      height = Math.max(...nodes.map((n) => n.y)) - minY + 40;
    for (const n of nodes) {
      n.x -= minX;
      n.y -= minY;
    }
    return { nodes, edges, width, height };
  });
  const width = Math.max(840, ...components.map((c) => c.width + 40));
  let x = 20,
    y = 36,
    rowHeight = 0;
  const nodes = [],
    edges = [];
  for (const c of components) {
    if (x + c.width > width - 20) {
      x = 20;
      y += rowHeight + 40;
      rowHeight = 0;
    }
    for (const n of c.nodes) {
      n.x += x;
      n.y += y;
      nodes.push(n);
    }
    edges.push(...c.edges);
    x += c.width + 40;
    rowHeight = Math.max(rowHeight, c.height);
  }
  return {
    nodes,
    edges,
    width,
    height: Math.max(430, y + rowHeight + 36),
    groups: groups.length,
  };
}
export function wrapLabel(label, max = 21) {
  const words = label.split(/\s+/),
    lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > max && line) {
      lines.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  return lines.length > 3
    ? [...lines.slice(0, 2), lines[2].slice(0, max - 1) + "…"]
    : lines;
}
