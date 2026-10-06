import { resolveModel } from "../../core/model-policy";
import { aiStages } from "../../core/contracts";

import { SettingsSchema } from "../../core/settings";
import { json } from "../http-response";
import type { HttpRouteContext, HttpResourceRoute } from "../route-context";
export function createSettingsRoute(
  context: HttpRouteContext,
): HttpResourceRoute {
  const { store, models } = context;
  return async (request, url, parts, body) => {
    const method = request.method;
    if (parts[0] === "settings") {
      if (method === "GET")
        return json(
          SettingsSchema.parse(store.getRecord("settings", "current") ?? {}),
        );
      if (method === "PUT") {
        const settings = SettingsSchema.parse(await body()),
          catalog = await models();
        for (const stage of aiStages)
          resolveModel(stage, settings.models, {}, catalog);
        store.putRecord("settings", "current", settings);
        return json(settings);
      }
    }
  };
}
