import { Wordmark } from "@/components/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="px-6 py-5">
        <Wordmark />
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-sm">{children}</div>
      </main>

      <footer className="px-6 py-5 text-center text-xs text-faint-foreground">
        Your collections sync privately to your own account.
      </footer>
    </div>
  );
}
