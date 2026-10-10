import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { SessionCryptoPort } from "../../application/sessions";
export const sessionCrypto: SessionCryptoPort = {
  token: () => randomBytes(32).toString("hex"),
  hash: (value) => createHash("sha256").update(value).digest("hex"),
  equal: (a, b) => timingSafeEqual(Buffer.from(a), Buffer.from(b)),
};
