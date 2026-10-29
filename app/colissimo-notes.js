// Fonctions pures de formatage/parsing utilisées par api.save-pickup-point.jsx.
// Séparées du fichier de route (extension .jsx) pour rester chargeables tel
// quel par Node (node --test), sans transform JSX.

export function formatPointRetraitNote(point) {
  return `[${point.type}-${point.id}]FR - POINT RETRAIT : ${point.name} ${point.address1} ${point.zipCode} ${point.city} ${point.phone || ""}`.trim();
}

export function formatDomicileNote(address) {
  // A CONFIRMER PAR TESTS : structure observée sur une boutique de TEST de l'app
  // actuelle : [DOM]FR - DOMICILE sans signature : NOM ADRESSE CP VILLE FR TELEPHONE
  // (majuscules). Le libellé "avec signature" est une hypothèse, jamais vu en vrai.
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
