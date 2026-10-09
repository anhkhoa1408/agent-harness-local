import { SettingsSchema } from "../../core/settings";
import { json } from "../http-response";
import type { HttpRouteContext, HttpResourceRoute } from "../route-context";
export function createSettingsRoute(
  context: HttpRouteContext,
): HttpResourceRoute {
  return async (_request, _url, parts, body) => {
    if (parts[0] === "settings") {
      if (_request.method === "GET")
        return json(context.modelService.getSettings());
      if (_request.method === "PUT")
        return json(
          await context.modelService.saveSettings(
            SettingsSchema.parse(await body()),
          ),
        );
    }
  };
}
