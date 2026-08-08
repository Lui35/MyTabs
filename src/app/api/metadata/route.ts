import { NextResponse } from "next/server";

/**
 * Best-effort title/favicon lookup for the "Add website" dialog.
 *
 * This fetches a user-supplied URL from the server, so it is a classic SSRF
 * surface: only http(s) is allowed, private and loopback address literals are
 * rejected, redirects are not followed, and the response body is capped.
 */

const MAX_BYTES = 256 * 1024;
const TIMEOUT_MS = 6000;

const PRIVATE_HOST = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /\.local$/i,
  /\.internal$/i,
];

function isDisallowedHost(hostname: string): boolean {
  return PRIVATE_HOST.some((pattern) => pattern.test(hostname));
}

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ");
}

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json(
      { error: "Only http and https URLs are supported" },
      { status: 400 },
    );
  }
  if (isDisallowedHost(parsed.hostname)) {
    return NextResponse.json(
      { error: "That host isn't reachable" },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(parsed.toString(), {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        // Some sites serve a stub to unknown agents; ask politely for HTML.
        accept: "text/html,application/xhtml+xml",
        "user-agent": "TabsBot/1.0 (+metadata preview)",
      },
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("html") || !response.body) {
      return NextResponse.json({
        title: null,
        favicon: `${parsed.origin}/favicon.ico`,
      });
    }

    // Read at most MAX_BYTES — <head> is always near the start.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let received = 0;
    while (received < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    void reader.cancel();

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch
      ? decodeEntities(titleMatch[1]).replace(/\s+/g, " ").trim().slice(0, 300)
      : null;

    const iconMatch = html.match(
      /<link[^>]+rel=["'][^"']*\b(?:shortcut\s+)?icon\b[^"']*["'][^>]*>/i,
    );
    let favicon = `${parsed.origin}/favicon.ico`;
    if (iconMatch) {
      const hrefMatch = iconMatch[0].match(/href=["']([^"']+)["']/i);
      if (hrefMatch) {
        try {
          favicon = new URL(decodeEntities(hrefMatch[1]), parsed).toString();
        } catch {
          // keep the origin fallback
        }
      }
    }

    return NextResponse.json({ title, favicon });
  } catch {
    return NextResponse.json({
      title: null,
      favicon: `${parsed.origin}/favicon.ico`,
    });
  } finally {
    clearTimeout(timer);
  }
}
