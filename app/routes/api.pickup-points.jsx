// Endpoint appelé par l'extension Thank You (network_access) pour récupérer
// les points relais Colissimo autour de l'adresse de livraison.
// Protégé par le Session Token API des extensions checkout : authenticate.public.checkout
// vérifie que la requête provient bien d'une extension checkout active sur une boutique
// où l'app est installée (voir app/shopify.server.js) avant de traiter quoi que ce soit.

import { authenticate } from "../shopify.server";

const COLISSIMO_REST_URL =
  "https://ws.colissimo.fr/pointretrait-ws-cxf/rest/v2/pointretrait/findRDVPointRetraitAcheminement";

// Codes d'erreur documentés par Colissimo pour cet endpoint.
const COLISSIMO_ERROR_MESSAGES = {
  300: "Aucun point relais trouvé à proximité de cette adresse.",
  301: "Aucun point relais trouvé à proximité de cette adresse.",
  201: "Identifiants Colissimo invalides.",
  202: "Identifiants Colissimo invalides.",
  1000: "Le service Colissimo est momentanément indisponible.",
};

function formatShippingDate(daysFromNow = 3) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function buildMapImageUrl(points, requestOrigin) {
  if (!points.length) return null;

  const markers = points
    .slice(0, 8)
    .map((p, i) => `pin-s-${i + 1}+C4541E(${p.lon},${p.lat})`)
    .join(",");

  // On passe par notre propre backend (api.map-image) : les extensions
  // Checkout ne peuvent pas charger d'image depuis un domaine tiers
  // (Mapbox) directement, seulement depuis le domaine de l'app.
  return `${requestOrigin}/api/map-image?markers=${encodeURIComponent(markers)}`;
}

export async function loader() {
  return new Response(null, { status: 204 });
}

export async function action({ request }) {
  const { cors } = await authenticate.public.checkout(request);

  if (request.method !== "POST") {
    return cors(
      Response.json({ error: "method_not_allowed" }, { status: 405 }),
    );
  }

  const body = await request.json();
  const { address, zipCode, city, weight, countryCode } = body;

  if (!zipCode || !city) {
    return cors(
      Response.json({ error: "missing_address" }, { status: 400 }),
    );
  }

  const accountNumber = process.env.COLISSIMO_ACCOUNT_NUMBER;
  const password = process.env.COLISSIMO_PASSWORD;

  if (!accountNumber || !password) {
    return cors(
      Response.json({ error: "colissimo_credentials_missing" }, { status: 500 }),
    );
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
    requestId: `checkout-${Date.now()}`,
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
    return cors(
      Response.json({ error: "colissimo_unreachable" }, { status: 502 }),
    );
  }

  if (colissimoResponse.errorCode !== 0) {
    console.error("[colissimo] findRDVPointRetraitAcheminement error", {
      zipCode,
      city,
      errorCode: colissimoResponse.errorCode,
      errorMessage: colissimoResponse.errorMessage,
    });
    return cors(
      Response.json(
        {
          error: "colissimo_error",
          errorCode: colissimoResponse.errorCode,
          errorMessage:
            COLISSIMO_ERROR_MESSAGES[colissimoResponse.errorCode] ||
            colissimoResponse.errorMessage ||
            "Erreur Colissimo inconnue.",
        },
        { status: 422 },
      ),
    );
  }

  const points = (colissimoResponse.listePointRetraitAcheminement || [])
    .filter((p) => !p.congesTotal)
    .slice(0, 10)
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
    }));

  // request.url reflète le protocole local (http) vu par le serveur Node
  // derrière le tunnel/reverse proxy, pas le protocole public réel (https) :
  // en se fiant à request.url tel quel, l'URL de la carte sortait en http://
  // alors que la page checkout est en https://, et l'image était bloquée
  // silencieusement par le navigateur (contenu mixte). x-forwarded-proto /
  // x-forwarded-host reflètent le protocole et l'hôte publics réels, aussi
  // bien pour le tunnel de dev que pour un hébergement de prod derrière un
  // reverse proxy (Fly.io, Railway, etc.).
  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const requestOrigin =
    forwardedProto && forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : url.origin;

  return cors(
    Response.json({
      points,
      mapUrl: buildMapImageUrl(points, requestOrigin),
    }),
  );
}
