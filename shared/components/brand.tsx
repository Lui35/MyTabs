import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("size-6", className)}
    >
      <rect
        x="2.5"
        y="6.5"
        width="19"
        height="14"
        rx="3"
        className="fill-accent-soft stroke-accent"
        strokeWidth="1.5"
      />
      <path
        d="M2.5 10.5h19"
        className="stroke-accent"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M6.5 3.5h8a3 3 0 0 1 3 3"
        className="stroke-accent"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle cx="6" cy="8.5" r="0.9" className="fill-accent" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <Logo />
      <span className="text-[15px] font-semibold tracking-tight text-foreground">
        Tabs
      </span>
    </span>
  );
}
