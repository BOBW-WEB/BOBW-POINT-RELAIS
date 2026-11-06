// Endpoint appelé par l'extension Thank You une fois le point choisi (ou en
// livraison Domicile) : écrit la note formatée dans la commande Shopify.
// Protégé par le Session Token API des extensions checkout : authenticate.public.checkout
// renvoie un shop vérifié cryptographiquement (sessionToken.dest), impossible à
// falsifier côté client, qui remplace l'ancien champ "shop" envoyé tel quel par
// l'extension (vulnérabilité : n'importe quelle boutique du parc pouvait réécrire
// la note de commande d'une autre boutique en forgeant ce champ).

import { authenticateCheckout } from "../checkout-auth.server";
import {
  formatPointRetraitNote,
  formatDomicileNote,
  buildOrderGid,
  mergeNote,
} from "../colissimo-notes";
import {
  getOfflineAccessToken,
  getOrderNote,
  updateOrderNote,
} from "../order-note.server";

export async function loader({ request }) {
  // Le preflight CORS (OPTIONS) arrive ici, pas dans action() : il faut
  // passer par authenticateCheckout pour que la reponse porte les headers
  // CORS requis (voir checkout-auth.server.js), sinon le navigateur bloque
  // la vraie requete qui suit.
  const { cors } = await authenticateCheckout(request);
  return cors(new Response(null, { status: 204 }));
}

export async function action({ request }) {
  const { sessionToken, cors } = await authenticateCheckout(request);
  // sessionToken.dest est signé par Shopify et ne peut pas être falsifié par
  // le client, contrairement à un champ "shop" envoyé dans le corps de la
  // requête : c'est la seule source de vérité pour savoir quelle boutique
  // fait réellement cet appel. En pratique dest est déjà le domaine nu
  // (ex: "boutique.myshopify.com"), mais on gère aussi le cas où ce serait
  // une URL complète ("https://boutique.myshopify.com").
  const shop = sessionToken.dest.includes("://")
    ? new URL(sessionToken.dest).hostname
    : sessionToken.dest;

  if (request.method !== "POST") {
    return cors(
      Response.json({ error: "method_not_allowed" }, { status: 405 }),
    );
  }

  const body = await request.json();
  const { orderId, point, domicileAddress } = body;

  if (!orderId || (!point && !domicileAddress)) {
    return cors(Response.json({ error: "missing_fields" }, { status: 400 }));
  }

  const accessToken = await getOfflineAccessToken(shop);
  if (!accessToken) {
    return cors(
      Response.json({ error: "shop_not_installed" }, { status: 401 }),
    );
  }

  const orderGid = buildOrderGid(orderId);

  const existingNote = await getOrderNote({ shop, accessToken, orderGid });

  // Le bloc Domicile s'exécute à chaque chargement de la page : on n'écrit
  // qu'une fois (évite aussi d'écraser une note déjà posée).
  if (!point && existingNote.includes("[DOM]")) {
    return cors(
      Response.json({
        success: true,
        skipped: "already_written",
        note: existingNote,
      }),
    );
  }

  const newNote = point
    ? formatPointRetraitNote(point)
    : formatDomicileNote(domicileAddress);
  const note = mergeNote(existingNote, newNote);

  const result = await updateOrderNote({ shop, accessToken, orderGid, note });

  if (result.data?.orderUpdate?.userErrors?.length) {
    console.error("[save-pickup-point] orderUpdate userErrors", {
      shop,
      orderGid,
      errors: result.data.orderUpdate.userErrors,
    });
    return cors(
      Response.json(
        { error: "shopify_error", details: result.data.orderUpdate.userErrors },
        { status: 422 },
      ),
    );
  }

  if (result.errors) {
    console.error("[save-pickup-point] orderUpdate graphql errors", {
      shop,
      orderGid,
      errors: result.errors,
    });
    return cors(
      Response.json(
        { error: "shopify_graphql_error", details: result.errors },
        { status: 500 },
      ),
    );
  }

  return cors(Response.json({ success: true, note }));
}
