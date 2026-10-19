import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// "npm run build"      → version normale (GitHub Pages, Teams), chemins relatifs ; deux pages :
//                        Be Happi (index.html) et Pulse (pulse/index.html), sur le même moteur.
// "npm run build:demo" → un seul fichier HTML autonome (démo à partager, données fictives).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'demo' ? [react(), viteSingleFile()] : [react()],
  define: {
    __DEMO_FORCEE__: JSON.stringify(mode === 'demo'),
    __VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0'),
  },
  build: {
    outDir: mode === 'demo' ? 'dist-demo' : 'dist',
    rollupOptions:
      mode === 'demo'
        ? undefined
        : {
            input: {
              main: fileURLToPath(new URL('./index.html', import.meta.url)),
              pulse: fileURLToPath(new URL('./pulse/index.html', import.meta.url)),
            },
          },
    chunkSizeWarningLimit: 1200,
  },
}));
