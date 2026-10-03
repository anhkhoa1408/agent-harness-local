import { bootstrapSession } from "../../server/local-session";
import { getStore } from "../../server/runtime";
export const runtime = "nodejs";
export function GET(request: Request) {
  return bootstrapSession(request, getStore());
}
