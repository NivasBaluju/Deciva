import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-router') || id.includes('@remix-run')) {
              return 'vendor-router';
            }
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react';
            }
            if (id.includes('motion')) {
              return 'vendor-motion';
            }
            if (id.includes('diff')) {
              return 'vendor-diff';
            }
            return 'vendor-other';
          }
        }
      }
    }
  }
});
