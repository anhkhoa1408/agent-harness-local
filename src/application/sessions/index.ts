import type { ApplicationStore, SessionRecord } from "../ports";
import type { RuntimePort } from "../runtime";
export interface SessionCryptoPort {
  token(): string;
  hash(value: string): string;
  equal(a: string, b: string): boolean;
}
export const SESSION_TTL_SECONDS = 86400;
export class SessionService {
  constructor(
    private readonly data: Pick<ApplicationStore, "sessions">,
    private readonly crypto: SessionCryptoPort,
    private readonly runtime: RuntimePort,
  ) {}
  read(token: string): SessionRecord | null {
    const session = this.data.sessions.get(this.crypto.hash(token));
    return session && session.expiresAt > this.runtime.now() ? session : null;
  }
  create() {
    const token = this.crypto.token(),
      csrf = this.crypto.token();
    this.data.sessions.put(this.crypto.hash(token), {
      csrf,
      expiresAt: this.runtime.now() + SESSION_TTL_SECONDS * 1000,
    });
    return token;
  }
  checkCsrf(csrf: string, expected: string) {
    return csrf.length === expected.length && this.crypto.equal(csrf, expected);
  }
}
