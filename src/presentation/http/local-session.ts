import {
  SessionService,
  SESSION_TTL_SECONDS,
} from "../../application/sessions";
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
  sessions: SessionService,
): { csrf: string; expiresAt: number } | null {
  const token = /(?:^|;\s*)harness_session=([a-f0-9]{64})(?:;|$)/.exec(
    request.headers.get("cookie") ?? "",
  )?.[1];
  if (!token) return null;
  return sessions.read(token);
}
export function authorize(request: Request, sessions: SessionService): boolean {
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
  const session = readSession(request, sessions);
  if (!session) return false;
  if (!["GET", "HEAD"].includes(request.method)) {
    if (!validMutationOrigin(request.headers.get("origin"), host)) return false;
    const csrf = request.headers.get("x-harness-csrf") ?? "";
    if (!sessions.checkCsrf(csrf, session.csrf)) return false;
  }
  return true;
}
export function bootstrapSession(
  request: Request,
  sessions: SessionService,
): Response {
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
  const token = sessions.create();
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
