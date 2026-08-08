import Link from "next/link";

import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default async function AuthCodeErrorPage(
  props: PageProps<"/auth/auth-code-error">,
) {
  const params = await props.searchParams;
  const message =
    typeof params.message === "string"
      ? params.message
      : "That sign-in link is invalid or has already been used.";

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="px-6 py-5">
        <Wordmark />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-sm space-y-5 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Sign-in didn&apos;t complete
          </h1>
          <p className="text-sm text-muted-foreground">{message}</p>
          <Button asChild variant="primary">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
