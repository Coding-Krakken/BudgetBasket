"use server";
import { syncAllProviderData } from "@/providers/sync";

export async function triggerSyncAll() {
  const result = await syncAllProviderData();
  const succeeded = result.results.filter(r => r.status === "SUCCESS" || r.status === "SUCCESS_WITH_ERRORS").length;
  const failed = result.results.filter(r => r.status === "FAILED").length;
  const skipped = result.results.filter(r => r.status === "SKIPPED").length;
  return { succeeded, failed, skipped, total: result.results.length };
}
