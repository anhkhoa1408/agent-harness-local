import { createHttpHandler } from "../../../bootstrap/http";
import {
  getStore,
  dataDir,
  modelCatalog,
} from "../../../bootstrap/web-runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handler = (request: Request) =>
  createHttpHandler(getStore(), dataDir, modelCatalog)(request);
export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
