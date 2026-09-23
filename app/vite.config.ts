/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['plantas/*.svg', 'icono-192.png', 'icono-512.png'],
      manifest: {
        name: 'RSCLL · Revisión de recintos',
        short_name: 'RSCLL',
        description: 'Revisión de recintos, observaciones y recepción · SubComisaría Llay Llay',
        lang: 'es-CL',
        theme_color: '#1f4e5a',
        background_color: '#f3f5f4',
        display: 'standalone',
        start_url: '/inicio',
        icons: [
          { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // Lo pesado y opcional (modo demostración, PDF, Excel) no se precarga en la instalación:
        // se guarda en caché la primera vez que se usa, para no gastar datos móviles (§13).
        globIgnores: ['**/pglite*', '**/initdb*', '**/demo-*', '**/pdfmake-*', '**/vfs_fonts-*', '**/exceljs*'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: { cacheName: 'rscll-modulos', expiration: { maxEntries: 40 } },
          },
        ],
      },
    }),
  ],
  // Las migraciones SQL (../supabase) se importan en el modo demostración.
  server: { fs: { allow: ['..'] } },
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  build: { chunkSizeWarningLimit: 2500 },
  test: { environment: 'node', include: ['src/**/*.test.ts'], testTimeout: 30_000 },
});
