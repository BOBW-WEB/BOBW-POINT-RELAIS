// authenticate.public.checkout lance une Response 401 nue (sans header CORS)
// quand le token de session est invalide/expire (voir
// node_modules/@shopify/shopify-app-react-router/src/server/authenticate/helpers/respond-to-invalid-session-token.ts) :
// la librairie suppose un flux ou le client relance la requete avec un token
// frais, mais un navigateur ne peut pas lire une reponse cross-origin sans
// Access-Control-Allow-Origin. Sans ce rattrapage, l'extension voit juste une
// erreur reseau generique (net::ERR_FAILED / "Erreur CORS" dans DevTools) au
// lieu d'un code d'erreur exploitable.
import { authenticate } from "./shopify.server";

export async function authenticateCheckout(request) {
  try {
    return await authenticate.public.checkout(request);
  } catch (error) {
    if (error instanceof Response) {
      throw new Response(JSON.stringify({ error: "invalid_session_token" }), {
        status: error.status,
        statusText: error.statusText,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
    throw error;
  }
}
