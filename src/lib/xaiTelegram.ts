import "server-only";
import { promises as fs } from "fs";
import path from "path";

/** Vercel serverless FS is read-only except /tmp. Local/dev uses ./data. */
const DATA_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join("/tmp", "offlinerich-data")
    : path.join(process.cwd(), "data");
const TELEGRAM_FILE = path.join(DATA_DIR, "xai-telegram.json");

export type TelegramLinkState = {
  chatId: string | null;
  chatTitle: string | null;
  username: string | null;
  linkedAt: string | null;
  lastError: string | null;
  updatedAt: string;
};

function botToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
}

function envChatId(): string {
  return process.env.TELEGRAM_CHAT_ID?.trim() || "";
}

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(TELEGRAM_FILE);
  } catch {
    const initial: TelegramLinkState = {
      chatId: envChatId() || null,
      chatTitle: null,
      username: null,
      linkedAt: envChatId() ? new Date().toISOString() : null,
      lastError: null,
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(TELEGRAM_FILE, JSON.stringify(initial, null, 2) + "\n", "utf8");
  }
}

export async function getTelegramLink(): Promise<TelegramLinkState> {
  await ensureStore();
  const raw = await fs.readFile(TELEGRAM_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw) as Partial<TelegramLinkState>;
    return {
      chatId: parsed.chatId || envChatId() || null,
      chatTitle: parsed.chatTitle ?? null,
      username: parsed.username ?? null,
      linkedAt: parsed.linkedAt ?? null,
      lastError: parsed.lastError ?? null,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return {
      chatId: envChatId() || null,
      chatTitle: null,
      username: null,
      linkedAt: null,
      lastError: null,
      updatedAt: new Date().toISOString(),
    };
  }
}

async function writeTelegramLink(state: TelegramLinkState) {
  await ensureStore();
  state.updatedAt = new Date().toISOString();
  await fs.writeFile(TELEGRAM_FILE, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export async function saveTelegramChat(input: {
  chatId: string | number;
  chatTitle?: string | null;
  username?: string | null;
}): Promise<TelegramLinkState> {
  const state = await getTelegramLink();
  state.chatId = String(input.chatId);
  state.chatTitle = input.chatTitle ?? state.chatTitle;
  state.username = input.username ?? state.username;
  state.linkedAt = new Date().toISOString();
  state.lastError = null;
  await writeTelegramLink(state);
  return state;
}

type TelegramUpdate = {
  message?: {
    chat?: {
      id?: number;
      title?: string;
      username?: string;
      first_name?: string;
      type?: string;
    };
    from?: { username?: string; first_name?: string };
    text?: string;
  };
};

export async function discoverTelegramChatFromUpdates(): Promise<TelegramLinkState> {
  const token = botToken();
  const state = await getTelegramLink();
  if (!token) {
    state.lastError = "TELEGRAM_BOT_TOKEN is not set";
    await writeTelegramLink(state);
    return state;
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?limit=20`,
      { cache: "no-store" },
    );
    const body = (await res.json()) as {
      ok: boolean;
      result?: TelegramUpdate[];
      description?: string;
    };
    if (!body.ok) {
      state.lastError = body.description || "getUpdates failed";
      await writeTelegramLink(state);
      return state;
    }

    const updates = [...(body.result || [])].reverse();
    for (const update of updates) {
      const chat = update.message?.chat;
      if (!chat?.id) continue;
      return saveTelegramChat({
        chatId: chat.id,
        chatTitle: chat.title || chat.first_name || chat.username || null,
        username: update.message?.from?.username || chat.username || null,
      });
    }

    state.lastError =
      "No Telegram chat yet. Open https://t.me/botapilimit_bot and send /start, then link again.";
    await writeTelegramLink(state);
    return state;
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : "telegram_discover_failed";
    await writeTelegramLink(state);
    return state;
  }
}

export async function sendTelegramAlert(text: string): Promise<{
  ok: boolean;
  error?: string;
  chatId?: string | null;
}> {
  const token = botToken();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN is not set" };

  let link = await getTelegramLink();
  if (!link.chatId) {
    link = await discoverTelegramChatFromUpdates();
  }
  if (!link.chatId) {
    return {
      ok: false,
      error: link.lastError || "TELEGRAM_CHAT_ID missing — message the bot first",
      chatId: null,
    };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: link.chatId,
        text,
        disable_web_page_preview: true,
      }),
      cache: "no-store",
    });
    const body = (await res.json()) as { ok: boolean; description?: string };
    if (!body.ok) {
      link.lastError = body.description || `sendMessage HTTP ${res.status}`;
      await writeTelegramLink(link);
      return { ok: false, error: link.lastError, chatId: link.chatId };
    }
    link.lastError = null;
    await writeTelegramLink(link);
    return { ok: true, chatId: link.chatId };
  } catch (err) {
    const error = err instanceof Error ? err.message : "telegram_send_failed";
    link.lastError = error;
    await writeTelegramLink(link);
    return { ok: false, error, chatId: link.chatId };
  }
}

export function telegramBotConfigured(): boolean {
  return Boolean(botToken());
}
