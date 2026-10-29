#!/usr/bin/env node
// Audit des tarifs de livraison "Point Relais" / "Domicile" sur une boutique.
//
// Objectif : avant de déployer l'app sur les ~300 boutiques, s'assurer que
// chacune utilise bien un intitulé de tarif détectable par l'extension
// checkout (Checkout.jsx matche sur le texte du titre : "POINT RELAIS" /
// "DOMICILE", voir isPickupPoint / isHome). Ce script interroge les profils
// de livraison existants d'une boutique et signale les incohérences.
//
// Volontairement en lecture seule : créer/modifier des tarifs de livraison
// touche la configuration réelle de la boutique. Avec ~300 boutiques ayant
// chacune potentiellement des zones et transporteurs déjà configurés
// différemment, une mutation automatique en masse serait risquée sans revue
// au cas par cas. Ce script sert à faire l'état des lieux ; la création/
// correction des tarifs se fait ensuite manuellement (ou via un script dédié
// une fois le besoin confirmé boutique par boutique).
//
// Usage :
//   node scripts/setup-delivery-rates.mjs --shop boutique.myshopify.com

import { PrismaClient } from "@prisma/client";

const ADMIN_API_VERSION = "2026-07";

const DELIVERY_PROFILES_QUERY = `
  query AuditDeliveryProfiles($cursor: String) {
    deliveryProfiles(first: 20, after: $cursor) {
      edges {
        node {
          id
          name
          profileLocationGroups {
            locationGroupZones(first: 20) {
              edges {
                node {
                  zone {
                    id
                    name
                  }
                  methodDefinitions(first: 20) {
                    edges {
                      node {
                        id
                        name
                        active
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--shop") {
      args.shop = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

// Reflète exactement la logique de détection côté extension
// (extensions/colissimo-point-relais-ui/src/Checkout.jsx: isPickupPoint / isHome).
function classifyRateName(name) {
  const upper = (name || "").toUpperCase();
  if (upper.includes("POINT RELAIS")) return "point-relais";
  if (upper.includes("DOMICILE")) return "domicile";
  return null;
}

async function getOfflineAccessToken(prisma, shop) {
  const session = await prisma.session.findFirst({
    where: { shop, isOnline: false },
    orderBy: { id: "desc" },
  });
  if (!session?.accessToken) {
    throw new Error(
      `Aucun token offline trouvé pour ${shop} — l'app est-elle bien installée sur cette boutique ?`,
    );
  }
  return session.accessToken;
}

async function fetchAllMethodNames(shop, accessToken) {
  const names = [];
  let cursor = null;

  for (;;) {
    const res = await fetch(
      `https://${shop}/admin/api/${ADMIN_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query: DELIVERY_PROFILES_QUERY,
          variables: { cursor },
        }),
      },
    );
    const json = await res.json();

    if (json.errors) {
      throw new Error(
        `Erreur GraphQL en interrogeant ${shop} : ${JSON.stringify(json.errors)}`,
      );
    }

    const connection = json.data?.deliveryProfiles;
    for (const { node: profile } of connection?.edges || []) {
      for (const { node: lgz } of profile.profileLocationGroups?.flatMap(
        (lg) => lg.locationGroupZones?.edges || [],
      ) || []) {
        for (const { node: method } of lgz.methodDefinitions?.edges || []) {
          names.push({
            profile: profile.name,
            zone: lgz.zone.name,
            method: method.name,
            active: method.active,
          });
        }
      }
    }

    if (!connection?.pageInfo?.hasNextPage) break;
    cursor = connection.pageInfo.endCursor;
  }

  return names;
}

async function main() {
  const { shop } = parseArgs(process.argv.slice(2));
  if (!shop) {
    console.error("Usage: node scripts/setup-delivery-rates.mjs --shop boutique.myshopify.com");
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const accessToken = await getOfflineAccessToken(prisma, shop);
    const methods = await fetchAllMethodNames(shop, accessToken);

    console.log(`\nTarifs de livraison trouvés sur ${shop} :\n`);
    const found = { "point-relais": 0, domicile: 0 };
    for (const m of methods) {
      const kind = classifyRateName(m.method);
      if (kind) found[kind] += 1;
      const tag = kind
        ? `[${kind === "point-relais" ? "POINT RELAIS ✓" : "DOMICILE ✓"}]`
        : "";
      console.log(
        `  - "${m.method}" (zone: ${m.zone}, profil: ${m.profile}, actif: ${m.active}) ${tag}`,
      );
    }

    console.log("\nRésumé :");
    if (found["point-relais"] === 0) {
      console.warn(
        `  ⚠ Aucun tarif détectable comme "Point Relais" sur ${shop} — l'extension ne s'affichera jamais.`,
      );
    } else if (found["point-relais"] > 1) {
      console.warn(
        `  ⚠ ${found["point-relais"]} tarifs différents matchent "Point Relais" sur ${shop} — vérifier qu'il n'y a pas d'ambiguïté.`,
      );
    } else {
      console.log(`  ✓ 1 tarif "Point Relais" détecté.`);
    }

    if (found.domicile === 0) {
      console.warn(`  ⚠ Aucun tarif détectable comme "Domicile" sur ${shop}.`);
    } else if (found.domicile > 1) {
      console.warn(
        `  ⚠ ${found.domicile} tarifs différents matchent "Domicile" sur ${shop} — vérifier qu'il n'y a pas d'ambiguïté.`,
      );
    } else {
      console.log(`  ✓ 1 tarif "Domicile" détecté.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
