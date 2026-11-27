import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useAuth } from "./auth";
export function useResource(key, path, params, options = {}) {
  const scope = useAuth()?.user?.id || "isolated-test";
  return useQuery({
    queryKey: [scope, ...key, params || {}],
    queryFn: async ({ signal }) =>
      (
        await api.get(typeof path === "function" ? path() : path, {
          params,
          signal,
        })
      ).data,
    ...options,
  });
}
