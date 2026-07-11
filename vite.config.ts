import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: 'engine/main.ts', output: { entryFileNames: 'main.js' } },
  },
});
