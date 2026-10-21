import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const dbPath = process.env.DATABASE_PATH || path.join(dataDir, "iptv.sqlite");

let db: Database.Database | null = null;

export type Device = {
  id: number;
  mac: string;
  name: string;
  enabled: number;
  token: string;
  package_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Package = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type PlaylistSource = {
  id: number;
  name: string;
  source_type: "url" | "content";
  url: string | null;
  content: string | null;
  package_id: number | null;
  device_id: number | null;
  enabled: number;
  last_fetched_at: string | null;
  last_error: string | null;
  last_channel_count: number;
  created_at: string;
  updated_at: string;
};

export type CachedChannel = {
  id: number;
  source_id: number;
  name: string;
  url: string;
  logo: string | null;
  group_title: string;
  tvg_id: string | null;
  sort_order: number;
  updated_at: string;
};

export type Category = {
  id: number;
  name: string;
  slug: string;
  is_builtin: number;
  sort_order: number;
};

export type RefreshLog = {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  message: string | null;
  sources_ok: number;
  sources_failed: number;
};

export function getDb(): Database.Database {
  if (db) return db;

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mac TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      token TEXT NOT NULL,
      package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS playlist_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK (source_type IN ('url', 'content')),
      url TEXT,
      content TEXT,
      package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE,
      device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_fetched_at TEXT,
      last_error TEXT,
      last_channel_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (
        (package_id IS NOT NULL AND device_id IS NULL)
        OR (package_id IS NULL AND device_id IS NOT NULL)
      )
    );

    CREATE TABLE IF NOT EXISTS cached_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES playlist_sources(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      logo TEXT,
      group_title TEXT NOT NULL DEFAULT 'Uncategorized',
      tvg_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 100
    );

    CREATE TABLE IF NOT EXISTS refresh_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      message TEXT,
      sources_ok INTEGER NOT NULL DEFAULT 0,
      sources_failed INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_devices_mac ON devices(mac);
    CREATE INDEX IF NOT EXISTS idx_channels_source ON cached_channels(source_id);
    CREATE INDEX IF NOT EXISTS idx_sources_package ON playlist_sources(package_id);
    CREATE INDEX IF NOT EXISTS idx_sources_device ON playlist_sources(device_id);
  `);

  seedBuiltins(database);
}

function seedBuiltins(database: Database.Database) {
  const builtins = [
    { name: "International", slug: "international", sort_order: 10 },
    { name: "Albanian Sports", slug: "albanian-sports", sort_order: 20 },
    { name: "Big Brother / Reality", slug: "big-brother-reality", sort_order: 30 },
  ];

  const insertCat = database.prepare(`
    INSERT OR IGNORE INTO categories (name, slug, is_builtin, sort_order)
    VALUES (@name, @slug, 1, @sort_order)
  `);

  for (const cat of builtins) {
    insertCat.run(cat);
  }

  const packageCount = database.prepare("SELECT COUNT(*) AS c FROM packages").get() as {
    c: number;
  };
  if (packageCount.c === 0) {
    const pkg = database
      .prepare(
        `INSERT INTO packages (name, description) VALUES (?, ?) RETURNING id`
      )
      .get(
        "Demo Package",
        "Sample package with public demo streams only — replace with your legitimate M3U sources."
      ) as { id: number };

    const demoM3u = `#EXTM3U
#EXTINF:-1 tvg-id="bbb" tvg-logo="" group-title="International",Big Buck Bunny (DEMO)
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
#EXTINF:-1 tvg-id="sintel" tvg-logo="" group-title="Big Brother / Reality",Sintel Trailer (DEMO — not live TV)
https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8
`;

    database
      .prepare(
        `INSERT INTO playlist_sources
          (name, source_type, content, package_id, enabled, last_fetched_at, last_channel_count)
         VALUES (?, 'content', ?, ?, 1, datetime('now'), 2)`
      )
      .run("Demo public streams (placeholder)", demoM3u, pkg.id);

    const sourceId = (
      database.prepare("SELECT id FROM playlist_sources ORDER BY id DESC LIMIT 1").get() as {
        id: number;
      }
    ).id;

    const insertCh = database.prepare(`
      INSERT INTO cached_channels (source_id, name, url, logo, group_title, tvg_id, sort_order)
      VALUES (@source_id, @name, @url, @logo, @group_title, @tvg_id, @sort_order)
    `);

    insertCh.run({
      source_id: sourceId,
      name: "Big Buck Bunny (DEMO)",
      url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      logo: null,
      group_title: "International",
      tvg_id: "bbb",
      sort_order: 0,
    });
    insertCh.run({
      source_id: sourceId,
      name: "Sintel Trailer (DEMO — not live TV)",
      url: "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8",
      logo: null,
      group_title: "Big Brother / Reality",
      tvg_id: "sintel",
      sort_order: 1,
    });
  }
}

export function normalizeMac(mac: string): string {
  const cleaned = mac.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (cleaned.length !== 12) {
    throw new Error("MAC address must contain exactly 12 hex digits");
  }
  return cleaned.match(/.{1,2}/g)!.join(":");
}

export function generateToken(): string {
  return randomBytes(24).toString("hex");
}

export function nowIso(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
