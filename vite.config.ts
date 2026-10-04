import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

/** Public pages light enough to keep for offline use. The map is left out: it
    pulls in mapbox-gl, and its tiles never work offline anyway. */
const OFFLINE_PAGES = /src[\\/]pages[\\/](Mission|How|Data|GetApp)\.tsx$/;

/**
 * Stamps public/sw.js's cache name with a hash of this build's asset names,
 * so every deploy retires the previous service-worker cache, and hands it the
 * files to save on install: the entry script and CSS the shell page needs,
 * plus the light public pages. Without them a first visit is never saved
 * (it loads before the worker exists), and an offline reload renders nothing.
 */
function swBuildId(): Plugin {
  let outDir = "dist";
  const precache = new Set<string>();
  return {
    name: "sq-sw-build-id",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    generateBundle(_options, bundle) {
      precache.clear();
      const seen = new Set<string>();
      const add = (file: string) => {
        const c = bundle[file];
        if (!c || seen.has(file)) return;
        seen.add(file);
        if (c.type === "chunk" && c.moduleIds.some((id) => id.includes("mapbox-gl"))) return;
        precache.add("/" + file);
        if (c.type === "chunk") {
          c.viteMetadata?.importedCss.forEach((css) => precache.add("/" + css));
          c.imports.forEach(add);
        }
      };
      for (const c of Object.values(bundle)) {
        if (c.type === "chunk" && (c.isEntry || (c.facadeModuleId && OFFLINE_PAGES.test(c.facadeModuleId)))) add(c.fileName);
      }
    },
    closeBundle() {
      const sw = path.join(outDir, "sw.js");
      if (!fs.existsSync(sw)) return;
      const assetsDir = path.join(outDir, "assets");
      const names = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir).sort().join("|") : String(Date.now());
      const id = createHash("sha256").update(names).digest("hex").slice(0, 12);
      const list = JSON.stringify([...precache].sort());
      fs.writeFileSync(sw, fs.readFileSync(sw, "utf8").replace("__SW_BUILD_ID__", id).replace("/*__SW_PRECACHE__*/ []", list));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), swBuildId()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
});
