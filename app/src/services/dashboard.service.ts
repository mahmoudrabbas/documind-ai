import { apiClient } from "@/lib/api-client";
import type { DashboardSummaryResponse } from "@/types/api/dashboard.types";

export function getDashboardSummary(signal?: AbortSignal) {
  return apiClient<DashboardSummaryResponse>("/dashboard/summary", { signal });
}
