import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import DigestFetch from "digest-fetch";
import { Readable } from "node:stream";

const CAMERA_HOST = "http://10.0.30.101";
const CAMERA_USER = "admin";
const CAMERA_PASS = "Geden123";
const CAMERA_A_PATH = "/cgi-bin/mjpg/video.cgi?channel=1&subtype=1";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
  },
  configureServer(server) {
    server.middlewares.use("/camA-mjpeg", async (req, res) => {
      try {
        const client = new DigestFetch(CAMERA_USER, CAMERA_PASS);
        const upstream = await client.fetch(`${CAMERA_HOST}${CAMERA_A_PATH}`);

        if (!upstream.ok || !upstream.body) {
          res.statusCode = upstream.status || 502;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(`Camera upstream error: ${upstream.status}`);
          return;
        }

        const contentType =
          upstream.headers.get("content-type") ||
          "multipart/x-mixed-replace";

        res.statusCode = 200;
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.setHeader("Connection", "keep-alive");

        const nodeStream = Readable.fromWeb(upstream.body);
        nodeStream.on("error", (err) => {
          console.error("MJPEG stream pipe error:", err);
          if (!res.writableEnded) res.end();
        });

        req.on("close", () => {
          nodeStream.destroy();
        });

        nodeStream.pipe(res);
      } catch (error) {
        console.error("camA-mjpeg proxy error:", error);
        res.statusCode = 500;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("camA-mjpeg proxy failed");
      }
    });
  },
});