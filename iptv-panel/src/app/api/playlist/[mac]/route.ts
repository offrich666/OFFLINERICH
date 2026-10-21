import { NextRequest, NextResponse } from "next/server";
import { Device, getDb, normalizeMac } from "@/lib/db";
import { buildM3u } from "@/lib/m3u";
import { getChannelsForDevice } from "@/lib/refresh";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ mac: string }> };

function stripExtension(raw: string): string {
  return raw.replace(/\.m3u8?$/i, "");
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { mac: rawMac } = await ctx.params;
  const token = new URL(req.url).searchParams.get("token");

  let mac: string;
  try {
    mac = normalizeMac(stripExtension(decodeURIComponent(rawMac)));
  } catch {
    return new NextResponse("#EXTM3U\n# Invalid MAC address\n", {
      status: 400,
      headers: { "Content-Type": "application/x-mpegURL; charset=utf-8" },
    });
  }

  const database = getDb();
  const device = database
    .prepare("SELECT * FROM devices WHERE mac = ?")
    .get(mac) as Device | undefined;

  if (!device) {
    return new NextResponse("#EXTM3U\n# Device not found\n", {
      status: 404,
      headers: { "Content-Type": "application/x-mpegURL; charset=utf-8" },
    });
  }

  if (!device.enabled) {
    return new NextResponse("#EXTM3U\n# Device disabled\n", {
      status: 403,
      headers: { "Content-Type": "application/x-mpegURL; charset=utf-8" },
    });
  }

  // Token is optional globally; if REQUIRE_PLAYLIST_TOKEN=1, token must match.
  const requireToken = process.env.REQUIRE_PLAYLIST_TOKEN === "1";
  if (requireToken || token) {
    if (!token || token !== device.token) {
      return new NextResponse("#EXTM3U\n# Invalid or missing token\n", {
        status: 401,
        headers: { "Content-Type": "application/x-mpegURL; charset=utf-8" },
      });
    }
  }

  const channels = getChannelsForDevice(device.id);
  const m3u = buildM3u(channels, {
    playlistName: `BIGBROTHER IPTV — ${device.name || device.mac}`,
  });

  const filename = `${mac.replace(/:/g, "")}.m3u`;
  return new NextResponse(m3u, {
    status: 200,
    headers: {
      "Content-Type": "application/x-mpegURL; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
