import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Which station GLBs actually exist, resolved at build time.
 *
 * The game ships with procedural machines and treats Blender models as an
 * optional upgrade. Probing for them at runtime would mean six 404s and six red
 * lines in the console on every boot of the normal case, so the list is baked
 * in instead: drop files into public/assets/models/stations/ and restart.
 */
function stationModels() {
  const dir = path.resolve('public/assets/models/stations');
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4));
  } catch {
    return [];
  }
}

export default defineConfig({
  base: './',
  define: { __PP_STATION_MODELS__: JSON.stringify(stationModels()) },
  server: { host: true, port: 5173 },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        // Split three.js into its own chunk so the game code can be re-deployed
        // without busting the (much larger) engine cache.
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
        },
      },
    },
  },
});
