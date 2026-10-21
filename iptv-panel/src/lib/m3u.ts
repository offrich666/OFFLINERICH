export type ParsedChannel = {
  name: string;
  url: string;
  logo: string | null;
  group_title: string;
  tvg_id: string | null;
};

const ATTR_RE = /([\w-]+)="([^"]*)"/g;

function parseExtinfAttrs(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let match: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((match = ATTR_RE.exec(line)) !== null) {
    attrs[match[1].toLowerCase()] = match[2];
  }
  return attrs;
}

function channelNameFromExtinf(line: string): string {
  const comma = line.lastIndexOf(",");
  if (comma === -1) return "Unknown";
  return line.slice(comma + 1).trim() || "Unknown";
}

/** Parse M3U / M3U8 playlist text into channel entries. */
export function parseM3u(text: string): ParsedChannel[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const channels: ParsedChannel[] = [];
  let pending: { attrs: Record<string, string>; name: string } | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      pending = {
        attrs: parseExtinfAttrs(line),
        name: channelNameFromExtinf(line),
      };
      continue;
    }

    if (line.startsWith("#")) continue;

    if (pending) {
      channels.push({
        name: pending.name,
        url: line,
        logo: pending.attrs["tvg-logo"] || pending.attrs["logo"] || null,
        group_title: pending.attrs["group-title"] || "Uncategorized",
        tvg_id: pending.attrs["tvg-id"] || null,
      });
      pending = null;
    }
  }

  return channels;
}

export function buildM3u(
  channels: Array<{
    name: string;
    url: string;
    logo?: string | null;
    group_title?: string | null;
    tvg_id?: string | null;
  }>,
  options?: { playlistName?: string }
): string {
  const header = ["#EXTM3U"];
  if (options?.playlistName) {
    header.push(`#PLAYLIST:${options.playlistName}`);
  }

  const body = channels.map((ch) => {
    const attrs = [
      ch.tvg_id ? `tvg-id="${escapeAttr(ch.tvg_id)}"` : null,
      ch.logo ? `tvg-logo="${escapeAttr(ch.logo)}"` : null,
      `group-title="${escapeAttr(ch.group_title || "Uncategorized")}"`,
    ]
      .filter(Boolean)
      .join(" ");

    return `#EXTINF:-1 ${attrs},${ch.name}\n${ch.url}`;
  });

  return `${header.join("\n")}\n${body.join("\n")}\n`;
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, "'");
}
