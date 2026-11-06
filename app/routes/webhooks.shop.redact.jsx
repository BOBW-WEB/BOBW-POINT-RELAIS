// Webhook GDPR obligatoire : envoyé ~48h après la désinstallation, demande
// la suppression de toutes les données liées à la boutique. La session a
// déjà normalement été supprimée par le webhook app/uninstalled ; on s'assure
// ici qu'il n'en reste aucune trace (idempotent si déjà fait).
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  await db.session.deleteMany({ where: { shop } });
  return new Response();
};
