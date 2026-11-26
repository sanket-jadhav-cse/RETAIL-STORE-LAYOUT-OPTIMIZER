import { expect, it } from "vitest";
import { errorMessage, runPath } from "./api";
it("rejects malformed identifiers before they can change the request path, query or fragment", () => {
  for (const id of [
    ".",
    "..",
    "../../datasets",
    "https://example.com",
    "abc?redirect=1",
    "abc#fragment",
    "",
  ]) {
    expect(() => runPath(id, "report.csv")).toThrow("Enter a valid run UUID");
  }
  expect(
    errorMessage({ code: "INVALID_RUN_ID", message: "Enter a valid run UUID" }),
  ).toBe("Enter a valid run UUID");
});
it("preserves valid UUID routes and rejects unknown resource paths", () => {
  const id = "c45fbbd7-af47-4898-b72b-755e2696304e";
  expect(runPath(id)).toBe(`/runs/${id}`);
  for (const resource of [
    "rules",
    "adjacencies",
    "report",
    "report.csv",
    "itemsets",
  ])
    expect(runPath(id, resource)).toBe(`/runs/${id}/${resource}`);
  expect(() => runPath(id, "../report")).toThrow("Unknown run resource");
});
