import { connection } from "next/server";
import { NextResponse } from "next/server";
import { assertOpsKey } from "@/lib/xaiUsage";
import {
  discoverTelegramChatFromUpdates,
  getTelegramLink,
  saveTelegramChat,
  sendTelegramAlert,
  telegramBotConfigured,
} from "@/lib/xaiTelegram";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || req.headers.get("x-ops-key");
  if (!assertOpsKey(key)) return unauthorized();

  const link = await getTelegramLink();
  return NextResponse.json({
    configured: telegramBotConfigured(),
    botUsername: "botapilimit_bot",
    botUrl: "https://t.me/botapilimit_bot",
    link,
  });
}

export async function POST(req: Request) {
  await connection();
  const body = (await req.json().catch(() => ({}))) as {
    key?: string;
    action?: "link" | "test" | "save_chat";
    chatId?: string;
  };
  const url = new URL(req.url);
  const key = body.key || url.searchParams.get("key") || req.headers.get("x-ops-key");
  if (!assertOpsKey(key)) return unauthorized();

  if (!telegramBotConfigured()) {
    return NextResponse.json(
      { ok: false, error: "TELEGRAM_BOT_TOKEN is not set" },
      { status: 503 },
    );
  }

  const action = body.action || "link";

  if (action === "save_chat" && body.chatId) {
    const link = await saveTelegramChat({ chatId: body.chatId });
    return NextResponse.json({ ok: true, link });
  }

  if (action === "test") {
    const result = await sendTelegramAlert(
      "✅ Test alert from xAI token monitor\n" +
        "Telegram link works. You will get alerts at the configured token threshold.",
    );
    const link = await getTelegramLink();
    return NextResponse.json({ ok: result.ok, result, link });
  }

  const link = await discoverTelegramChatFromUpdates();
  return NextResponse.json({
    ok: Boolean(link.chatId),
    link,
    hint: link.chatId
      ? "Telegram chat linked"
      : "Open https://t.me/botapilimit_bot , send /start, then click Link Telegram again",
  });
}
