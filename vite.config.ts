import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              // electron-store 及其依赖走 CJS，保持 external 由 Node 解析
              external: ['electron-store', 'electron'],
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            // preload 在沙箱下以 CJS 运行
            rollupOptions: { output: { format: 'cjs', entryFileNames: 'preload.cjs' } },
          },
        },
      },
    }),
  ],
  build: {
    outDir: 'dist',
  },
});
