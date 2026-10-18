import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// "npm run build"      → version normale (GitHub Pages, Teams), chemins relatifs.
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
    chunkSizeWarningLimit: 1200,
  },
}));
