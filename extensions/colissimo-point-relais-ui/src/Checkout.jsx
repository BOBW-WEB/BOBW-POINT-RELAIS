import '@shopify/ui-extensions/preact';
import {render} from "preact";
import {useState, useEffect, useRef} from "preact/hooks";

// URL publique de notre backend (voir shopify.server.js / .env SHOPIFY_APP_URL).
const APP_BACKEND_URL = "https://web-production-9de13.up.railway.app";

// API publique du gouvernement francais, gratuite et sans cle, deja utilisee
// cote client dans la maquette de reference.
const ADDRESS_SEARCH_URL = "https://api-adresse.data.gouv.fr/search/";

const DAY_KEYS = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
];
const DAY_LABELS = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];
const DAY_LABELS_SHORT = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

function formatDistance(meters) {
  if (meters == null) return "";
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters} m`;
}

// Colissimo renvoie les noms/adresses TOUT EN MAJUSCULES ; on adoucit pour
// l'affichage uniquement (la note enregistree dans la commande garde la
// casse d'origine, voir api.save-pickup-point.jsx).
/** @param {string} value */
function toTitleCase(value) {
  if (!value) return value;
  return value.toLowerCase().replace(/(^|[\s-])\S/g, (m) => m.toUpperCase());
}

// Types Colissimo observes : "BPR" = bureau de poste, le reste (A2P, CDS...)
// couvre les commerces/casiers du reseau relais.
function pointCategory(type) {
  return type && String(type).toUpperCase().includes("BPR") ? "post" : "shop";
}
const CATEGORY_LABEL = { post: "Bureau de poste", shop: "Relais commerçant" };

/** @param {string} value @returns {string[][]} */
function parseHourRanges(value) {
  if (!value) return [];
  return value
    .trim()
    .split(/\s+/)
    .map((range) => range.split("-"))
    // Colissimo renvoie parfois "00:00-00:00" pour signaler un jour ferme
    // plutot qu'une chaine vide : une plage degeneree (depart == fin) compte
    // comme fermee.
    .filter(
      /** @param {string[]} parts */
      (parts) =>
        parts.length === 2 && parts[0] && parts[1] && parts[0] !== parts[1],
    );
}

/** @param {string} value */
function formatDayHours(value) {
  const ranges = parseHourRanges(value);
  if (!ranges.length) return null;
  return ranges
    .map(([start, end]) => `${start.replace(":", "h")} – ${end.replace(":", "h")}`)
    .join(" · ");
}

/** @param {string} t */
function toMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Statut "ouvert/ferme" calcule en direct a partir des horaires Colissimo,
// sur le modele de la maquette de reference.
function pointStatus(hours) {
  if (!hours) return { open: false, text: "" };
  const now = new Date();
  const dayIndex = (now.getDay() + 6) % 7; // 0 = lundi
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayRanges = parseHourRanges(hours[DAY_KEYS[dayIndex]]);

  for (const [start, end] of todayRanges) {
    if (nowMin >= toMinutes(start) && nowMin < toMinutes(end)) {
      return { open: true, text: `Ouvert · ferme à ${end.replace(":", "h")}` };
    }
  }
  for (const [start] of todayRanges) {
    if (toMinutes(start) > nowMin) {
      return { open: false, text: `Fermé · ouvre à ${start.replace(":", "h")}` };
    }
  }
  for (let i = 1; i <= 7; i++) {
    const idx = (dayIndex + i) % 7;
    const ranges = parseHourRanges(hours[DAY_KEYS[idx]]);
    if (ranges.length) {
      const when = i === 1 ? "demain" : DAY_LABELS_SHORT[idx];
      return {
        open: false,
        text: `Fermé · ouvre ${when} à ${ranges[0][0].replace(":", "h")}`,
      };
    }
  }
  return { open: false, text: "Fermé" };
}

export default async () => {
  render(<Extension />, document.body);
};

// Composant interne sans propTypes (non utilise ailleurs dans ce projet Preact).
/* eslint-disable react/prop-types */
function AddressSearch({
  query,
  onQueryInput,
  suggestions,
  onPick,
  effectiveLabel,
  isOverride,
  onReset,
}) {
  return (
    <s-stack gap="small">
      <s-text-field
        label="Rechercher une autre adresse"
        icon="search"
        value={query}
        onInput={(event) => onQueryInput(event.currentTarget.value)}
      ></s-text-field>

      {suggestions.length > 0 ? (
        <s-box border="base base" borderRadius="base" background="base">
          <s-stack gap="none">
            {suggestions.map(
              /** @param {any} s @param {number} i */
              (s, i) => (
                <s-stack key={s.id} gap="none">
                  <s-clickable
                    onClick={() => onPick(s)}
                    padding="small"
                    accessibilityLabel={s.label}
                  >
                    <s-stack direction="inline" gap="small" alignItems="center">
                      <s-icon type="location" size="small"></s-icon>
                      <s-stack gap="none">
                        <s-text type="small">{s.address1}</s-text>
                        <s-text type="small" color="subdued">
                          {s.zipCode} {s.city}
                        </s-text>
                      </s-stack>
                    </s-stack>
                  </s-clickable>
                  {i < suggestions.length - 1 ? <s-divider></s-divider> : null}
                </s-stack>
              ),
            )}
          </s-stack>
        </s-box>
      ) : null}

      {effectiveLabel ? (
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-icon type="location" size="small"></s-icon>
          <s-text color="subdued">Recherche autour de {effectiveLabel}</s-text>
          {isOverride ? (
            <s-link onClick={onReset}>
              Revenir à l&apos;adresse de livraison
            </s-link>
          ) : null}
        </s-stack>
      ) : null}
    </s-stack>
  );
}

/* eslint-disable react/prop-types */
function ValidateFooter({ selectedPoint, saved, saving, onConfirm }) {
  const kicker = saved
    ? "Point retrait confirmé"
    : selectedPoint
      ? "Point sélectionné"
      : "Aucun point sélectionné";
  const name =
    toTitleCase(selectedPoint?.name) || "Choisissez un point dans la liste";

  return (
    <s-box padding="base" background="subdued" borderRadius="base">
      <s-stack
        direction="inline"
        gap="base"
        alignItems="center"
        justifyContent="space-between"
      >
        <s-stack gap="none">
          <s-text color="subdued">{kicker}</s-text>
          <s-text type="strong">{name}</s-text>
        </s-stack>
        <s-button
          variant="primary"
          onClick={onConfirm}
          disabled={!selectedPoint || saving || saved}
          loading={saving}
        >
          {saved ? <s-icon type="check-circle-filled" size="small"></s-icon> : null}
          {saved ? "Validé" : "Valider ce point retrait"}
        </s-button>
      </s-stack>
    </s-box>
  );
}

function Extension() {
  const [points, setPoints] = useState(null);
  const [mapUrl, setMapUrl] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searchAddress, setSearchAddress] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const searchTimeout = useRef(null);
  const selectedPoint = points?.find((p) => p.id === selectedId);

  const orderConfirmation = shopify.orderConfirmation?.value;
  const shippingAddress = shopify.shippingAddress?.value;
  const deliveryGroups = shopify.deliveryGroups?.value;
  const firstGroup = deliveryGroups?.[0];
  const selectedOptionHandle = firstGroup?.selectedDeliveryOption?.handle;
  const selectedDeliveryOption = firstGroup?.deliveryOptions?.find(
    (option) => option.handle === selectedOptionHandle,
  );
  const deliveryTitle = selectedDeliveryOption?.title?.toUpperCase() ?? "";
  // Noms de tarifs garantis par le script interne qui provisionne les zones
  // de livraison sur les ~300 boutiques : "Colissimo Point Relais" et
  // "Colissimo Domicile – Sans signature" (pas de variante "avec signature").
  const isPickupPoint = deliveryTitle.includes("POINT RELAIS");
  const isHome = !isPickupPoint && deliveryTitle.includes("DOMICILE");
  const homeLabel = "DOMICILE sans signature";

  // L'adresse de livraison de la commande sert de point de depart par
  // defaut ; une recherche manuelle (searchAddress) ne fait que changer
  // la ZONE de recherche des points relais, elle ne touche jamais
  // l'adresse de livraison officielle de la commande.
  const effectiveAddress =
    searchAddress ||
    (shippingAddress
      ? {
          address1: shippingAddress.address1,
          zipCode: shippingAddress.zip,
          city: shippingAddress.city,
          countryCode: shippingAddress.countryCode,
          label: [shippingAddress.address1, shippingAddress.zip, shippingAddress.city]
            .filter(Boolean)
            .join(", "),
        }
      : null);

  // Le numero affiche doit rester fixe (= position dans la liste complete,
  // identique a la numerotation des pins sur la carte) meme quand un filtre
  // de type masque certains points : on l'attribue avant de filtrer.
  const visiblePoints = points
    ? points
        .map((p, i) => ({ ...p, number: i + 1 }))
        .filter((p) => typeFilter === "all" || pointCategory(p.type) === typeFilter)
    : null;

  function handleQueryInput(value) {
    setQuery(value);
    clearTimeout(searchTimeout.current);
    if (value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${ADDRESS_SEARCH_URL}?limit=5&q=${encodeURIComponent(value)}`,
        );
        const data = await res.json();
        setSuggestions(
          (data.features || []).map((f, i) => ({
            id: f.properties?.id || `${i}-${f.properties?.label}`,
            label: f.properties?.label,
            address1: f.properties?.name,
            zipCode: f.properties?.postcode,
            city: f.properties?.city,
            countryCode: "FR",
            lat: f.geometry?.coordinates?.[1],
            lon: f.geometry?.coordinates?.[0],
          })),
        );
      } catch {
        setSuggestions([]);
      }
    }, 300);
  }

  function pickSuggestion(s) {
    setSearchAddress(s);
    setQuery("");
    setSuggestions([]);
    setTypeFilter("all");
  }

  function resetSearch() {
    setSearchAddress(null);
    setQuery("");
    setSuggestions([]);
    setTypeFilter("all");
  }

  function selectPoint(id) {
    setSelectedId(id);
    // Permet de changer de point même après validation, au lieu de rester
    // bloqué sur l'écran confirmé (limite connue de la version précédente).
    if (status === "saved") setStatus("ready");
  }

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

    if (!effectiveAddress?.zipCode || !effectiveAddress?.city) {
      setStatus("no-address");
      return;
    }

    setStatus("loading");
    setSelectedId(null);

    (async () => {
      const token = await shopify.sessionToken.get();
      fetch(`${APP_BACKEND_URL}/api/pickup-points`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          address: effectiveAddress.address1,
          zipCode: effectiveAddress.zipCode,
          city: effectiveAddress.city,
          countryCode: effectiveAddress.countryCode,
          lat: effectiveAddress.lat,
          lon: effectiveAddress.lon,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            setError(data.errorMessage || data.error);
            setStatus("error");
            return;
          }
          setPoints(data.points);
          setMapUrl(data.mapUrl);
          setStatus("ready");
          // Preselectionne le point le plus proche (Colissimo renvoie deja
          // la liste triee par distance) : si le client ne choisit rien
          // d'autre et clique Valider, c'est celui-la qui est enregistre.
          setSelectedId(data.points?.[0]?.id ?? null);
        })
        .catch(() => {
          setError("network");
          setStatus("error");
        });
    })();
  }, [
    effectiveAddress?.zipCode,
    effectiveAddress?.city,
    isPickupPoint,
    isHome,
    orderConfirmation?.order?.id,
  ]);

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
      setError(`save_network: ${err instanceof Error ? err.message : err}`);
      setStatus("error");
    }
  }

  if (status === "loading") {
    return (
      <s-section heading="Choisissez votre point retrait">
        <s-spinner />
      </s-section>
    );
  }

  if (status === "not-pickup") {
    // Livraison Domicile : rien a choisir, l'extension ne s'affiche pas.
    return null;
  }

  if (status === "no-address") {
    return (
      <s-section heading="Choisissez votre point retrait Colissimo">
        <s-stack gap="base">
          <s-text color="subdued">
            Entrez une adresse pour rechercher les points retrait à proximité.
          </s-text>
          <AddressSearch
            query={query}
            onQueryInput={handleQueryInput}
            suggestions={suggestions}
            onPick={pickSuggestion}
            effectiveLabel=""
            isOverride={false}
            onReset={resetSearch}
          />
        </s-stack>
      </s-section>
    );
  }

  if (status === "error") {
    return (
      <s-banner heading="Colissimo - une erreur est survenue" tone="critical">
        <s-text>{error}</s-text>
      </s-banner>
    );
  }

  // "ready" | "saving" | "saved" partagent le meme ecran : seul le pied de
  // page change, le client reste libre de changer de point a tout moment
  // (y compris apres validation) tant que la page de remerciement est ouverte.
  return (
    <s-section heading="Choisissez votre point retrait Colissimo">
      <s-stack gap="base">
        <s-text color="subdued">
          Sélectionnez un point puis cliquez sur <s-text type="strong">Valider</s-text>{" "}
          avant de quitter la page, sinon votre colis ne pourra pas être livré.
        </s-text>

        <AddressSearch
          query={query}
          onQueryInput={handleQueryInput}
          suggestions={suggestions}
          onPick={pickSuggestion}
          effectiveLabel={effectiveAddress?.label || effectiveAddress?.city || ""}
          isOverride={Boolean(searchAddress)}
          onReset={resetSearch}
        />

        {mapUrl ? (
          <s-image
            src={mapUrl}
            alt="Carte des points retrait"
            inlineSize="fill"
            aspectRatio="360/220"
          />
        ) : null}

        <s-stack direction="inline" gap="small">
          <s-button
            variant={typeFilter === "all" ? "primary" : "secondary"}
            onClick={() => setTypeFilter("all")}
          >
            Tous
          </s-button>
          <s-button
            variant={typeFilter === "post" ? "primary" : "secondary"}
            onClick={() => setTypeFilter("post")}
          >
            Bureaux de poste
          </s-button>
          <s-button
            variant={typeFilter === "shop" ? "primary" : "secondary"}
            onClick={() => setTypeFilter("shop")}
          >
            Commerçants
          </s-button>
        </s-stack>

        <s-scroll-box maxBlockSize="320px">
          <s-stack gap="small">
            {visiblePoints.map((point, i) => {
              const st = pointStatus(point.hours);
              const isSel = point.id === selectedId;
              const todayIndex = (new Date().getDay() + 6) % 7;
              const category = pointCategory(point.type);
              return (
                <s-stack key={point.id} gap="small">
                  <s-box
                    padding="base"
                    background={isSel ? "subdued" : "base"}
                    border={isSel ? "base base" : "none"}
                    borderRadius="base"
                  >
                    <s-stack gap="small">
                      <s-clickable
                        onClick={() => selectPoint(point.id)}
                        padding="none"
                        accessibilityLabel={`Sélectionner ${toTitleCase(point.name)}`}
                      >
                        <s-stack gap="small">
                          <s-grid
                            gridTemplateColumns="1fr auto"
                            gap="small"
                            alignItems="start"
                          >
                            <s-grid
                              gridTemplateColumns="auto 1fr"
                              gap="small"
                              alignItems="start"
                            >
                              <s-badge
                                tone={isSel ? "neutral" : "auto"}
                                color="base"
                              >
                                {point.number}
                              </s-badge>
                              <s-stack gap="none">
                                <s-text type="strong">{toTitleCase(point.name)}</s-text>
                                <s-text color="subdued">
                                  {toTitleCase(point.address1)}, {point.zipCode}{" "}
                                  {point.city}
                                </s-text>
                              </s-stack>
                            </s-grid>
                            <s-stack direction="inline" gap="small" alignItems="center">
                              <s-text color="subdued">
                                {formatDistance(point.distanceMeters)}
                              </s-text>
                              <s-icon
                                type={isSel ? "check-circle-filled" : "circle"}
                                size="base"
                              ></s-icon>
                            </s-stack>
                          </s-grid>

                          <s-stack direction="inline" gap="small" alignItems="center">
                            <s-icon
                              type={category === "post" ? "email" : "store"}
                              size="small"
                            ></s-icon>
                            <s-text color="subdued">
                              {CATEGORY_LABEL[category]}
                            </s-text>
                            {st.text ? (
                              <s-text tone={st.open ? "success" : "neutral"}>
                                {st.text}
                              </s-text>
                            ) : null}
                          </s-stack>
                        </s-stack>
                      </s-clickable>

                      <s-details>
                        <s-summary>Voir les horaires</s-summary>
                        <s-stack
                          gap="small-100"
                          background="subdued"
                          borderRadius="base"
                          padding="base"
                        >
                          {DAY_KEYS.map((key, idx) => {
                            const isToday = idx === todayIndex;
                            const formatted = formatDayHours(point.hours?.[key]);
                            return (
                              <s-stack
                                key={key}
                                direction="inline"
                                justifyContent="space-between"
                                gap="base"
                              >
                                <s-text type={isToday ? "strong" : "generic"}>
                                  {DAY_LABELS[idx]}
                                  {isToday ? " (aujourd’hui)" : ""}
                                </s-text>
                                <s-text
                                  type={isToday ? "strong" : "generic"}
                                  color={isToday ? "base" : "subdued"}
                                >
                                  {formatted || "Fermé"}
                                </s-text>
                              </s-stack>
                            );
                          })}
                        </s-stack>
                      </s-details>
                    </s-stack>
                  </s-box>
                  {i < visiblePoints.length - 1 ? <s-divider></s-divider> : null}
                </s-stack>
              );
            })}
            {visiblePoints.length === 0 ? (
              <s-text color="subdued">Aucun point de ce type à proximité.</s-text>
            ) : null}
          </s-stack>
        </s-scroll-box>

        <ValidateFooter
          selectedPoint={selectedPoint}
          saved={status === "saved"}
          saving={status === "saving"}
          onConfirm={confirmSelection}
        />
      </s-stack>
    </s-section>
  );
}
