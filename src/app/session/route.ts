import { bootstrapSession } from "../../bootstrap/http";
import { getStore } from "../../bootstrap/web-runtime";
export const runtime = "nodejs";
export function GET(request: Request) {
  return bootstrapSession(request, getStore());
}
