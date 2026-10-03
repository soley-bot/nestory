import { createServer } from "vite";
import path from "node:path";
const root = path.resolve("docs/previews/settings-navigation");
const server = await createServer({
  root, configFile: false,
  esbuild: { jsx: "automatic" },
  resolve: { alias: [
    { find: "@/features/organization/actions", replacement: path.join(root, "action-stubs.js") },
    { find: "next/link", replacement: path.join(root, "next-stubs.jsx") },
    { find: "next/navigation", replacement: path.join(root, "next-stubs.jsx") },
    { find: "@", replacement: path.resolve("src") },
  ] },
  server: { host: "127.0.0.1", port: 4329, strictPort: true, fs: { allow: [process.cwd()] } },
});
await server.listen(); console.log("Synthetic settings preview: http://127.0.0.1:4329/settings/organization");
