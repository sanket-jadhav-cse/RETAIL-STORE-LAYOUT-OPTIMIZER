import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import Graph from "./Graph";
import { api } from "./api";
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal()),
  api: { get: vi.fn(), post: vi.fn() },
  errorMessage: () => "Service unavailable",
  downloadReport: vi.fn(),
}));
const RUN_ID = "00000000-0000-4000-8000-000000000001";
const dataset = {
  dataset_id: "d1",
  version: "UCI 2011",
  basket_count: 100,
  source: "UCI",
  summary: {
    product_count: 3,
    original_records: 200,
    excluded: { cancelled: 2 },
  },
};
beforeEach(() => {
  window.localStorage.clear();
  dataset.latest_run_id = null;
  api.get.mockReset();
  api.post.mockReset();
  api.get.mockResolvedValue({ data: [dataset] });
});
afterEach(cleanup);
it("loads actual dashboard values and navigates all screens", async () => {
  render(<App />);
  await screen.findByText("100");
  expect(screen.getByText("3")).toBeInTheDocument();
  for (const name of [
    "Dataset",
    "Configure mining",
    "Association rules",
    "Layout visualization",
    "Recommendation report",
  ]) {
    fireEvent.click(screen.getByRole("button", { name, exact: true }));
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  }
});
it("shows empty, loading and failure states", async () => {
  let resolve;
  api.get.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  render(<App />);
  expect(screen.getByText("Loading data…")).toBeInTheDocument();
  resolve({ data: [] });
  await screen.findByText(/No dataset imported/);
  cleanup();
  api.get.mockRejectedValue(new Error("offline"));
  render(<App />);
  await screen.findByRole("alert");
});
it("submits thresholds through the authenticated API client", async () => {
  api.post.mockResolvedValue({
    data: {
      run_id: RUN_ID,
      dataset_id: "d1",
      status: "Completed",
      execution: {},
    },
  });
  render(<App />);
  await screen.findByText("100");
  fireEvent.click(
    screen.getByRole("button", { name: "Configure mining", exact: true }),
  );
  expect(screen.getByLabelText("Minimum support")).toHaveAttribute(
    "min",
    "0.0001",
  );
  fireEvent.click(screen.getByRole("button", { name: "Run FP-Growth" }));
  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith(
      "/runs",
      expect.objectContaining({ min_support: 0.02, dataset_id: "d1" }),
    ),
  );
  expect(window.localStorage.getItem("token")).toBeNull();
});
it("renders rules and report responses", async () => {
  dataset.latest_run_id = RUN_ID;
  api.get.mockImplementation((path) =>
    Promise.resolve({
      data:
        path === "/datasets"
          ? [dataset]
          : path.endsWith("/rules")
            ? {
                total: 1,
                items: [
                  {
                    rule_id: "1",
                    antecedent: ["A"],
                    consequent: ["B"],
                    antecedent_names: ["Apples"],
                    consequent_names: ["Bread"],
                    support: 0.2,
                    confidence: 0.5,
                    lift: 1.5,
                  },
                ],
              }
            : path.endsWith("/report")
              ? {
                  run: {
                    min_support: 0.2,
                    min_confidence: 0.5,
                    min_lift: 1,
                    execution: { elapsed_seconds: 1 },
                  },
                  dataset,
                  review: "Review feasibility",
                  recommendations: { items: [], total: 0 },
                }
              : { run_id: RUN_ID, status: "Completed", execution: {} },
    }),
  );
  render(<App />);
  await screen.findByText(new RegExp(`Run ${RUN_ID}`));
  fireEvent.click(
    screen.getByRole("button", { name: "Association rules", exact: true }),
  );
  await screen.findByText("Apples");
  fireEvent.click(
    screen.getByRole("button", { name: "Recommendation report", exact: true }),
  );
  await screen.findByText("Review feasibility");
});
it("inspects graph evidence and resets zoom", () => {
  render(
    <Graph
      pairs={[
        {
          rank: 1,
          product_a: "A",
          product_b: "B",
          name_a: "Apples",
          name_b: "Bread",
          support: 0.2,
          confidence_a_b: 0.6,
          confidence_b_a: null,
          lift: 1.5,
          rationale: "Review placement",
        },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Apples with Bread" }));
  expect(screen.getByText("Review placement")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
  expect(screen.getByText(/Select a relationship/)).toBeInTheDocument();
});

it("clears old run statistics when selecting another dataset", async () => {
  dataset.latest_run_id = RUN_ID;
  api.get.mockImplementation((path) =>
    Promise.resolve({
      data:
        path === "/datasets"
          ? [
              dataset,
              {
                ...dataset,
                dataset_id: "d2",
                version: "Second dataset",
                basket_count: 200,
              },
            ]
          : {
              run_id: RUN_ID,
              dataset_id: "d1",
              status: "Completed",
              execution: { rule_count: 52 },
            },
    }),
  );
  render(<App />);
  await screen.findByText("52");
  fireEvent.change(screen.getByLabelText("Dataset"), {
    target: { value: "d2" },
  });
  expect(screen.queryByText("52")).not.toBeInTheDocument();
  expect(screen.getByText("200")).toBeInTheDocument();
});

it("toggles and persists the selected color theme", async () => {
  render(<App />);
  await screen.findByText("100");
  fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(window.localStorage.getItem("retailTheme")).toBe("dark");
  fireEvent.click(
    screen.getByRole("button", { name: "Switch to light theme" }),
  );
  expect(window.localStorage.getItem("retailTheme")).toBe("light");
});
it("supports Space on graph relationships and provides button alternatives to dragging", () => {
  render(
    <Graph
      pairs={[
        {
          rank: 1,
          product_a: "A",
          product_b: "B",
          name_a: "Apples",
          name_b: "Bread",
          support: 0.2,
          confidence_a_b: 0.6,
          confidence_b_a: null,
          lift: 1.5,
          rationale: "Inspect this evidence",
        },
      ]}
    />,
  );
  const edge = screen.getByRole("button", { name: "Apples with Bread" });
  fireEvent.keyDown(edge, { key: " " });
  expect(screen.getByText("Inspect this evidence")).toBeInTheDocument();
  expect(edge).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Pan left" }));
  expect(screen.getByLabelText("Inspect relationship")).toHaveValue("1");
});

it("keeps the current result table when its active navigation item is selected again", async () => {
  dataset.latest_run_id = RUN_ID;
  api.get.mockImplementation((path) =>
    Promise.resolve({
      data:
        path === "/datasets"
          ? [dataset]
          : path.endsWith("/rules")
            ? {
                total: 1,
                items: [
                  {
                    rule_id: "1",
                    antecedent: ["A"],
                    consequent: ["B"],
                    antecedent_names: ["Apples"],
                    consequent_names: ["Bread"],
                    support: 0.2,
                    confidence: 0.5,
                    lift: 1.5,
                  },
                ],
              }
            : path.endsWith("/adjacencies")
              ? { items: [], total: 0 }
              : {
                  run_id: RUN_ID,
                  dataset_id: "d1",
                  status: "Completed",
                  execution: {},
                },
    }),
  );
  render(<App />);
  await screen.findByText(new RegExp(`Run ${RUN_ID}`));
  const button = screen.getByRole("button", {
    name: "Association rules",
    exact: true,
  });
  fireEvent.click(button);
  await screen.findByText("Apples");
  fireEvent.click(button);
  expect(screen.getByText("Apples")).toBeInTheDocument();
});

it("debounces search and retains the table while the filtered request is pending", async () => {
  dataset.latest_run_id = RUN_ID;
  let finishSearch;
  const rule = {
    rule_id: "1",
    antecedent: ["A"],
    consequent: ["B"],
    antecedent_names: ["Apples"],
    consequent_names: ["Bread"],
    support: 0.2,
    confidence: 0.5,
    lift: 1.5,
  };
  api.get.mockImplementation((path, options) => {
    if (path.endsWith("/rules") && options?.params?.search === "Bread")
      return new Promise((resolve) => {
        finishSearch = resolve;
      });
    return Promise.resolve({
      data:
        path === "/datasets"
          ? [dataset]
          : path.endsWith("/rules")
            ? { total: 1, items: [rule] }
            : path.endsWith("/adjacencies")
              ? { items: [], total: 0 }
              : {
                  run_id: RUN_ID,
                  dataset_id: "d1",
                  status: "Completed",
                  execution: {},
                },
    });
  });
  render(<App />);
  await screen.findByText(new RegExp(`Run ${RUN_ID}`));
  fireEvent.click(
    screen.getByRole("button", { name: "Association rules", exact: true }),
  );
  await screen.findByText("Apples");
  fireEvent.change(screen.getByLabelText("Search products"), {
    target: { value: "B" },
  });
  fireEvent.change(screen.getByLabelText("Search products"), {
    target: { value: "Bread" },
  });
  expect(screen.getByText("Apples")).toBeInTheDocument();
  await waitFor(() => expect(finishSearch).toBeTypeOf("function"));
  expect(
    api.get.mock.calls.filter(
      ([path, options]) =>
        path.endsWith("/rules") && options?.params?.search === "B",
    ),
  ).toHaveLength(0);
  expect(screen.getByText("Apples")).toBeInTheDocument();
  finishSearch({ data: { total: 0, items: [] } });
  await screen.findByText("No qualifying results");
});

it("handles a malformed cached run ID without making a request outside the run API", async () => {
  dataset.latest_run_id = "../../datasets";
  render(<App />);
  await screen.findByRole("alert");
  expect(api.get.mock.calls.map(([path]) => path)).toEqual(["/datasets"]);
});
