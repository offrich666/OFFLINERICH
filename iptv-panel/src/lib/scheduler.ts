import cron from "node-cron";
import { refreshAllSources } from "@/lib/refresh";

declare global {
  // eslint-disable-next-line no-var
  var __bbIptvCronStarted: boolean | undefined;
}

/** Start daily playlist refresh once per Node process. */
export function startDailyRefreshCron() {
  if (process.env.DISABLE_CRON === "1") {
    console.log("[cron] disabled via DISABLE_CRON=1");
    return;
  }

  if (globalThis.__bbIptvCronStarted) return;
  globalThis.__bbIptvCronStarted = true;

  // Default: every day at 04:00 server time. Override with CRON_SCHEDULE.
  const schedule = process.env.CRON_SCHEDULE || "0 4 * * *";

  if (!cron.validate(schedule)) {
    console.error(`[cron] invalid CRON_SCHEDULE="${schedule}"`);
    return;
  }

  cron.schedule(schedule, async () => {
    console.log("[cron] starting daily playlist refresh");
    try {
      const result = await refreshAllSources();
      console.log("[cron]", result.message);
    } catch (err) {
      console.error("[cron] refresh failed:", err);
    }
  });

  console.log(`[cron] daily refresh scheduled (${schedule})`);
}
