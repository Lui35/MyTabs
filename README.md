# Tabs

A visual, searchable, keyboard-driven workspace for the websites and browser
tabs worth keeping. Collections you can drag around, live browser tabs you can
drop straight in, Double-Shift quick search, and Supabase cloud sync.

```
capture → organize → sync → search → reopen
```

## Products

| Product | Role | Runtime | Documentation |
| --- | --- | --- | --- |
| Standalone Chrome extension | **Primary product** | Packaged local files; no server | [`apps/extension/README.md`](apps/extension/README.md) |
| Next.js web app | Secondary Vercel implementation | Web server or Vercel deployment | [`apps/web/README.md`](apps/web/README.md) |

The two products share UI, state, search, and transfer code from `shared/`, but
their entry points, platform code, build output, and documentation are separate.
The standalone extension never loads or redirects to the Vercel app.

---

## Web app quick start

```bash
npm install
npm run dev:web
```

Open http://localhost:3000.

This starts the optional Vercel web implementation. The browser extension
does not require this command, localhost, or a deployment.

`apps/web/.env.local` is already pointed at the Supabase project **Tabs**
(`cwcyfktdrrpugtiptcex`). To use a different project, copy
`apps/web/.env.example` and apply the migrations in `supabase/migrations/` in
order.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key |
| `NEXT_PUBLIC_SITE_URL` | Origin used to build OAuth redirect URLs |

If Supabase is not configured, the app still runs — it falls back to a
device-local workspace backed by `localStorage`, with cloud sync disabled.

---

## Keyboard

| Keys | Action |
| --- | --- |
| `Shift` `Shift` | Quick search (JetBrains-style Search Everywhere) |
| `Ctrl/Cmd` + `K` | Same palette |
| `>` in the palette | Switch from searching to running commands |
| `↑` `↓` `Enter` `Esc` | Navigate, open, dismiss |
| `Ctrl/Cmd` + `Enter` | Open the result in a new tab |
| `Alt` + `Enter` | Edit the result |
| `Ctrl/Cmd` + `N` | New collection |
| `Ctrl/Cmd` + `Shift` + `N` | Add website |
| `Ctrl/Cmd` + `E` | Export workspace |

---

## Architecture

```
Chrome new tab ──▶ packaged extension UI ──▶ chrome.storage.local
                              │
                              └── background attempt ──▶ Supabase (optional, RLS)
```

The extension owns its local snapshot, pending-write queue, and optional
Supabase session. Rendering and mutations never wait for the network. The
Next.js application is a separate client under `apps/web/`; it is not part of
the extension runtime.

### Shared application state

`shared/lib/store/workspace-store.ts` is a normalized Zustand store
(`collections`, `tabs` records plus derived `collectionOrder` / `tabOrder`
arrays). Mutations are optimistic and synchronous; nothing waits on the network.

`shared/lib/store/sync.ts` is a coalescing write queue. Mutations mark entity ids
dirty rather than queueing operations, and the payload is built from live state
at flush time — so dragging one tab across ten slots produces a single row
write, and the newest value always wins. Failures retry with backoff and put the
marks back.

TanStack Query was deliberately left out: with a fully-loaded normalized store,
realtime invalidation and mutation-heavy drag-and-drop, a cache-per-query layer
would fight the model rather than help it.

### Ordering

Positions are `double precision` fractional indexes (`shared/lib/position.ts`).
Inserting between 1000 and 2000 assigns 1500, so a move rewrites one row instead
of renumbering siblings. Lists are renumbered only when a gap gets too small to
split.

### Search

`shared/lib/search/index.ts` combines two matchers:

- **Fuse.js** for weighted fuzzy matching across title, domain, URL, collection,
  tags and description.
- **A subsequence scorer** for initialisms Fuse's bitap cannot reach — `yt`
  finds *YouTube*, because one edit in a two-character pattern already exceeds
  any usable threshold.

Multi-word queries are matched token by token and intersected, so every word has
to hit *something* (possibly different fields): `eld map` finds *Elden Ring Map*,
`git music` finds a music bot hosted on github.com.

Results are bucketed into ranking tiers (exact title → prefix → fuzzy title →
domain → URL → collection → tag → description → unexplained fuzzy) before being
scored, so a collection-name match can never outrank a real title match.

The index (`shared/lib/search/registry.ts`) is kept in step with the store by a
reference walk, updating only the documents whose objects changed instead of
re-tokenizing the workspace.

### Drag and drop

`shared/components/workspace/workspace-screen.tsx` owns one `DndContext` covering
both the collections column and the Open Tabs sidebar, which is what lets a live
browser tab be dropped into a collection.

Rather than relying on sortable sibling transforms — which do not exist when the
drag originates outside a sortable list — the destination is shown by an
explicit insertion line. The same code path therefore handles reordering,
cross-collection moves, and multi-select drops from the sidebar.

### Security

- Every user-owned table has RLS enabled with `(select auth.uid()) = user_id`
  policies for select/insert/update/delete.
- Stored URLs are parsed and restricted to `http`/`https`; `javascript:` and
  friends are rejected at import and never rendered as an `href`.
- Titles are rendered as text, never as HTML.
- The metadata lookup route (`/api/metadata`) is an SSRF surface, so it blocks
  private and loopback hosts, refuses to follow redirects, and caps the response.
- `handle_new_user()` and `delete_own_account()` are `SECURITY DEFINER`, so
  `EXECUTE` is revoked from `anon`/`public`.

---

## Browser extension

```bash
npm run build:extension       # rebuild the packaged React/Tailwind UI
npm run icons:extension       # only needed if you change the icon
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `apps/extension/dist/` folder

The extension is fully packaged and local-first. Opening a new tab renders
`apps/extension/dist/workspace.html` directly; it does not navigate to
localhost, Vercel, or any other web server.

### Give the extension to a coworker

For a quick internal handoff, package only the ready-to-run extension folder:

```powershell
Compress-Archive -Path .\apps\extension\dist\* -DestinationPath .\Tabs-extension-2.1.0.zip -Force
```

Send the ZIP, then have your coworker:

1. Extract it to a permanent folder.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the extracted folder containing
   `manifest.json`.

They do not need Node.js, `npm install`, localhost, Vercel, or the web app. The
extracted folder must remain in place for Chrome to keep loading the
extension. To install an update, replace its files in that same folder and
click **Reload** on the extension card in `chrome://extensions`.

For a normal install link and automatic updates, publish the packaged extension
through the Chrome Web Store. Use **Private** visibility for named testers or
**Unlisted** visibility for anyone who has the direct link.

Installing the extension does not copy another user's workspace. Each Chrome
profile starts with its own local data. For a one-time transfer, export the
workspace from the current installation and import that backup on the other
computer. Optional Supabase sync requires the project URL, publishable key, and
an existing account; never provide a `service_role` or secret key. Separate
accounts cannot currently collaborate on one live shared workspace.

Workspace data and pending changes are stored as structured JSON in
`chrome.storage.local`, so the interface is available immediately and works
offline. The toolbar popup reads and writes the same local snapshot.

### Optional Supabase sync

Open Settings in the new-tab workspace and provide the Supabase project URL,
publishable key, and account credentials. Local changes are queued first, then
pushed through the authenticated Data API. After pending changes are flushed,
the extension pulls the authoritative workspace snapshot in the background.

The publishable key is safe to use in a client extension; never enter a
`service_role` or secret key. Row Level Security remains responsible for
restricting each account to its own rows.

### New tab page

The extension takes over the new tab page through `chrome_url_overrides`.
`workspace.html`, `workspace-app.css`, and `workspace-app.js` are packaged
assets built from the same React, Tailwind, Radix, and dnd-kit components as the
web interface, so no application server or deployment is required.

To keep Chrome's own new tab page, delete the `chrome_url_overrides` block from
the manifest and reload the extension.

---

## Project layout

```
apps/
  extension/
    src/              Chrome entry point, backend, settings, and shims
    dist/             complete standalone extension package
    scripts/          bundle and icon generation
  web/
    src/app/          Next.js routes, actions, and API endpoints
    src/proxy.ts      Supabase session refresh and route protection
    public/           web-only assets
shared/
  components/         UI used by both products
  hooks/              shared React hooks
  lib/                state, search, transfer, Supabase, and domain logic
  styles/             shared Tailwind theme
supabase/migrations/  shared schema, RLS, and triggers
```

> Next.js 16 renamed `middleware.ts` to `proxy.ts`, and `cookies()`, `params`
> and `searchParams` are async. See `AGENTS.md`.

---

## Scripts

```bash
npm run dev:web          # Next.js web development server
npm run build:web        # production web/Vercel build
npm run build:extension  # standalone extension bundle
npm run typecheck        # TypeScript
npm run lint             # ESLint
```

---

## Not built yet

Sharing, nested collections, pinned/favourite tabs, broken-link detection,
screenshots and AI organization are all deliberately out of scope for this
version. The schema and store are shaped so none of them require a rewrite —
collections and tabs already carry stable ids, fractional ordering and a
normalized-URL column.
