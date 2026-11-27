import { it, expect } from "vitest";
import { layoutGraph } from "./graph-layout";
it("packs actual connected components deterministically without changing edges or overlapping nodes", () => {
  const pairs = [
    ["A", "B"],
    ["A", "C"],
    ["B", "C"],
    ["D", "E"],
    ["F", "G"],
  ].map(([a, b], i) =>
    Object.freeze({
      product_a: a,
      product_b: b,
      name_a: `Long product ${a}`,
      name_b: `Long product ${b}`,
      rank: i + 1,
    }),
  );
  const first = layoutGraph(pairs),
    second = layoutGraph(pairs);
  expect(
    first.nodes.map(({ id, x, y, group }) => ({ id, x, y, group })),
  ).toEqual(second.nodes.map(({ id, x, y, group }) => ({ id, x, y, group })));
  expect(first.groups).toBe(3);
  expect(first.edges.map((e) => [e.pair.product_a, e.pair.product_b])).toEqual(
    pairs.map((p) => [p.product_a, p.product_b]),
  );
  for (let i = 0; i < first.nodes.length; i++)
    for (let j = i + 1; j < first.nodes.length; j++) {
      const a = first.nodes[i],
        b = first.nodes[j];
      expect(Math.abs(a.x - b.x) >= 156 || Math.abs(a.y - b.y) >= 72).toBe(
        true,
      );
    }
});
