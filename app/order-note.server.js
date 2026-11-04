// Lecture/ecriture de la note de commande via l'Admin GraphQL API. Partage
// entre api.save-pickup-point.jsx (ecriture declenchee par le client sur la
// page de remerciement) et webhooks.orders.create.jsx (ecriture automatique
// de secours a la creation de la commande).

import prisma from "./db.server";

const ADMIN_API_VERSION = "2026-07";

export async function getOfflineAccessToken(shop) {
  const session = await prisma.session.findFirst({
    where: { shop, isOnline: false },
    orderBy: { id: "desc" },
  });
  return session?.accessToken;
}

export async function getOrderNote({ shop, accessToken, orderGid }) {
  const res = await fetch(
    `https://${shop}/admin/api/${ADMIN_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: `query($id: ID!) { order(id: $id) { note } }`,
        variables: { id: orderGid },
      }),
    },
  );
  const json = await res.json();
  return json.data?.order?.note || "";
}

export async function updateOrderNote({ shop, accessToken, orderGid, note }) {
  const query = `
    mutation orderUpdate($input: OrderInput!) {
      orderUpdate(input: $input) {
        order { id note }
        userErrors { field message }
      }
    }
  `;

  const res = await fetch(
    `https://${shop}/admin/api/${ADMIN_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query,
        variables: { input: { id: orderGid, note } },
      }),
    },
  );

  return res.json();
}
