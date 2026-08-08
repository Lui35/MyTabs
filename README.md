# Tabs

A visual, searchable, keyboard-driven workspace for the websites and browser
tabs worth keeping. Collections you can drag around, live browser tabs you can
drop straight in, Double-Shift quick search, and Supabase cloud sync.

```
capture → organize → sync → search → reopen
```

---

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000.

`.env.local` is already pointed at the Supabase project **Tabs**
(`cwcyfktdrrpugtiptcex`). To use a different project, copy `.env.example` and
apply the migrations in `supabase/migrations/` in order.

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
Browser extension (MV3)
  service worker  ──chrome.tabs──▶ open tab list
        │
  content bridge  ──postMessage──▶ web app  ──▶ Supabase (RLS)
```

**The extension holds no Supabase session.** It reports open tabs and asks the
already-signed-in web app to perform writes, so there is exactly one
authenticated write path and the extension needs only `tabs` + `storage`
permissions.

### Client state

`src/lib/store/workspace-store.ts` is a normalized Zustand store
(`collections`, `tabs` records plus derived `collectionOrder` / `tabOrder`
arrays). Mutations are optimistic and synchronous; nothing waits on the network.

`src/lib/store/sync.ts` is a coalescing write queue. Mutations mark entity ids
dirty rather than queueing operations, and the payload is built from live state
at flush time — so dragging one tab across ten slots produces a single row
write, and the newest value always wins. Failures retry with backoff and put the
marks back.

TanStack Query was deliberately left out: with a fully-loaded normalized store,
realtime invalidation and mutation-heavy drag-and-drop, a cache-per-query layer
would fight the model rather than help it.

### Ordering

Positions are `double precision` fractional indexes (`src/lib/position.ts`).
Inserting between 1000 and 2000 assigns 1500, so a move rewrites one row instead
of renumbering siblings. Lists are renumbered only when a gap gets too small to
split.

### Search

`src/lib/search/index.ts` combines two matchers:

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

The index (`src/lib/search/registry.ts`) is kept in step with the store by a
reference walk, updating only the documents whose objects changed instead of
re-tokenizing the workspace.

### Drag and drop

`src/components/workspace/workspace-screen.tsx` owns one `DndContext` covering
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
node extension/make-icons.mjs   # only needed if you change the icon
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `extension/` folder

The Open Tabs sidebar picks it up within about a second. Until then the sidebar
shows an install prompt rather than pretending to be empty.

To point the extension at a deployed origin, add it to **both**
`extension/manifest.json` (`content_scripts.matches`) and `APP_ORIGINS` in
`extension/shared.js`.

---

## Project layout

```
src/
  app/
    (app)/            workspace + settings, behind auth
    (auth)/           login, signup, server actions
    api/metadata/     title + favicon lookup for "Add website"
    auth/callback/    OAuth / email confirmation exchange
  components/
    layout/           header, chrome, sync indicator
    search/           command palette
    sidebar/          open tabs panel
    transfer/         import dialog
    workspace/        collection cards, tab rows, dialogs, DnD screen
    ui/               primitives (button, dialog, menu, controls…)
  lib/
    store/            workspace store, sync engine, backends, UI state
    search/           index + registry
    transfer/         v2.0 format, import planning, download
    supabase/         browser + server clients, generated types
  proxy.ts            Next 16 replacement for middleware — session refresh
extension/            Chrome MV3 extension
supabase/migrations/  schema, RLS, triggers
```

> Next.js 16 renamed `middleware.ts` to `proxy.ts`, and `cookies()`, `params`
> and `searchParams` are async. See `AGENTS.md`.

---

## Scripts

```bash
npm run dev     # dev server (Turbopack)
npm run build   # production build
npm run lint    # ESLint
npx tsc --noEmit
```

---

## Not built yet

Sharing, nested collections, pinned/favourite tabs, broken-link detection,
screenshots and AI organization are all deliberately out of scope for this
version. The schema and store are shaped so none of them require a rewrite —
collections and tabs already carry stable ids, fractional ordering and a
normalized-URL column.
