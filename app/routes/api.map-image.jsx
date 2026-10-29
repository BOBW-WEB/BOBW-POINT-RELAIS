// Proxy l'image Mapbox depuis notre propre domaine : les extensions Checkout
// ne peuvent charger des images que depuis le domaine de l'app elle-meme,
// pas depuis un domaine tiers (Mapbox) directement.

const MAPBOX_STATIC_BASE =
  "https://api.mapbox.com/styles/v1/mapbox/streets-v12/static";

export async function loader({ request }) {
  const url = new URL(request.url);
  const markers = url.searchParams.get("markers");

  if (!markers) {
    return new Response("missing markers", { status: 400 });
  }

  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    console.error("[map-image] MAPBOX_ACCESS_TOKEN manquant");
    return new Response("missing mapbox token", { status: 500 });
  }

  const mapboxUrl = `${MAPBOX_STATIC_BASE}/${markers}/auto/360x220@2x?padding=30&access_token=${token}`;

  const res = await fetch(mapboxUrl);
  if (!res.ok) {
    console.error("[map-image] erreur Mapbox", {
      status: res.status,
      statusText: res.statusText,
    });
    return new Response("mapbox error", { status: 502 });
  }

  return new Response(res.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
