// authenticate.public.checkout lance une Response nue (sans header CORS) dans
// deux cas : token de session absent/invalide/expire (401 - voir
// respond-to-invalid-session-token.ts) et requete detectee comme "bot" (410 -
// voir reject-bot-request.ts). La reponse OPTIONS (preflight, 204) EST deja
// correctement munie des headers CORS par le SDK (respond-to-options-request.ts)
// et ne doit pas etre touchee. Sans ce rattrapage sur les deux premiers cas,
// un navigateur ne peut pas lire une reponse cross-origin sans
// Access-Control-Allow-Origin : l'extension voit une erreur reseau generique
// (net::ERR_FAILED / "Erreur CORS" dans DevTools) au lieu d'un code
// d'erreur exploitable.
import { authenticate } from "./shopify.server";

export async function authenticateCheckout(request) {
  try {
    return await authenticate.public.checkout(request);
  } catch (error) {
    if (!(error instanceof Response) || error.headers.has("Access-Control-Allow-Origin")) {
      throw error;
    }
    if (error.status === 401) {
      throw new Response(JSON.stringify({ error: "invalid_session_token" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
    const headers = new Headers(error.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    throw new Response(error.body, {
      status: error.status,
      statusText: error.statusText,
      headers,
    });
  }
}
