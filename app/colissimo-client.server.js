// Appel partage a l'API REST Colissimo (findRDVPointRetraitAcheminement),
// utilise a la fois par la recherche cote extension (api.pickup-points.jsx)
// et par l'ecriture automatique a la creation de commande
// (webhooks.orders.create.jsx).

const COLISSIMO_REST_URL =
  "https://ws.colissimo.fr/pointretrait-ws-cxf/rest/v2/pointretrait/findRDVPointRetraitAcheminement";

// Codes d'erreur documentes par Colissimo pour cet endpoint.
export const COLISSIMO_ERROR_MESSAGES = {
  300: "Aucun point relais trouvé à proximité de cette adresse.",
  301: "Aucun point relais trouvé à proximité de cette adresse.",
  201: "Identifiants Colissimo invalides.",
  202: "Identifiants Colissimo invalides.",
  1000: "Le service Colissimo est momentanément indisponible.",
};

export function formatShippingDate(daysFromNow = 3) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Retourne { points } en cas de succes, ou { error, errorCode, errorMessage }
// en cas d'echec reseau ou d'erreur Colissimo.
export async function findColissimoPoints({
  address,
  zipCode,
  city,
  countryCode,
  weight,
  requestId,
}) {
  const accountNumber = process.env.COLISSIMO_ACCOUNT_NUMBER;
  const password = process.env.COLISSIMO_PASSWORD;

  if (!accountNumber || !password) {
    return { error: "colissimo_credentials_missing" };
  }

  const payload = {
    accountNumber,
    password,
    address: address || "",
    zipCode,
    city,
    // FR par défaut ; pas encore validé pour BE/CH malgré le passage du
    // countryCode réel de l'adresse de livraison (voir doc technique).
    countryCode: countryCode || "FR",
    weight: String(weight || 1000),
    shippingDate: formatShippingDate(),
    filterRelay: "1",
    optionInter: "0",
    requestId: requestId || `req-${Date.now()}`,
    lang: "FR",
  };

  let colissimoResponse;
  try {
    const res = await fetch(COLISSIMO_REST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    colissimoResponse = await res.json();
  } catch (err) {
    console.error("[colissimo] findRDVPointRetraitAcheminement unreachable", {
      zipCode,
      city,
      message: err?.message,
    });
    return { error: "colissimo_unreachable" };
  }

  if (colissimoResponse.errorCode !== 0) {
    console.error("[colissimo] findRDVPointRetraitAcheminement error", {
      zipCode,
      city,
      errorCode: colissimoResponse.errorCode,
      errorMessage: colissimoResponse.errorMessage,
    });
    return {
      error: "colissimo_error",
      errorCode: colissimoResponse.errorCode,
      errorMessage:
        COLISSIMO_ERROR_MESSAGES[colissimoResponse.errorCode] ||
        colissimoResponse.errorMessage ||
        "Erreur Colissimo inconnue.",
    };
  }

  const points = (colissimoResponse.listePointRetraitAcheminement || [])
    .filter((p) => !p.congesTotal)
    .map((p) => ({
      id: p.identifiant,
      type: p.typeDePoint,
      name: p.nom,
      address1: p.adresse1,
      zipCode: p.codePostal,
      city: p.localite,
      distanceMeters: p.distanceEnMetre,
      phone: "",
      lat: p.coordGeolocalisationLatitude,
      lon: p.coordGeolocalisationLongitude,
      hours: {
        lundi: p.horairesOuvertureLundi || "",
        mardi: p.horairesOuvertureMardi || "",
        mercredi: p.horairesOuvertureMercredi || "",
        jeudi: p.horairesOuvertureJeudi || "",
        vendredi: p.horairesOuvertureVendredi || "",
        samedi: p.horairesOuvertureSamedi || "",
        dimanche: p.horairesOuvertureDimanche || "",
      },
    }));

  return { points };
}
