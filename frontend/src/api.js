import axios from "axios";
export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}/api/v1`,
  timeout: 20000,
});
export const errorMessage = (e) =>
  typeof e.response?.data?.detail === "string"
    ? e.response.data.detail
    : e.response?.status === 422
      ? "Check the entered values."
      : "Unable to reach the service. Please retry.";
export async function downloadReport(id) {
  const { data } = await api.get(`/runs/${id}/report.csv`, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `recommendations-${id}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
