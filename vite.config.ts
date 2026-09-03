import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: mode === "production" ? "./" : "/",
    plugins: [
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
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
