import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)), "dist");
const build = spawn(process.execPath, [fileURLToPath(new URL("build.mjs", import.meta.url))], { stdio: "inherit" });
await new Promise((resolve, reject) => { build.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Docs build exited ${code}`))); });
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8" };
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const safe = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
    let target = join(root, safe);
    const info = await stat(target).catch(() => null);
    if (info?.isDirectory()) target = join(target, "index.html");
    if (!info && !extname(target)) target = join(target, "index.html");
    let statusCode = 200;
    const body = await readFile(target).catch(() => { statusCode = 404; return readFile(join(root, "404.html")); });
    response.writeHead(statusCode, { "content-type": types[extname(target)] ?? "text/html; charset=utf-8" });
    response.end(body);
  } catch { response.writeHead(500); response.end("Documentation unavailable"); }
}).listen(Number(process.env.DOCS_PORT ?? 4174), () => console.log("Oynk docs: http://localhost:4174/docs"));
