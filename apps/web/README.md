# Tabs web app (Vercel)

This is the secondary hosted implementation of Tabs. It is a Next.js 16 app
for Vercel and local web development. It is not required by the standalone
Chrome extension.

## Run locally

From the repository root:

```bash
npm install
npm run dev:web
```

Open <http://localhost:3000>.

The web app reads environment variables from `apps/web/.env.local`. Copy
`.env.example` when setting up another machine:

```bash
cp apps/web/.env.example apps/web/.env.local
```

On PowerShell:

```powershell
Copy-Item .\apps\web\.env.example .\apps\web\.env.local
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe publishable key |
| `NEXT_PUBLIC_SITE_URL` | Web origin used for authentication redirects |

Without Supabase configuration, the web client falls back to device-local
storage and cloud sync is unavailable.

## Build and deploy

```bash
npm run build:web
npm run start:web
```

The repository-level `vercel.json` pins Vercel to this app:

- Framework: Next.js
- Build command: `npm run build:web`
- Output directory: `apps/web/.next`

Keep the Vercel project's **Root Directory** at the repository root. The web
app imports code from `shared/`, and the root package owns the dependency lock
file and build scripts. Configure the three `NEXT_PUBLIC_*` variables in each
Vercel environment that needs them.

The current connected Vercel project is named `my-tabs`. Changing repository
paths does not deploy automatically from a local checkout; commit and push the
change before verifying a preview deployment.

## Directory map

```text
apps/web/
  src/app/       Next.js routes, layouts, server actions, and API routes
  src/proxy.ts   Supabase session refresh and route protection
  public/        web-only static assets
  next.config.ts Next.js/Turbopack configuration
```

Shared React components and application logic live in `../../shared/`. Chrome
extension code and packaged extension assets live only in `../extension/`.
