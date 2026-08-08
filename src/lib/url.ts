/**
 * URL handling. Everything stored in the workspace is arbitrary user/imported
 * data, so parsing is defensive and only http(s) is ever considered openable.
 */

const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

/** Parse a URL, tolerating input typed without a scheme. Never throws. */
export function parseUrl(input: string): URL | null {
  const raw = input.trim();
  if (!raw) return null;

  try {
    return new URL(raw);
  } catch {
    // Bare host like "youtube.com/watch" — retry as https.
    if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
      try {
        return new URL(`https://${raw}`);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * True only for URLs that are safe to put in an href or open.
 * Explicitly rejects javascript:, data:, vbscript:, file: and friends.
 */
export function isSafeUrl(input: string): boolean {
  const url = parseUrl(input);
  return url !== null && SAFE_PROTOCOLS.has(url.protocol);
}

/**
 * Returns the URL if it is safe to navigate to, otherwise "#".
 * Use this for every href rendered from stored data.
 */
export function safeHref(input: string): string {
  const url = parseUrl(input);
  if (!url || !SAFE_PROTOCOLS.has(url.protocol)) return "#";
  return url.toString();
}

/** Adds https:// to a bare host so stored URLs are always absolute. */
export function ensureProtocol(input: string): string {
  const url = parseUrl(input);
  return url ? url.toString() : input.trim();
}

/** "https://www.youtube.com/watch?v=1" -> "youtube.com" */
export function getDomain(input: string): string {
  const url = parseUrl(input);
  if (!url) return "";
  return url.hostname.replace(/^www\./i, "");
}

/**
 * Canonical form used to decide whether two saved sites are "the same".
 *
 *   https://youtube.com
 *   https://youtube.com/
 *   https://www.youtube.com/
 *
 * all normalize to `youtube.com`.
 *
 * Query strings are significant (a YouTube video id lives there) but the
 * fragment, default port, "www." prefix and trailing slash are not.
 */
export function normalizeUrl(input: string): string | null {
  const url = parseUrl(input);
  if (!url || !SAFE_PROTOCOLS.has(url.protocol)) return null;

  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  const path = url.pathname.replace(/\/+$/, "");
  const search = url.search === "?" ? "" : url.search;

  return `${host}${path}${search}`;
}

/** Best-effort favicon URL for a site, used when nothing was imported. */
export function guessFaviconUrl(input: string): string | null {
  const url = parseUrl(input);
  if (!url || !SAFE_PROTOCOLS.has(url.protocol)) return null;
  return `${url.origin}/favicon.ico`;
}

/** Human-readable label for a URL when a page has no title. */
export function titleFromUrl(input: string): string {
  const url = parseUrl(input);
  if (!url) return input.trim();
  const path = url.pathname.replace(/\/+$/, "");
  const domain = url.hostname.replace(/^www\./i, "");
  if (!path || path === "/") return domain;
  const last = path.split("/").filter(Boolean).pop() ?? "";
  const pretty = decodeURIComponent(last)
    .replace(/[-_]+/g, " ")
    .replace(/\.(html?|php|aspx?)$/i, "")
    .trim();
  return pretty ? `${pretty} · ${domain}` : domain;
}
