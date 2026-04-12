import { jsonResponse } from "./utils";

export interface RouteContext {
  request: Request;
  url: URL;
  params: Record<string, string>;
}

export type RouteHandler = (ctx: RouteContext) => Response | Promise<Response>;

export interface RouteDefinition {
  method: string | string[];
  pattern: string | RegExp;
  handler: RouteHandler;
}

export const createRouter = (routes: RouteDefinition[]) => {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    for (const route of routes) {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      if (!methods.includes(request.method)) continue;

      if (typeof route.pattern === "string") {
        const normalized = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
        if (normalized === route.pattern || url.pathname === route.pattern) {
          return route.handler({ request, url, params: {} });
        }
      } else {
        const match = url.pathname.match(route.pattern);
        if (match) {
          return route.handler({ request, url, params: match.groups ?? {} });
        }
      }
    }

    return jsonResponse({ error: "Not found." }, 404);
  };
};
