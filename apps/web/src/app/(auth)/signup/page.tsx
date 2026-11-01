import type { Metadata } from "next";

import { SignupForm } from "../auth-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage(props: PageProps<"/signup">) {
  const params = await props.searchParams;
  const raw = params.next;
  const next = typeof raw === "string" && raw.startsWith("/") ? raw : "/";

  return (
    <div className="space-y-7">
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Create your workspace
        </h1>
        <p className="text-sm text-muted-foreground">
          Collect, organize and search every site worth keeping.
        </p>
      </div>
      <SignupForm next={next} />
    </div>
  );
}
