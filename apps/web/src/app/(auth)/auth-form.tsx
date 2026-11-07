"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { CircleAlert, CircleCheckBig } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Separator, Spinner } from "@/components/ui/primitives";
import {
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
  type AuthFormState,
} from "./actions";

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      className="w-full"
      disabled={pending}
    >
      {pending ? <Spinner className="text-accent-foreground" /> : null}
      {children}
    </Button>
  );
}

// useFormStatus only reports the status of an ancestor form, so the button
// has to be its own component rendered inside it.
function GoogleSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="secondary"
      className="w-full"
      disabled={pending}
    >
      {pending ? <Spinner /> : <GoogleGlyph />}
      Continue with Google
    </Button>
  );
}

function GoogleButton({ next }: { next: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(
    signInWithGoogle,
    {},
  );

  return (
    <form action={action} className="w-full">
      <input type="hidden" name="next" value={next} />
      <GoogleSubmit />
      {state.error ? (
        <p className="mt-2 text-xs text-destructive">{state.error}</p>
      ) : null}
    </form>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

function Feedback({ state }: { state: AuthFormState }) {
  if (state.error) {
    return (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-[13px] text-destructive"
      >
        <CircleAlert className="mt-px size-4 shrink-0" />
        <span>{state.error}</span>
      </div>
    );
  }
  if (state.notice) {
    return (
      <div
        role="status"
        className="flex items-start gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-[13px] text-success"
      >
        <CircleCheckBig className="mt-px size-4 shrink-0" />
        <span>{state.notice}</span>
      </div>
    );
  }
  return null;
}

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(
    signInWithPassword,
    {},
  );

  return (
    <div className="space-y-5">
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Feedback state={state} />
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            required
          />
        </Field>
        <SubmitButton>Sign in</SubmitButton>
      </form>

      <div className="flex items-center gap-3">
        <Separator className="shrink" />
        <span className="text-[11px] uppercase tracking-wide text-faint-foreground">
          or
        </span>
        <Separator className="shrink" />
      </div>

      <GoogleButton next={next} />

      <p className="text-center text-[13px] text-muted-foreground">
        No account yet?{" "}
        <Link
          href="/signup"
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}

export function SignupForm({ next }: { next: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(
    signUpWithPassword,
    {},
  );

  return (
    <div className="space-y-5">
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Feedback state={state} />
        <Field label="Display name" htmlFor="displayName" hint="Optional.">
          <Input
            id="displayName"
            name="displayName"
            autoComplete="name"
            placeholder="Lui"
          />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          hint="At least 8 characters."
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            minLength={8}
            required
          />
        </Field>
        <SubmitButton>Create account</SubmitButton>
      </form>

      <div className="flex items-center gap-3">
        <Separator className="shrink" />
        <span className="text-[11px] uppercase tracking-wide text-faint-foreground">
          or
        </span>
        <Separator className="shrink" />
      </div>

      <GoogleButton next={next} />

      <p className="text-center text-[13px] text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
