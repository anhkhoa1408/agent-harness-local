import { SESSION_TOKEN_BYTES, SESSION_TTL_SECONDS } from "./limits";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { Store } from "../storage/store";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function validHost(host: string): boolean {
  return /^(127\.0\.0\.1|localhost):\d{1,5}$/.test(host);
}
export function validMutationOrigin(
  origin: string | null,
  host: string,
): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && url.host === host && validHost(host);
  } catch {
    return false;
  }
}
export function readSession(
  request: Request,
  store: Store,
): { csrf: string; expiresAt: number } | null {
  const token = /(?:^|;\s*)harness_session=([a-f0-9]{64})(?:;|$)/.exec(
    request.headers.get("cookie") ?? "",
  )?.[1];
  if (!token) return null;
  const session = store.getRecord("session", hash(token)) as {
    csrf: string;
    expiresAt: number;
  } | null;
  return session && session.expiresAt > Date.now() ? session : null;
}
export function authorize(request: Request, store: Store): boolean {
  const host = request.headers.get("host") ?? "";
  if (
    !validHost(host) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return false;
  if (
    request.headers.has("origin") &&
    !validMutationOrigin(request.headers.get("origin"), host)
  )
    return false;
  const session = readSession(request, store);
  if (!session) return false;
  if (!["GET", "HEAD"].includes(request.method)) {
    if (!validMutationOrigin(request.headers.get("origin"), host)) return false;
    const csrf = request.headers.get("x-harness-csrf") ?? "";
    if (
      csrf.length !== session.csrf.length ||
      !timingSafeEqual(Buffer.from(csrf), Buffer.from(session.csrf))
    )
      return false;
  }
  return true;
}
export function bootstrapSession(request: Request, store: Store): Response {
  const host = request.headers.get("host") ?? "",
    site = request.headers.get("sec-fetch-site");
  if (
    !validHost(host) ||
    request.headers.get("sec-fetch-mode") !== "navigate" ||
    !["none", "same-origin"].includes(site ?? "") ||
    (request.headers.has("origin") &&
      !validMutationOrigin(request.headers.get("origin"), host))
  )
    return new Response("Forbidden", { status: 403 });
  const token = randomBytes(SESSION_TOKEN_BYTES).toString("hex"),
    csrf = randomBytes(SESSION_TOKEN_BYTES).toString("hex");
  store.putRecord("session", hash(token), {
    csrf,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  });
  return new Response(null, {
    status: 303,
    headers: {
      location: "/",
      "set-cookie": `harness_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`,
      "cache-control": "no-store",
      "content-security-policy": "frame-ancestors 'none'",
    },
  });
}
