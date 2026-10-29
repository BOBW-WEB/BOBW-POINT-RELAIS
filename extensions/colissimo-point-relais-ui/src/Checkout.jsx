import '@shopify/ui-extensions/preact';
import {render} from "preact";
import {useState, useEffect} from "preact/hooks";

// URL publique de notre backend (voir shopify.server.js / .env SHOPIFY_APP_URL)
// A remplacer par l'URL de tunnel/prod une fois deployee.
const APP_BACKEND_URL = "https://substitute-normally-deleted-strongly.trycloudflare.com";

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const [points, setPoints] = useState(null);
  const [mapUrl, setMapUrl] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  const orderConfirmation = shopify.orderConfirmation?.value;
  const shippingAddress = shopify.shippingAddress?.value;
  const deliveryGroups = shopify.deliveryGroups?.value;
  const firstGroup = deliveryGroups?.[0];
  const selectedOptionHandle = firstGroup?.selectedDeliveryOption?.handle;
  const selectedDeliveryOption = firstGroup?.deliveryOptions?.find(
    (option) => option.handle === selectedOptionHandle,
  );
  const deliveryTitle = selectedDeliveryOption?.title?.toUpperCase() ?? "";
  const isPickupPoint = deliveryTitle.includes("POINT RELAIS");
  // A CONFIRMER PAR TESTS : noms de tarifs vus sur un site actif :
  // "Colissimo Point Relais" et "Colissimo Domicile – Sans signature".
  // Le libellé "avec signature" est une hypothèse (jamais vu en vrai).
  const isHome = !isPickupPoint && deliveryTitle.includes("DOMICILE");
  const homeLabel = deliveryTitle.includes("AVEC SIGNATURE")
    ? "DOMICILE avec signature"
    : "DOMICILE sans signature";

  useEffect(() => {
    if (isHome) {
      // Livraison à domicile : aucun choix client, on écrit la note [DOM]
      // automatiquement (le serveur ignore l'appel si déjà écrite).
      setStatus("not-pickup");
      if (!shippingAddress || !orderConfirmation?.order?.id) return;
      (async () => {
        // Le shop n'est plus envoyé par le client : le backend le dérive du
        // session token (voir api.save-pickup-point.jsx), qui est signé par
        // Shopify et ne peut pas être falsifié.
        const token = await shopify.sessionToken.get();
        fetch(`${APP_BACKEND_URL}/api/save-pickup-point`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            orderId: orderConfirmation.order.id,
            domicileAddress: {
              label: homeLabel,
              name:
                shippingAddress.name ||
                [shippingAddress.firstName, shippingAddress.lastName]
                  .filter(Boolean)
                  .join(" "),
              address1: shippingAddress.address1,
              address2: shippingAddress.address2,
              zipCode: shippingAddress.zip,
              city: shippingAddress.city,
              phone: shippingAddress.phone,
            },
          }),
        }).catch(() => {});
      })();
      return;
    }

    if (!isPickupPoint) {
      setStatus("not-pickup");
      return;
    }

    if (!shippingAddress?.zip || !shippingAddress?.city) {
      setStatus("no-address");
      return;
    }

    (async () => {
      const token = await shopify.sessionToken.get();
      fetch(`${APP_BACKEND_URL}/api/pickup-points`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          address: shippingAddress.address1,
          zipCode: shippingAddress.zip,
          city: shippingAddress.city,
          countryCode: shippingAddress.countryCode,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            setError(data.error);
            setStatus("error");
            return;
          }
          setPoints(data.points);
          setMapUrl(data.mapUrl);
          setStatus("ready");
        })
        .catch(() => {
          setError("network");
          setStatus("error");
        });
    })();
  }, [shippingAddress?.zip, isPickupPoint, isHome, orderConfirmation?.order?.id]);

  async function confirmSelection() {
    const point = points?.find((p) => p.id === selectedId);
    if (!point) return;

    setStatus("saving");

    try {
      const token = await shopify.sessionToken.get();
      const res = await fetch(`${APP_BACKEND_URL}/api/save-pickup-point`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderId: orderConfirmation?.order?.id,
          point: {...point, phone: shippingAddress?.phone || ""},
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(`save_failed: ${res.status} ${JSON.stringify(data)}`);
        setStatus("error");
        return;
      }
      setStatus("saved");
    } catch (err) {
      setError(`save_network: ${err?.message}`);
      setStatus("error");
    }
  }

  if (status === "loading") {
    return (
      <s-banner heading="Choisissez votre point retrait">
        <s-spinner />
      </s-banner>
    );
  }

  if (status === "not-pickup" || status === "no-address") {
    // Livraison Domicile (ou adresse pas encore disponible) : rien a
    // choisir, l'extension ne s'affiche pas.
    return null;
  }

  if (status === "error") {
    return (
      <s-banner heading="Colissimo - une erreur est survenue" tone="critical">
        <s-text>{error}</s-text>
      </s-banner>
    );
  }

  if (status === "saved") {
    return (
      <s-banner heading="Point retrait confirmé" tone="success">
        <s-text>Votre point retrait a bien été enregistré.</s-text>
      </s-banner>
    );
  }

  return (
    <s-banner heading="Choisissez votre point retrait Colissimo" tone="warning">
      <s-stack gap="base">
        <s-text type="strong">
          Important : sélectionnez votre point retrait et cliquez sur
          "Valider" avant de quitter cette page, sinon nous ne pourrons pas
          livrer votre colis correctement.
        </s-text>

        <s-choice-list
          name="pickup-point"
          values={selectedId ? [selectedId] : []}
          onChange={(event) =>
            setSelectedId(event.currentTarget.values?.[0] ?? null)
          }
        >
          {points.map((point) => (
            <s-choice key={point.id} value={point.id}>
              {point.name}
              <s-text slot="details" appearance="subdued">
                {point.address1}, {point.zipCode} {point.city} -{" "}
                {point.distanceMeters} m
              </s-text>
            </s-choice>
          ))}
        </s-choice-list>

        {mapUrl ? (
          <s-image
            src={mapUrl}
            alt="Carte des points retrait"
            inlineSize="fill"
            aspectRatio="360/220"
          />
        ) : null}

        <s-stack inlineAlignment="center">
        <s-button
          variant="primary"
          onClick={confirmSelection}
          disabled={!selectedId || status === "saving"}
          loading={status === "saving"}
        >
          Valider ce point retrait
        </s-button>
        </s-stack>
      </s-stack>
    </s-banner>
  );
}
