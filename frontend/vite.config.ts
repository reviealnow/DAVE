import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isWebMode = env.VITE_MODE === "web";

  return {
    server: {
      host: isWebMode ? "0.0.0.0" : "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": "http://127.0.0.1:8765",
        "/ws": {
          target: "ws://127.0.0.1:8765",
          ws: true,
        },
        "/health": "http://127.0.0.1:8765",
      },
    },
    build: {
      outDir: "dist",
      sourcemap: false,
    },
  };
});
