// Endpoint appelé par l'extension Thank You une fois le point choisi (ou en
// livraison Domicile) : écrit la note formatée dans la commande Shopify.
// Protégé par le Session Token API des extensions checkout : authenticate.public.checkout
// renvoie un shop vérifié cryptographiquement (sessionToken.dest), impossible à
// falsifier côté client, qui remplace l'ancien champ "shop" envoyé tel quel par
// l'extension (vulnérabilité : n'importe quelle boutique du parc pouvait réécrire
// la note de commande d'une autre boutique en forgeant ce champ).

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  formatPointRetraitNote,
  formatDomicileNote,
  buildOrderGid,
  mergeNote,
} from "../colissimo-notes";

async function getOrderNote({ shop, accessToken, orderGid }) {
  const res = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({
      query: `query($id: ID!) { order(id: $id) { note } }`,
      variables: { id: orderGid },
    }),
  });
  const json = await res.json();
  return json.data?.order?.note || "";
}

async function getOfflineAccessToken(shop) {
  const session = await prisma.session.findFirst({
    where: { shop, isOnline: false },
    orderBy: { id: "desc" },
  });
  return session?.accessToken;
}

async function updateOrderNote({ shop, accessToken, orderGid, note }) {
  const query = `
    mutation orderUpdate($input: OrderInput!) {
      orderUpdate(input: $input) {
        order { id note }
        userErrors { field message }
      }
    }
  `;

  const res = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({
      query,
      variables: { input: { id: orderGid, note } },
    }),
  });

  return res.json();
}

export async function loader() {
  return new Response(null, { status: 204 });
}

export async function action({ request }) {
  const { sessionToken, cors } = await authenticate.public.checkout(request);
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
