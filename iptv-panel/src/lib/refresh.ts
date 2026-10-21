import {
  CachedChannel,
  getDb,
  nowIso,
  PlaylistSource,
} from "@/lib/db";
import { parseM3u } from "@/lib/m3u";

export type RefreshResult = {
  logId: number;
  sourcesOk: number;
  sourcesFailed: number;
  message: string;
  errors: Array<{ sourceId: number; name: string; error: string }>;
};

async function fetchUrlText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "BIGBROTHER-IPTV-Panel/1.0",
        Accept: "application/vnd.apple.mpegurl, audio/x-mpegurl, text/plain, */*",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function replaceCache(sourceId: number, text: string): number {
  const database = getDb();
  const channels = parseM3u(text);
  if (channels.length === 0) {
    throw new Error("Parsed M3U contained zero channels");
  }

  const tx = database.transaction(() => {
    database.prepare("DELETE FROM cached_channels WHERE source_id = ?").run(sourceId);
    const insert = database.prepare(`
      INSERT INTO cached_channels
        (source_id, name, url, logo, group_title, tvg_id, sort_order, updated_at)
      VALUES
        (@source_id, @name, @url, @logo, @group_title, @tvg_id, @sort_order, @updated_at)
    `);
    const updatedAt = nowIso();
    channels.forEach((ch, index) => {
      insert.run({
        source_id: sourceId,
        name: ch.name,
        url: ch.url,
        logo: ch.logo,
        group_title: ch.group_title,
        tvg_id: ch.tvg_id,
        sort_order: index,
        updated_at: updatedAt,
      });
    });
    database
      .prepare(
        `UPDATE playlist_sources
         SET last_fetched_at = ?, last_error = NULL, last_channel_count = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(updatedAt, channels.length, updatedAt, sourceId);
  });

  tx();
  return channels.length;
}

function markSourceError(sourceId: number, error: string) {
  const database = getDb();
  // Keep last-good cache; only record the failure.
  database
    .prepare(
      `UPDATE playlist_sources
       SET last_error = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(error.slice(0, 1000), nowIso(), sourceId);
}

export async function refreshSource(source: PlaylistSource): Promise<number> {
  let text: string;
  if (source.source_type === "content") {
    if (!source.content?.trim()) {
      throw new Error("Empty pasted M3U content");
    }
    text = source.content;
  } else {
    if (!source.url?.trim()) {
      throw new Error("Missing upstream URL");
    }
    text = await fetchUrlText(source.url.trim());
  }
  return replaceCache(source.id, text);
}

export async function refreshAllSources(options?: {
  onlyEnabled?: boolean;
}): Promise<RefreshResult> {
  const database = getDb();
  const onlyEnabled = options?.onlyEnabled !== false;

  const log = database
    .prepare(
      `INSERT INTO refresh_logs (started_at, status) VALUES (?, 'running') RETURNING id`
    )
    .get(nowIso()) as { id: number };

  const sources = database
    .prepare(
      onlyEnabled
        ? `SELECT * FROM playlist_sources WHERE enabled = 1 ORDER BY id`
        : `SELECT * FROM playlist_sources ORDER BY id`
    )
    .all() as PlaylistSource[];

  let sourcesOk = 0;
  let sourcesFailed = 0;
  const errors: RefreshResult["errors"] = [];

  for (const source of sources) {
    try {
      await refreshSource(source);
      sourcesOk += 1;
    } catch (err) {
      sourcesFailed += 1;
      const message = err instanceof Error ? err.message : String(err);
      markSourceError(source.id, message);
      errors.push({ sourceId: source.id, name: source.name, error: message });
      console.error(`[refresh] source ${source.id} (${source.name}):`, message);
    }
  }

  const finished = nowIso();
  const status =
    sourcesFailed === 0 ? "ok" : sourcesOk === 0 ? "failed" : "partial";
  const message =
    sources.length === 0
      ? "No playlist sources configured"
      : `Refreshed ${sourcesOk}/${sources.length} sources` +
        (sourcesFailed ? `; ${sourcesFailed} failed (cache retained)` : "");

  database
    .prepare(
      `UPDATE refresh_logs
       SET finished_at = ?, status = ?, message = ?, sources_ok = ?, sources_failed = ?
       WHERE id = ?`
    )
    .run(finished, status, message, sourcesOk, sourcesFailed, log.id);

  return {
    logId: log.id,
    sourcesOk,
    sourcesFailed,
    message,
    errors,
  };
}

export function getChannelsForDevice(deviceId: number): CachedChannel[] {
  const database = getDb();
  const device = database
    .prepare("SELECT * FROM devices WHERE id = ?")
    .get(deviceId) as { package_id: number | null } | undefined;
  if (!device) return [];

  const rows = database
    .prepare(
      `
      SELECT c.*
      FROM cached_channels c
      JOIN playlist_sources s ON s.id = c.source_id
      WHERE s.enabled = 1
        AND (
          s.device_id = ?
          OR (s.package_id IS NOT NULL AND s.package_id = ?)
        )
      ORDER BY c.group_title COLLATE NOCASE, c.sort_order, c.name COLLATE NOCASE
    `
    )
    .all(deviceId, device.package_id) as CachedChannel[];

  return rows;
}
