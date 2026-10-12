import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build` makes the multi-file site for Vercel (and later itch.io).
// `vite build --mode single` inlines everything into one HTML file for the claude.ai artifact.
export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2022',
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
    copyPublicDir: mode !== 'single',
  },
  plugins: mode === 'single' ? [viteSingleFile()] : [],
}));
