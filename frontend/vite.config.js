import { defineConfig } from 'vite';

// Adapted for the Emergent platform: the supervisor runs `yarn start` (→ vite)
// on port 3000, and the Kubernetes ingress terminates HTTPS and proxies
// non-/api traffic here. allowedHosts is opened so the preview/prod domain is
// accepted, and HMR is pointed at the wss ingress on 443.
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: true,
    hmr: { clientPort: 443, protocol: 'wss' },
  },
  preview: { host: '0.0.0.0', port: 4173 },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      input: {
        main: 'index.html',
      },
    },
  },
  assetsInclude: ['**/*.ktx2', '**/*.hdr', '**/*.exr', '**/*.bin', '**/*.glb'],
});
