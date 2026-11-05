(() => {
  const el = document.getElementById("launch-countdown");
  const video = document.querySelector(".launch-video");
  if (!el) return;

  const TARGET = new Date("2026-11-08T23:50:00+01:00"); // Sunday 23:50 Warsaw

  function fmt(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${d}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
  }

  function tick() {
    const left = TARGET.getTime() - Date.now();
    if (left <= 0) {
      el.textContent = "Launch window open · issuing available";
      return;
    }
    el.textContent = `Install window closes Sunday 23:50 · ${fmt(left)} remaining`;
    requestAnimationFrame(() => setTimeout(tick, 1000));
  }

  tick();

  if (video) {
    const play = () => video.play().catch(() => {});
    play();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) play();
    });
  }
})();
