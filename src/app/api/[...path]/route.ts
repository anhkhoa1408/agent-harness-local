import { createHttpHandler } from "../../../server/http";
import { store, dataDir, modelCatalog } from "../../../server/runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handler = createHttpHandler(store, dataDir, modelCatalog);
export { handler as GET, handler as POST, handler as PUT };
