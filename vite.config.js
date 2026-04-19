import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    proxy: {
      "/camA-mjpeg": {
        target: "http://10.0.30.101",
        changeOrigin: true,
        secure: false,
        auth: "admin:Geden123",
        rewrite: () => "/cgi-bin/mjpg/video.cgi?channel=1&subtype=1",
        },
      },
  },
});
