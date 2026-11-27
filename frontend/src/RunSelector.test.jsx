import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RunSelector from "./RunSelector";
import { api } from "./api";
vi.mock("./api", async (original) => ({
  ...(await original()),
  api: { get: vi.fn() },
}));
const first = {
  run_id: "00000000-0000-4000-8000-000000000001",
  name: "Baseline Market Basket Analysis",
  dataset_name: "UCI Online Retail Dataset",
  status: "Completed",
  created_at: "2026-11-26T12:00:00Z",
  execution: { rule_count: 52, adjacency_count: 38 },
};
beforeEach(() =>
  api.get.mockImplementation((path) =>
    Promise.resolve({
      data: path === "/runs" ? { items: [first], total: 1 } : first,
    }),
  ),
);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("loads named authorized runs, selects with keyboard and closes with restored focus", async () => {
  const selected = vi.fn();
  render(<RunSelector selectedId={first.run_id} onSelect={selected} />);
  const trigger = screen.getByRole("button", { name: "Load a previous run" });
  fireEvent.click(trigger);
  await screen.findByRole("option", { name: /Baseline Market Basket/ });
  expect(
    screen.getByRole("option", { name: /Baseline Market Basket/ }),
  ).toHaveAttribute("aria-selected", "true");
  fireEvent.keyDown(
    screen.getByRole("combobox", { name: "Search previous runs" }),
    { key: "Enter" },
  );
  await waitFor(() => expect(selected).toHaveBeenCalledWith(first));
  await waitFor(() =>
    expect(
      screen.queryByRole("combobox", { name: "Search previous runs" }),
    ).not.toBeInTheDocument(),
  );
  await waitFor(() => expect(trigger).toHaveFocus());
});
it("dismisses on Escape and outside interaction while keeping search interactions open", async () => {
  render(<RunSelector onSelect={vi.fn()} />);
  const trigger = screen.getByRole("button", { name: "Load a previous run" });
  fireEvent.click(trigger);
  const input = await screen.findByRole("combobox", {
    name: "Search previous runs",
  });
  fireEvent.pointerDown(input);
  fireEvent.click(input);
  expect(
    screen.getByRole("combobox", { name: "Search previous runs" }),
  ).toBeInTheDocument();
  fireEvent.keyDown(input, { key: "Escape" });
  await waitFor(() =>
    expect(
      screen.queryByRole("combobox", { name: "Search previous runs" }),
    ).not.toBeInTheDocument(),
  );
  fireEvent.click(trigger);
  await screen.findByRole("combobox", { name: "Search previous runs" });
  await new Promise((resolve) => setTimeout(resolve, 30));
  fireEvent.pointerDown(document.body, { pointerType: "mouse", button: 0 });
  await waitFor(() =>
    expect(
      screen.queryByRole("combobox", { name: "Search previous runs" }),
    ).not.toBeInTheDocument(),
  );
});
it("debounces search and paginates on the server", async () => {
  api.get.mockResolvedValue({ data: { items: [first], total: 25 } });
  render(<RunSelector onSelect={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Load a previous run" }));
  const input = await screen.findByRole("combobox", {
    name: "Search previous runs",
  });
  await screen.findByRole("option", { name: /Baseline Market Basket/ });
  fireEvent.change(input, { target: { value: "B" } });
  fireEvent.change(input, { target: { value: "Baseline" } });
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith(
      "/runs",
      expect.objectContaining({
        params: expect.objectContaining({ search: "Baseline", page: 1 }),
      }),
    ),
  );
  expect(
    api.get.mock.calls.some(([, options]) => options?.params?.search === "B"),
  ).toBe(false);
  await waitFor(() =>
    expect(
      screen.queryByLabelText("Loading previous runs"),
    ).not.toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith(
      "/runs",
      expect.objectContaining({ params: expect.objectContaining({ page: 2 }) }),
    ),
  );
});
it("keeps recoverable errors open and supports retry and empty results", async () => {
  api.get
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ data: { items: [], total: 0 } });
  render(<RunSelector onSelect={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Load a previous run" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText(/No previous runs yet/)).toBeInTheDocument();
});
