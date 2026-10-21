export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDailyRefreshCron } = await import("@/lib/scheduler");
    startDailyRefreshCron();
  }
}
