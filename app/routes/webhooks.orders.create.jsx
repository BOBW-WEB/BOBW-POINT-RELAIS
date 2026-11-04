// Filet de securite : ecrit immediatement une note Colissimo a la creation
// de la commande (point relais le plus proche, ou [DOM] en livraison
// Domicile), independamment de toute action du client sur la page de
// remerciement. Si le client choisit ensuite un autre point et clique
// "Valider", api.save-pickup-point.jsx remplace cette note via le meme
// mergeNote (voir colissimo-notes.js) : le client garde la main, ce webhook
// ne fait que garantir qu'une note existe toujours des le paiement effectue.
//
// Necessite que Shippingbo relise la commande apres une mise a jour de la
// note (confirme aupres de l'equipe logistique avant d'implementer ceci) :
// si l'import etait fige a la creation, cette note arriverait trop tard.

import { authenticate } from "../shopify.server";
import {
  formatPointRetraitNote,
  formatDomicileNote,
  buildOrderGid,
  mergeNote,
  classifyDeliveryTitle,
} from "../colissimo-notes";
import { findColissimoPoints } from "../colissimo-client.server";
import {
  getOfflineAccessToken,
  getOrderNote,
  updateOrderNote,
} from "../order-note.server";

export const action = async ({ request }) => {
  const { payload, shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    const shippingLine = payload.shipping_lines?.[0];
    const { isPickupPoint, isHome, homeLabel } = classifyDeliveryTitle(
      shippingLine?.title,
    );

    if (!isPickupPoint && !isHome) {
      // Autre mode de livraison (Standard, Express...) : rien a faire.
      return new Response();
    }

    const address = payload.shipping_address;
    if (!address) {
      console.error("[orders/create] commande sans adresse de livraison", {
        shop,
        orderId: payload.id,
      });
      return new Response();
    }

    const accessToken = await getOfflineAccessToken(shop);
    if (!accessToken) {
      console.error("[orders/create] pas de token offline pour la boutique", {
        shop,
      });
      return new Response();
    }

    const orderGid =
      payload.admin_graphql_api_id || buildOrderGid(String(payload.id));
    const phone =
      address.phone || payload.phone || payload.customer?.phone || "";

    let newNote;
    if (isHome) {
      newNote = formatDomicileNote({
        label: homeLabel,
        name: [address.first_name, address.last_name]
          .filter(Boolean)
          .join(" "),
        address1: address.address1,
        address2: address.address2,
        zipCode: address.zip,
        city: address.city,
        phone,
      });
    } else {
      const result = await findColissimoPoints({
        address: address.address1,
        zipCode: address.zip,
        city: address.city,
        countryCode: address.country_code,
        weight: 1000,
        requestId: `webhook-${payload.id}`,
      });

      if (result.error || !result.points?.length) {
        console.error("[orders/create] aucun point relais trouvé", {
          shop,
          orderGid,
          error: result.error,
          errorMessage: result.errorMessage,
        });
        return new Response();
      }

      // Deja trie par distance par Colissimo (voir api.pickup-points.jsx) :
      // le premier est le plus proche.
      const nearest = result.points[0];
      newNote = formatPointRetraitNote({ ...nearest, phone });
    }

    const existingNote = await getOrderNote({ shop, accessToken, orderGid });
    const note = mergeNote(existingNote, newNote);
    const result = await updateOrderNote({ shop, accessToken, orderGid, note });

    if (result.data?.orderUpdate?.userErrors?.length) {
      console.error("[orders/create] orderUpdate userErrors", {
        shop,
        orderGid,
        errors: result.data.orderUpdate.userErrors,
      });
    } else if (result.errors) {
      console.error("[orders/create] orderUpdate graphql errors", {
        shop,
        orderGid,
        errors: result.errors,
      });
    }
  } catch (err) {
    // Ne jamais faire echouer le webhook : Shopify reessaierait et pourrait
    // finir par le desactiver. Le client garde de toute facon la main via
    // api.save-pickup-point.jsx si ce filet de securite echoue.
    console.error("[orders/create] erreur inattendue", {
      shop,
      message: err?.message,
    });
  }

  return new Response();
};
