import { createServer, request } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function createOAuthProxy(targetPort = 1455) {
  return createServer((incoming, outgoing) => {
    const upstream = request(
      {
        host: "127.0.0.1",
        port: targetPort,
        path: incoming.url,
        method: incoming.method,
        headers: incoming.headers,
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      },
    );
    upstream.on("error", () => {
      if (outgoing.headersSent) {
        outgoing.destroy();
        return;
      }
      outgoing.writeHead(410, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      });
      outgoing.end(
        `<!doctype html><html lang="vi"><meta charset="utf-8"><title>Đăng nhập lại Codex</title><body><h1>Phiên đăng nhập đã kết thúc</h1><p>Quay lại dashboard và bắt đầu đăng nhập mới. Cửa sổ đăng nhập cũ không còn sử dụng được.</p><a href="http://127.0.0.1:3000/login">Quay lại đăng nhập Codex</a></body></html>`,
      );
    });
    incoming.pipe(upstream);
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = createOAuthProxy().listen(1456, "0.0.0.0");
  process.on("SIGTERM", () => server.close(() => process.exit(0)));
}
