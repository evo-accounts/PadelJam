// CORS for the edge functions the web app calls straight from the browser — through packages/api's
// supabase.functions.invoke (send-blast, send-roster-csv, ensure-channel, stream-token, geocode) or
// a plain fetch in apps/web (complete-account, delete-account). Those requests carry Authorization
// and a JSON Content-Type, so the browser sends an OPTIONS preflight first and refuses to deliver
// any response that lacks Access-Control-Allow-Origin. The hosted gateway forwards the preflight
// to the function and adds nothing, so before this a function that only accepted POST answered it
// 405 and the feature failed on web while working on mobile (native fetch has no preflight).
//
// Wrap the handler — `Deno.serve(withCors(async (req) => { … }))` — rather than adding headers per
// return: every path then gets them, the error paths and an uncaught throw included, and a function
// keeps answering exactly what it answered before. A function no browser calls (send-push, called
// by the database) does not need it.
//
// Pure TS with no Deno/npm imports so it is unit-testable under `node --test`.

// Allow-Headers covers what supabase-js sends on functions.invoke (Authorization, apikey,
// X-Client-Info, Content-Type) and what apps/web's fetch calls send (Authorization, Content-Type).
export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// A copy of `res` with the CORS headers set (its own headers, status and body kept). A copy, because
// a Response's headers can be immutable (one returned by fetch, for instance).
export function withCorsHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) headers.set(name, value);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// Answers the preflight itself (the handler never sees an OPTIONS) and puts the CORS headers on
// every response the handler returns. A throw becomes the same 500 Deno.serve's default error
// handler would send, logged the same way, but with the headers, so the browser can read it.
export function withCors(
  handler: (req: Request) => Response | Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    let res: Response;
    try {
      res = await handler(req);
    } catch (e) {
      console.error(e);
      res = new Response('Internal Server Error', { status: 500 });
    }
    return withCorsHeaders(res);
  };
}
