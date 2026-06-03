// <define:__ROUTES__>
var define_ROUTES_default = { version: 1, description: "Built with @cloudflare/next-on-pages@1.13.16.", include: ["/*"], exclude: ["/_next/static/*", "/favicon.ico", "/favicon.svg", "/logo.svg", "/solo.svg", "/energysoftmedia.svg", "/file.svg", "/globe.svg", "/window.svg", "/images/*"] };

// node_modules/wrangler/templates/pages-dev-pipeline.ts
import worker from "/Users/thommyenergy/.gemini/antigravity/scratch/EN-CONJUNTO/.wrangler/tmp/pages-Osy1Jn/bundledWorker-0.3762579400036341.mjs";
import { isRoutingRuleMatch } from "/Users/thommyenergy/.gemini/antigravity/scratch/EN-CONJUNTO/node_modules/wrangler/templates/pages-dev-util.ts";
export * from "/Users/thommyenergy/.gemini/antigravity/scratch/EN-CONJUNTO/.wrangler/tmp/pages-Osy1Jn/bundledWorker-0.3762579400036341.mjs";
var routes = define_ROUTES_default;
var pages_dev_pipeline_default = {
  fetch(request, env, context) {
    const { pathname } = new URL(request.url);
    for (const exclude of routes.exclude) {
      if (isRoutingRuleMatch(pathname, exclude)) {
        return env.ASSETS.fetch(request);
      }
    }
    for (const include of routes.include) {
      if (isRoutingRuleMatch(pathname, include)) {
        const workerAsHandler = worker;
        if (workerAsHandler.fetch === void 0) {
          throw new TypeError("Entry point missing `fetch` handler");
        }
        return workerAsHandler.fetch(request, env, context);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
export {
  pages_dev_pipeline_default as default
};
//# sourceMappingURL=hjrsj2nun75.js.map
