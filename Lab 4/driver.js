"use strict";

let blindSignatures = require('blind-signatures');
let SpyAgency = require('./spyAgency.js').SpyAgency;

function makeDocument(coverName) {
  return `The bearer of this signed document, ${coverName}, has full diplomatic immunity.`;
}

function blind(msg, n, e) {
  return blindSignatures.blind({
    message: msg,
    N: n,
    E: e,
  });
}

function unblind(blindingFactor, sig, n) {
  return blindSignatures.unblind({
    signed: sig,
    N: n,
    r: blindingFactor,
  });
}

let agency = new SpyAgency();

// Preparing 10 documents with 10 different identities
let coverNames = [
  "Agent A", "Agent B", "Agent C", "Agent D", "Agent E",
  "Agent F", "Agent G", "Agent H", "Agent I", "Agent J"
];

let documents = coverNames.map(makeDocument);
let blindedDocs = [];
let blindingFactors = [];
let originalDocs = [];

// Blinding each document and storing factors
for (let doc of documents) {
  let { blinded, r } = blind(doc, agency.n, agency.e);
  blindedDocs.push(blinded);
  blindingFactors.push(r);
  originalDocs.push(doc); // Storing the original document
}

agency.signDocument(blindedDocs, (selected, verifyAndSign) => {
  console.log(`🕵️ Spy Agency selected document ${selected}`);

  // Preparing original factors and documents
  let adjustedBlindingFactors = blindingFactors.map((factor, index) =>
    index === selected ? undefined : factor
  );
  let adjustedOriginalDocs = originalDocs.map((doc, index) =>
    index === selected ? undefined : doc
  );

  // Checking values before signing
  console.log("Adjusted Blinding Factors:", adjustedBlindingFactors);
  console.log("Adjusted Original Docs:", adjustedOriginalDocs);

  // Signing the selected document
  let signedBlindedDoc = verifyAndSign(adjustedBlindingFactors, adjustedOriginalDocs);

  if (!signedBlindedDoc) {
    console.error("❌ Error: Document signing failed!");
    return;
  }

  // Unblinding the signature
  let signature = unblind(blindingFactors[selected], signedBlindedDoc, agency.n);

  console.log(`✔️ Original signature for document "${coverNames[selected]}":`);
  console.log(signature);
});
