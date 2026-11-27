import axios from "axios";
import { config } from "./config";
export const api = axios.create({
  baseURL: `${config.apiBaseUrl}/api/v1`,
  timeout: 20000,
});
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const runResources = new Set([
  "rules",
  "adjacencies",
  "report",
  "report.csv",
  "itemsets",
]);
export function runPath(id, resource = "") {
  if (!uuidPattern.test(id)) {
    const error = new Error("Enter a valid run UUID, then load the run again.");
    error.code = "INVALID_RUN_ID";
    throw error;
  }
  if (resource && !runResources.has(resource))
    throw new Error("Unknown run resource");
  const path = `/runs/${encodeURIComponent(id)}`;
  return resource ? `${path}/${encodeURIComponent(resource)}` : path;
}
export function errorMessage(error) {
  if (error.code === "INVALID_RUN_ID") return error.message;
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (error.response?.status === 422) return "Check the entered values.";
  return "Unable to reach the service. Please retry.";
}
export async function downloadReport(id) {
  return downloadBlob(runPath(id, "report.csv"), `recommendations-${id}.csv`);
}
export async function downloadBlob(path, filename) {
  const { data } = await api.get(path, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
