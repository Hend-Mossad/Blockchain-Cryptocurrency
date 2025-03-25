"use strict";

let blindSignatures = require("blind-signatures");
let BigInteger = require("jsbn").BigInteger;
let rand = require("./rand.js");

const COPIES_REQUIRED = 10;

class SpyAgency {
  constructor() {
    this.key = blindSignatures.keyGeneration({ b: 2048 });
  }

  consistent(blindHash, factor, originalHash) {
    let n = new BigInteger(this.key.keyPair.n.toString());
    let e = new BigInteger(this.key.keyPair.e.toString());

    let originalHashBigInt = new BigInteger(originalHash, 16);
    let computed = originalHashBigInt.multiply(factor.modPow(e, n)).mod(n).toString();

    return blindHash.toString() === computed;
  }

  verifyContents(blindHash, blindingFactor, originalDoc) {
    if (!originalDoc) {
      return false;
    }

    let expectedFormat = /^The bearer of this signed document, .*, has full diplomatic immunity.$/;
    if (!originalDoc.match(expectedFormat)) {
      return false;
    }

    let h = blindSignatures.messageToHash(originalDoc).toString(16);
    return this.consistent(blindHash, blindingFactor, h);
  }

  signDocument(blindDocs, response) {
    if (blindDocs.length !== COPIES_REQUIRED) {
      throw new Error(`❌ Expected ${COPIES_REQUIRED} documents, got ${blindDocs.length}`);
    }

    let selected = rand.nextInt(blindDocs.length);
    console.log(`🕵️ Agency selected document ${selected}`);

    response(selected, (blindingFactors, originalDocs) => {
      let validDocuments = blindDocs.filter((_, i) => i !== selected);
      let validFactors = blindingFactors.filter((_, i) => i !== selected);
      let validOriginals = originalDocs.filter((_, i) => i !== selected);

      for (let i = 0; i < validDocuments.length; i++) {
        if (!validFactors[i] || !validOriginals[i]) {
          console.error(`🚨 ERROR: Missing data for document ${i}!`);
          return null;
        }

        if (!this.verifyContents(validDocuments[i], validFactors[i], validOriginals[i])) {
          throw new Error(`❌ Document ${i} is invalid!`);
        }
      }

      console.log(`📝 Signing document ${selected}...`);

      let blindedDoc = blindDocs[selected];
      if (!blindedDoc || typeof blindedDoc !== "string") {
        console.error(`🚨 ERROR: Selected blind document (${selected}) is invalid!`);
        return null;
      }

      try {
        let signedDoc = blindSignatures.sign({
          blinded: new BigInteger(blindedDoc, 10),
          key: this.key,
        });

        return signedDoc;
      } catch (error) {
        console.error("🚨 Signing error:", error);
        return null;
      }
    });
  }

  get n() {
    return this.key.keyPair.n.toString();
  }

  get e() {
    return this.key.keyPair.e.toString();
  }
}

exports.SpyAgency = SpyAgency;