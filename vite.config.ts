import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * Stamps public/sw.js's cache name with a hash of this build's asset names,
 * so every deploy retires the previous service-worker cache.
 */
function swBuildId(): Plugin {
  let outDir = "dist";
  return {
    name: "sq-sw-build-id",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const sw = path.join(outDir, "sw.js");
      if (!fs.existsSync(sw)) return;
      const assetsDir = path.join(outDir, "assets");
      const names = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir).sort().join("|") : String(Date.now());
      const id = createHash("sha256").update(names).digest("hex").slice(0, 12);
      fs.writeFileSync(sw, fs.readFileSync(sw, "utf8").replace("__SW_BUILD_ID__", id));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), swBuildId()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
});
