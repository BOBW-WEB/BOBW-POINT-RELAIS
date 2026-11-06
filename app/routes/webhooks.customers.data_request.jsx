// Webhook GDPR obligatoire : un client demande ses données à la boutique.
// On ne stocke aucune donnée personnelle (les notes de commande vivent
// uniquement sur la commande Shopify elle-même, pas dans notre base) : rien
// à transmettre, on accuse simplement réception.
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  return new Response();
};
