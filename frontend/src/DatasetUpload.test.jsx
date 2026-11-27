import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import DatasetUpload from "./DatasetUpload";
import { api } from "./api";
vi.mock("./api", async (original) => ({
  ...(await original()),
  api: { get: vi.fn(), post: vi.fn() },
}));
const renderUpload = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DatasetUpload onReady={vi.fn()} onNavigate={vi.fn()} />
    </QueryClientProvider>,
  );
beforeEach(() => {
  api.get.mockResolvedValue({ data: { max_bytes: 52428800 } });
  api.post.mockReset();
});
afterEach(cleanup);
it("maps aliases explicitly, uploads only on confirmation and prevents duplicate submissions", async () => {
  let complete;
  api.post.mockImplementation((path) =>
    path.endsWith("preview")
      ? Promise.resolve({
          data: {
            columns: ["TransactionID", "ProductID", "Quantity"],
            sample: [["1", "A", "1"]],
            mapping: {
              InvoiceNo: "TransactionID",
              StockCode: "ProductID",
              Quantity: "Quantity",
            },
          },
        })
      : new Promise((resolve) => {
          complete = resolve;
        }),
  );
  renderUpload();
  await waitFor(() =>
    expect(screen.getByText(/Maximum 50 MiB/)).toBeInTheDocument(),
  );
  fireEvent.change(screen.getByLabelText("Transaction file"), {
    target: {
      files: [
        new File(
          ["TransactionID,ProductID,Quantity\n1,A,1\n2,B,1"],
          "synthetic.csv",
          { type: "text/csv" },
        ),
      ],
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Validate & Continue" }));
  await screen.findByText("Preview and map columns");
  expect(screen.getByLabelText("InvoiceNo *")).toHaveValue("TransactionID");
  expect(api.post).toHaveBeenCalledTimes(1);
  const upload = screen.getByRole("button", { name: "Upload & Process" });
  fireEvent.click(upload);
  fireEvent.click(upload);
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
  expect(
    screen.getByRole("button", { name: /Uploading dataset/ }),
  ).toBeDisabled();
  complete({
    data: {
      dataset_id: "test",
      name: "Synthetic",
      basket_count: 2,
      summary: { product_count: 2, cleaned_records: 2 },
    },
  });
  await screen.findByText("Dataset ready for mining");
});
it("retains file and form values after a recoverable validation error", async () => {
  api.post.mockRejectedValue(new Error("offline"));
  renderUpload();
  await screen.findByText(/Maximum 50 MiB/);
  fireEvent.change(screen.getByLabelText("Dataset name"), {
    target: { value: "Private seasonal source" },
  });
  fireEvent.change(screen.getByLabelText("Transaction file"), {
    target: { files: [new File(["bad"], "retail.csv")] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Validate & Continue" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Dataset name")).toHaveValue(
    "Private seasonal source",
  );
  expect(screen.getByText("retail.csv")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Validate & Continue" }),
  ).toBeEnabled();
});
it("rejects empty and unsupported file selections without sending them", async () => {
  renderUpload();
  await screen.findByText(/Maximum 50 MiB/);
  const input = screen.getByLabelText("Transaction file");
  fireEvent.change(input, { target: { files: [new File([], "empty.csv")] } });
  expect(screen.getByRole("alert")).toHaveTextContent("empty");
  fireEvent.change(input, {
    target: { files: [new File(["bad"], "macro.xlsm")] },
  });
  expect(screen.getByRole("alert")).toHaveTextContent("CSV or XLSX");
  expect(api.post).not.toHaveBeenCalled();
});
