export function usePathname() {
  return "/";
}

export function useRouter() {
  return {
    push(href: string) {
      window.dispatchEvent(new CustomEvent("tabs:navigate", { detail: href }));
    },
    replace(href: string) {
      window.dispatchEvent(new CustomEvent("tabs:navigate", { detail: href }));
    },
    back() {},
    forward() {},
    refresh() {},
    prefetch: async () => undefined,
  };
}
