import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const LIBREDWG = fileURLToPath(new URL('./node_modules/@mlightcad/libredwg-web/wasm/', import.meta.url));

/**
 * The LibreDWG wasm (DWG reader), gzipped and base64-encoded into the bundle so
 * the app stays one offline .html file.
 */
function libredwgWasm(): Plugin {
  const id = 'virtual:libredwg-wasm';
  return {
    name: 'libredwg-wasm',
    resolveId: (s) => (s === id ? '\0' + id : null),
    load(s) {
      if (s !== '\0' + id) return null;
      const b64 = gzipSync(readFileSync(LIBREDWG + 'libredwg-web.wasm'), { level: 9 }).toString('base64');
      return `export default ${JSON.stringify(b64)};`;
    },
  };
}

export default defineConfig({
  plugins: [react(), libredwgWasm()],
  base: './',
  resolve: { alias: { 'libredwg-glue': LIBREDWG + 'libredwg-web.js' } },
  build: { rollupOptions: { output: { inlineDynamicImports: true } } },
});
