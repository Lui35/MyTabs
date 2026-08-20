import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionSource = path.join(root, "extension-src");
const extensionOutput = path.join(root, "extension");

await build({
  entryPoints: [path.join(extensionSource, "main.tsx")],
  outfile: path.join(extensionOutput, "workspace-app.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["chrome111"],
  minify: true,
  legalComments: "none",
  jsx: "automatic",
  alias: {
    "next/link": path.join(extensionSource, "shims", "next-link.tsx"),
    "next/navigation": path.join(extensionSource, "shims", "next-navigation.ts"),
    "next-themes": path.join(extensionSource, "shims", "next-themes.tsx"),
  },
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  plugins: [
    {
      name: "ignore-css",
      setup(builder) {
        builder.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: "ignored-css" }));
        builder.onLoad({ filter: /.*/, namespace: "ignored-css" }, () => ({ contents: "", loader: "css" }));
      },
    },
  ],
});

const cssEntry = path.join(extensionSource, "styles.css");
const cssSource = await readFile(cssEntry, "utf8");
const cssResult = await postcss([tailwindcss()]).process(cssSource, {
  from: cssEntry,
  to: path.join(extensionOutput, "workspace-app.css"),
});
await writeFile(path.join(extensionOutput, "workspace-app.css"), cssResult.css, "utf8");

console.log("Built extension/workspace-app.js and extension/workspace-app.css");
