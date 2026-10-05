import { test, expect } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { createOAuthProxy } from "../../scripts/oauth-proxy";

test("callback proxy forwards live OAuth and explains an expired callback without exposing its code", async () => {
  const target = createServer((req, res) => {
    res.writeHead(400, { "content-type": "text/plain" });
    res.end("invalid state");
  }).listen(0, "127.0.0.1");
  await once(target, "listening");
  const targetPort = (target.address() as { port: number }).port;
  const proxy = createOAuthProxy(targetPort).listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const url = `http://127.0.0.1:${(proxy.address() as { port: number }).port}/auth/callback?code=private-code&state=expired`;
  try {
    const live = await fetch(url);
    expect(live.status).toBe(400);
    expect(await live.text()).toBe("invalid state");
    await new Promise<void>((resolve) => target.close(() => resolve()));
    const expired = await fetch(url);
    expect(expired.status).toBe(410);
    const html = await expired.text();
    expect(html).toContain("Phiên đăng nhập đã kết thúc");
    expect(html).toContain("http://127.0.0.1:3000/login");
    expect(html).not.toContain("private-code");
    expect(expired.headers.get("cache-control")).toBe("no-store");
  } finally {
    target.close();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
});
