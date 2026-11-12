// Preview only: wrangler.jsonc sets ROBOTS_NOINDEX while the site runs on its workers.dev address,
// and every response gets an X-Robots-Tag so search engines leave the preview alone. Remove the
// variable when dsafw.com points here. EmDash 1.4.0 has no staging mode of its own.
import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  if ((env as { ROBOTS_NOINDEX?: string }).ROBOTS_NOINDEX !== "true") return response;
  try {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  } catch {
    // Some responses (redirects) have immutable headers
    const copy = new Response(response.body, response);
    copy.headers.set("X-Robots-Tag", "noindex, nofollow");
    return copy;
  }
});
