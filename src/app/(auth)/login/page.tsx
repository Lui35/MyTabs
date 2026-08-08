import type { Metadata } from "next";

import { LoginForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const raw = params.next;
  const next = typeof raw === "string" && raw.startsWith("/") ? raw : "/";

  return (
    <div className="space-y-7">
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Welcome back
        </h1>
        <p className="text-sm text-muted-foreground">
          Sign in to open your workspace.
        </p>
      </div>
      <LoginForm next={next} />
    </div>
  );
}
