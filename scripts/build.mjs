import { cp, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

await build({
  entryPoints: ["src/plugin.jsx"],
  outfile: "dist/plugin.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  jsx: "automatic",
  minify: true,
  legalComments: "none",
  loader: { ".css": "text" },
});

await cp("src/manifest.json", "dist/manifest.json");
await cp("src/rpc.mjs", "dist/rpc.mjs");
