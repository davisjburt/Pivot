import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: mode === "production" ? "./" : "/",
    plugins: [
      cloudflare(),
      react(),
      tailwindcss(),
      // WKWebView (Capacitor iOS) can fail to run module scripts when `crossorigin` is set on local assets.
      ...(mode === "production"
        ? [
            {
              name: "strip-crossorigin-for-native",
              transformIndexHtml(html: string) {
                return html.replace(/\s+crossorigin(?:="[^"]*")?/g, "");
              },
            },
          ]
        : []),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      // Only crawl the web app entry. Capacitor's copied bundle under ios/ is build output,
      // not source, and may reference dependencies that were already bundled.
      entries: ['index.html'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
