import * as React from "react";
import { Cloud, LogIn, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/primitives";
import { toast } from "@/lib/toast";
import { loadSession, loadSupabaseConfig, saveSupabaseConfig } from "../extension/local-store.js";
import { signInWithPassword, signOutExtension } from "../extension/supabase-sync.js";

export function ExtensionSettingsDialog() {
  const [open, setOpen] = React.useState(false);
  const [url, setUrl] = React.useState("");
  const [key, setKey] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [signedInEmail, setSignedInEmail] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const navigate = (event: Event) => {
      const href = (event as CustomEvent<string>).detail;
      if (href === "/settings" || href === "/login") setOpen(true);
    };
    window.addEventListener("tabs:navigate", navigate);
    return () => window.removeEventListener("tabs:navigate", navigate);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    void Promise.all([loadSupabaseConfig(), loadSession()]).then(([config, session]) => {
      setUrl(config.url);
      setKey(config.publishableKey);
      setSignedInEmail(session?.user?.email ?? null);
      if (session?.user?.email) setEmail(session.user.email);
    });
  }, [open]);

  const saveConnection = async () => {
    await saveSupabaseConfig({ url, publishableKey: key });
    toast.success("Supabase connection saved on this device");
  };

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await saveSupabaseConfig({ url, publishableKey: key });
      const session = await signInWithPassword(email.trim(), password);
      setSignedInEmail(session.user?.email ?? email.trim());
      toast.success("Signed in", { description: "Reloading your local workspace profile…" });
      window.setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      toast.error("Could not sign in", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    await signOutExtension();
    toast.success("Signed out");
    window.setTimeout(() => window.location.reload(), 250);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader
          title="Extension settings"
          description="Your workspace always opens from chrome.storage.local. Supabase sync runs afterward."
        />
        <div className="space-y-4">
          <Field label="Supabase project URL" htmlFor="extension-supabase-url">
            <Input id="extension-supabase-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://project.supabase.co" />
          </Field>
          <Field label="Publishable key" htmlFor="extension-supabase-key">
            <Input id="extension-supabase-key" type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" />
          </Field>
          <Button type="button" variant="secondary" className="w-full justify-center" onClick={() => void saveConnection()}>
            <Cloud /> Save connection
          </Button>
          <div className="border-t border-border pt-4">
            {signedInEmail ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Signed in as <strong className="text-foreground">{signedInEmail}</strong></p>
                <Button type="button" variant="secondary" className="w-full justify-center" disabled={busy} onClick={() => void signOut()}><LogOut /> Sign out</Button>
              </div>
            ) : (
              <form className="space-y-3" onSubmit={signIn}>
                <Field label="Email" htmlFor="extension-email"><Input id="extension-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></Field>
                <Field label="Password" htmlFor="extension-password"><Input id="extension-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></Field>
                <Button type="submit" variant="primary" className="w-full justify-center" disabled={busy}><LogIn /> {busy ? "Signing in…" : "Sign in and sync"}</Button>
              </form>
            )}
          </div>
        </div>
        <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
