import { SessionLimits } from "../../application/sessions";
import { contentHash } from "../utils/content-hash";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { SessionCryptoPort } from "../../application/sessions";
export const sessionCrypto: SessionCryptoPort = {
  token: () => randomBytes(SessionLimits.TOKEN_BYTES).toString("hex"),
  hash: contentHash,
  equal: (a, b) => timingSafeEqual(Buffer.from(a), Buffer.from(b)),
};
