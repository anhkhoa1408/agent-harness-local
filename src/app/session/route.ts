import { bootstrapSession } from "../../server/local-session";
import { store } from "../../server/runtime";
export const runtime = "nodejs";
export function GET(request: Request) {
  return bootstrapSession(request, store);
}
