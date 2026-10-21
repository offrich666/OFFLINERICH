# BIGBROTHER IPTV Panel

Owner web panel for managing MAC devices, shared packages, and legitimate M3U playlist sources. Each device gets a stable M3U endpoint. Upstream URLs refresh daily without wiping last-good cache on failure.

**This app ships with no pirated IPTV sources.** A demo package uses public test streams (e.g. Big Buck Bunny) labeled as demos so you can verify M3U delivery. Replace them with playlists you are authorized to use.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- SQLite (`better-sqlite3`) stored under `data/`
- Cookie session auth (`iron-session`) with `ADMIN_PASSWORD`
- In-process daily cron (`node-cron`) plus `POST /api/cron/refresh`

## Quick start

```bash
cd iptv-panel
cp .env.example .env.local
# edit ADMIN_PASSWORD and SESSION_SECRET
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with `ADMIN_PASSWORD`.

Production:

```bash
npm run build
npm start
```

## Owner workflow

1. Create a **package** (shared channel bundle).
2. On **Sources**, attach an upstream M3U URL, paste M3U text, or upload an `.m3u` / `.m3u8` file to that package (or to a single device).
3. Add a **device** by MAC address and assign the package.
4. Copy the device playlist URL:

   ```
   /api/playlist/{MAC}.m3u?token={deviceToken}
   ```

5. Use **Refresh** (or wait for the daily cron) to re-fetch URL sources.

## Playlist endpoint

- `GET /api/playlist/{mac}.m3u`
- Optional `?token=` — always accepted when provided; set `REQUIRE_PLAYLIST_TOKEN=1` to require it.
- Disabled devices return `403`.
- Output includes `#EXTINF` lines with `group-title` for categories.

## Categories

Built-in group titles:

- International
- Albanian Sports
- Big Brother / Reality

Add custom categories in the UI. Channel `group-title` values in your M3U should match these names for grouping.

## Daily auto-update

- Default schedule: `0 4 * * *` (override with `CRON_SCHEDULE`)
- Started from `instrumentation.ts` when the Node server boots
- Failed fetches log errors and **retain** the previous cached channels
- External trigger: `POST /api/cron/refresh` (optional `Authorization: Bearer $CRON_SECRET`)

## Environment

See `.env.example` for all variables.

## Project layout

```
iptv-panel/
  src/app/admin/     # owner UI
  src/app/api/       # REST + playlist + cron
  src/lib/           # db, m3u parser, refresh, session
  data/              # sqlite (gitignored)
```
