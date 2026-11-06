// Endpoint appelé par l'extension Thank You (network_access) pour récupérer
// les points relais Colissimo autour de l'adresse de livraison.
// Protégé par le Session Token API des extensions checkout : authenticate.public.checkout
// vérifie que la requête provient bien d'une extension checkout active sur une boutique
// où l'app est installée (voir app/shopify.server.js) avant de traiter quoi que ce soit.

import { authenticateCheckout } from "../checkout-auth.server";
import { findColissimoPoints } from "../colissimo-client.server";

function buildMapImageUrl(points, requestOrigin, origin) {
  const pointMarkers = points
    .slice(0, 8)
    .map((p, i) => `pin-s-${i + 1}+C4541E(${p.lon},${p.lat})`);

  // Epingle distincte (sans numero, couleur sombre) pour l'adresse de
  // recherche elle-meme, quand on connait ses coordonnees (recherche
  // manuelle geocodee cote client) ; sinon pas d'epingle d'origine.
  const originMarker =
    origin?.lat != null && origin?.lon != null
      ? [`pin-l+1F1B16(${origin.lon},${origin.lat})`]
      : [];

  const markers = [...originMarker, ...pointMarkers].join(",");
  if (!markers) return null;

  // On passe par notre propre backend (api.map-image) : les extensions
  // Checkout ne peuvent pas charger d'image depuis un domaine tiers
  // (Mapbox) directement, seulement depuis le domaine de l'app.
  return `${requestOrigin}/api/map-image?markers=${encodeURIComponent(markers)}`;
}

export async function loader() {
  return new Response(null, { status: 204 });
}

export async function action({ request }) {
  const { sessionToken, cors } = await authenticateCheckout(request);
  // Meme derivation que api.save-pickup-point.jsx : sessionToken.dest est
  // signe par Shopify, utilise uniquement pour l'observabilite ici (aucune
  // ecriture n'est faite sur cette route).
  const shop = sessionToken.dest.includes("://")
    ? new URL(sessionToken.dest).hostname
    : sessionToken.dest;

  if (request.method !== "POST") {
    return cors(
      Response.json({ error: "method_not_allowed" }, { status: 405 }),
    );
  }

  const body = await request.json();
  const { address, zipCode, city, weight, countryCode, lat, lon } = body;

  if (!zipCode || !city) {
    return cors(
      Response.json({ error: "missing_address" }, { status: 400 }),
    );
  }

  const result = await findColissimoPoints({
    address,
    zipCode,
    city,
    countryCode,
    weight,
    requestId: `checkout-${Date.now()}`,
    shop,
  });

  if (result.error) {
    const status = result.error === "colissimo_error" ? 422 : 500;
    return cors(Response.json(result, { status }));
  }

  const points = result.points.slice(0, 10);

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
      mapUrl: buildMapImageUrl(points, requestOrigin, { lat, lon }),
    }),
  );
}
