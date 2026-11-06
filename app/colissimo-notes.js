// Fonctions pures de formatage/parsing utilisées par api.save-pickup-point.jsx.
// Séparées du fichier de route (extension .jsx) pour rester chargeables tel
// quel par Node (node --test), sans transform JSX.

export function formatPointRetraitNote(point) {
  return `[${point.type}-${point.id}]FR - POINT RETRAIT : ${point.name} ${point.address1} ${point.zipCode} ${point.city} ${point.phone || ""}`.trim();
}

export function formatDomicileNote(address) {
  // Structure : [DOM]FR - DOMICILE sans signature : NOM ADRESSE CP VILLE FR TELEPHONE
  // (majuscules). Seul ce libellé existe : le script interne qui provisionne
  // les tarifs de livraison sur les ~300 boutiques ne crée jamais de variante
  // "avec signature".
  const label = address.label || "DOMICILE sans signature";
  const parts = [
    address.name,
    address.address1,
    address.address2,
    address.zipCode,
    address.city,
    "FR",
    address.phone,
  ].filter(Boolean);
  return `[DOM]FR - ${label} : ${parts.join(" ").toUpperCase()}`;
}

// orderConfirmation.order.id peut arriver sous forme gid://shopify/OrderIdentity/<id>
// (cote extension) : on reconstruit toujours un gid Order propre a partir du
// numero final, quel que soit le type d'origine.
export function buildOrderGid(orderId) {
  const numericOrderId = orderId.split("/").pop();
  return `gid://shopify/Order/${numericOrderId}`;
}

// Deduit le mode de livraison a partir du titre du tarif d'expedition
// (ex. "Colissimo Point Relais", "Colissimo Domicile - Sans signature").
// Meme logique que cote extension (Checkout.jsx) : on se fie au titre, seul
// signal expose par l'API Checkout, et on le fige au nom pres sur les ~300
// boutiques (voir plan de rollout).
export function classifyDeliveryTitle(title) {
  const upper = (title || "").toUpperCase();
  const isPickupPoint = upper.includes("POINT RELAIS");
  const isHome = !isPickupPoint && upper.includes("DOMICILE");
  return { isPickupPoint, isHome, homeLabel: "DOMICILE sans signature" };
}

const COLISSIMO_NOTE_PATTERN = /^\[[^\]]+\]FR - /;

// N'écrase jamais une note déjà présente sur la commande à moins qu'elle ne
// provienne déjà d'un essai Colissimo précédent (le client a changé d'avis
// avant de valider). Une note manuelle (opérateur, etc.) est préservée et
// complétée plutôt que remplacée.
export function mergeNote(existingNote, newNote) {
  const trimmedExisting = (existingNote || "").trim();
  if (!trimmedExisting || COLISSIMO_NOTE_PATTERN.test(trimmedExisting)) {
    return newNote;
  }
  return `${trimmedExisting}\n${newNote}`;
}
