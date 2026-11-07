# Tabs standalone extension

This is the primary Tabs product: a Chrome Manifest V3 extension that replaces
the new-tab page with a local-first workspace. It runs entirely from packaged
files in `dist/`; it does not require the Vercel app, localhost, or a server.

## Install the ready-to-run build

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `apps/extension/dist` (the folder containing `manifest.json`).

Keep that directory in place. After pulling or receiving an update, click
**Reload** on the extension card in `chrome://extensions`.

## Build

From the repository root:

```bash
npm install
npm run build:extension
```

The build bundles `src/` together with the code in `../../shared/` and writes
`workspace-app.js` and `workspace-app.css` into `dist/`. Rebuild icons only when
the icon design changes:

```bash
npm run icons:extension
```

## Give it to a coworker

Create a ZIP from the repository root:

```powershell
Compress-Archive -Path .\apps\extension\dist\* -DestinationPath .\Tabs-extension-2.1.0.zip -Force
```

The coworker extracts it to a permanent folder and loads that folder through
`chrome://extensions` using the steps above. They do not need Node.js or the
rest of this repository.

For a normal install link and automatic updates, publish the contents of
`dist/` through the Chrome Web Store. Use **Private** visibility for named
testers or **Unlisted** visibility for people who have the direct link.

## Publish a GitHub Release

The workflow in `.github/workflows/release-extension.yml` creates a release for
every pushed tag beginning with `v`. The tag must exactly match the version in
`dist/manifest.json` after removing the leading `v`.

For example, when the manifest version is `2.1.0`:

```bash
git tag v2.1.0
git push origin v2.1.0
```

GitHub Actions installs dependencies, rebuilds the extension, creates
`tabs-extension-v2.1.0.zip`, and attaches it to a GitHub Release with generated
release notes. The ZIP contains `manifest.json` at its root, so users can
extract it and immediately choose that folder with **Load unpacked**.

Increment `dist/manifest.json` before creating the next release tag. A tag and
manifest version mismatch intentionally fails the workflow instead of
publishing a mislabeled extension.

## Data and sync

Workspace data is stored in `chrome.storage.local`, so every Chrome profile
starts with its own workspace and continues to work offline. Sending the
extension does not send your data.

- Use workspace export/import for a one-time data transfer.
- Optional Supabase sync requires a project URL, publishable key, and existing
  account.
- Never put a `service_role` or secret key into the extension.
- Separate accounts cannot currently collaborate on one live shared workspace.

## Directory map

```text
apps/extension/
  src/       extension entry point, Chrome backend, settings, and shims
  dist/      complete unpacked extension; this is the distributable product
  scripts/   bundle and icon build scripts
```

Shared React components, stores, search, transfer, and domain logic live in
`../../shared/`. Vercel-specific routes and server code do not enter the
extension bundle.
