"use client";

import * as React from "react";

import { getDomain, isSafeUrl } from "@/lib/url";
import { cn, hashHue } from "@/lib/utils";

/**
 * Favicon with a guaranteed-visible fallback.
 *
 * Uses a plain <img> rather than next/image: the sources are arbitrary
 * third-party hosts, which the image optimizer would need allow-listed one by
 * one. A failed load silently degrades to a letter mark — a broken-image icon
 * must never appear.
 */
export function Favicon({
  url,
  favicon,
  size = 16,
  className,
}: {
  url: string;
  favicon?: string | null;
  size?: number;
  className?: string;
}) {
  const src = React.useMemo(() => {
    const candidate = favicon?.trim();
    if (!candidate) return null;
    // Inline data: icons are common in exports and are safe as image sources.
    if (candidate.startsWith("data:image/")) return candidate;
    return isSafeUrl(candidate) ? candidate : null;
  }, [favicon]);

  // Retry when the source changes (e.g. after "Refresh metadata").
  // Adjusting state during render is the documented way to reset on a prop
  // change without an extra commit; an effect here would double-render every
  // icon in the workspace.
  const [loadState, setLoadState] = React.useState({ src, failed: false });
  if (loadState.src !== src) setLoadState({ src, failed: false });
  const failed = loadState.failed;

  const domain = getDomain(url);

  if (!src || failed) {
    return <LetterMark domain={domain} size={size} className={className} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setLoadState({ src, failed: true })}
      style={{ width: size, height: size }}
      className={cn("shrink-0 rounded-[3px] object-contain", className)}
    />
  );
}

function LetterMark({
  domain,
  size,
  className,
}: {
  domain: string;
  size: number;
  className?: string;
}) {
  const letter = (domain.replace(/^www\./, "")[0] ?? "?").toUpperCase();
  const hue = hashHue(domain || letter);

  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, Math.round(size * 0.58)),
        backgroundColor: `oklch(0.82 0.09 ${hue})`,
        color: `oklch(0.32 0.12 ${hue})`,
      }}
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-[3px] font-semibold leading-none",
        className,
      )}
    >
      {letter}
    </span>
  );
}
