import { connection } from "next/server";
import { NextResponse } from "next/server";
import { saveTelegramChat } from "@/lib/xaiTelegram";

/**
 * Telegram bot webhook: any inbound message stores the chat id for alerts.
 * Optional secret: TELEGRAM_WEBHOOK_SECRET as ?secret= or x-telegram-bot-api-secret-token.
 */
export async function POST(req: Request) {
  await connection();

  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (expected) {
    const url = new URL(req.url);
    const fromQuery = url.searchParams.get("secret");
    const fromHeader = req.headers.get("x-telegram-bot-api-secret-token");
    if (fromQuery !== expected && fromHeader !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const update = (await req.json().catch(() => null)) as {
    message?: {
      chat?: {
        id?: number;
        title?: string;
        username?: string;
        first_name?: string;
      };
      from?: { username?: string };
      text?: string;
    };
  } | null;

  const chat = update?.message?.chat;
  if (chat?.id != null) {
    await saveTelegramChat({
      chatId: chat.id,
      chatTitle: chat.title || chat.first_name || chat.username || null,
      username: update?.message?.from?.username || chat.username || null,
    });
  }

  return NextResponse.json({ ok: true });
}
