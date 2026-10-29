import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatPointRetraitNote,
  formatDomicileNote,
  buildOrderGid,
  mergeNote,
} from "./colissimo-notes.js";

test("formatPointRetraitNote formats a pickup point note", () => {
  const note = formatPointRetraitNote({
    type: "A2P",
    id: "343407",
    name: "TABAC DU CENTRE",
    address1: "12 RUE DE LA PAIX",
    zipCode: "75002",
    city: "PARIS",
    phone: "0612345678",
  });
  assert.equal(
    note,
    "[A2P-343407]FR - POINT RETRAIT : TABAC DU CENTRE 12 RUE DE LA PAIX 75002 PARIS 0612345678",
  );
});

test("formatPointRetraitNote tolerates a missing phone number", () => {
  const note = formatPointRetraitNote({
    type: "BPR",
    id: "620450",
    name: "BUREAU DE POSTE",
    address1: "1 PLACE DE LA MAIRIE",
    zipCode: "69001",
    city: "LYON",
    phone: "",
  });
  assert.equal(
    note,
    "[BPR-620450]FR - POINT RETRAIT : BUREAU DE POSTE 1 PLACE DE LA MAIRIE 69001 LYON",
  );
});

test("formatDomicileNote defaults to 'sans signature' and uppercases the result", () => {
  const note = formatDomicileNote({
    name: "Jean Dupont",
    address1: "3 rue des Lilas",
    zipCode: "33000",
    city: "Bordeaux",
    phone: "0601020304",
  });
  assert.equal(
    note,
    "[DOM]FR - DOMICILE sans signature : JEAN DUPONT 3 RUE DES LILAS 33000 BORDEAUX FR 0601020304",
  );
});

test("formatDomicileNote respects an explicit label", () => {
  const note = formatDomicileNote({
    label: "DOMICILE avec signature",
    name: "Jean Dupont",
    address1: "3 rue des Lilas",
    zipCode: "33000",
    city: "Bordeaux",
    phone: "0601020304",
  });
  assert.match(note, /^\[DOM\]FR - DOMICILE avec signature : /);
});

test("buildOrderGid reconstructs a clean Order gid from a numeric id", () => {
  assert.equal(buildOrderGid("1010"), "gid://shopify/Order/1010");
});

test("buildOrderGid reconstructs a clean Order gid from an OrderIdentity gid", () => {
  assert.equal(
    buildOrderGid("gid://shopify/OrderIdentity/1010"),
    "gid://shopify/Order/1010",
  );
});

test("mergeNote replaces an empty note", () => {
  assert.equal(mergeNote("", "[DOM]FR - ..."), "[DOM]FR - ...");
  assert.equal(mergeNote(null, "[DOM]FR - ..."), "[DOM]FR - ...");
});

test("mergeNote replaces a previous Colissimo note (customer changed their mind)", () => {
  assert.equal(
    mergeNote(
      "[DOM]FR - DOMICILE sans signature : ...",
      "[A2P-1]FR - POINT RETRAIT : ...",
    ),
    "[A2P-1]FR - POINT RETRAIT : ...",
  );
});

test("mergeNote preserves an unrelated existing note instead of overwriting it", () => {
  assert.equal(
    mergeNote("Appeler avant livraison", "[A2P-1]FR - POINT RETRAIT : ..."),
    "Appeler avant livraison\n[A2P-1]FR - POINT RETRAIT : ...",
  );
});
