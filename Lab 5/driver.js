"use strict";
// required npm install blind-signatures
const blindSignatures = require('blind-signatures');

const { Coin, COIN_RIS_LENGTH, IDENT_STR, BANK_STR } = require('./coin.js');
const utils = require('./utils.js');

// Details about the bank's key.
const BANK_KEY = blindSignatures.keyGeneration({ b: 2048 });
const N = BANK_KEY.keyPair.n.toString();
const E = BANK_KEY.keyPair.e.toString();

/**
 * Function signing the coin on behalf of the bank.
 * 
 * @param blindedCoinHash - the blinded hash of the coin.
 * 
 * @returns the signature of the bank for this coin.
 */
function signCoin(blindedCoinHash) {
  return blindSignatures.sign({
      blinded: blindedCoinHash,
      key: BANK_KEY,
  });
}

/**
 * Parses a string representing a coin, and returns the left/right identity string hashes.
 *
 * @param {string} s - string representation of a coin.
 * 
 * @returns {[[string]]} - two arrays of strings of hashes, committing the owner's identity.
 */
function parseCoin(s) {
  let [cnst, amt, guid, leftHashes, rightHashes] = s.split('-');
  if (cnst !== BANK_STR) {
    throw new Error(`Invalid identity string: ${cnst} received, but ${BANK_STR} expected`);
  }
  let lh = leftHashes ? leftHashes.split(',') : [];
  let rh = rightHashes ? rightHashes.split(',') : [];
  return [lh, rh];
}

/**
 * Procedure for a merchant accepting a token. The merchant randomly selects
 * the left or right halves of the identity string.
 * 
 * @param {Coin} coin - the coin that a purchaser wants to use.
 * 
 * @returns {[String]} - an array of strings, each holding half of the user's identity.
 */
function acceptCoin(coin) {
    // 1) Verify that the signature is valid
    const isValid = blindSignatures.verify({
        unblinded: coin.signature,
        N: N,
        E: E,
        message: coin.toString()
    });

    if (!isValid) {
        throw new Error('Invalid coin signature');
    }

    // 2) Parse coin to get left and right identity string hashes
    const [leftHashes, rightHashes] = parseCoin(coin.toString());

    // Check if hashes are valid
    if (leftHashes.length !== COIN_RIS_LENGTH ||
        rightHashes.length !== COIN_RIS_LENGTH) {
        throw new Error(`Invalid number of identity string hashes: expected ${COIN_RIS_LENGTH}, got left=${leftHashes.length}, right=${rightHashes.length}`);
    }

    // Check if leftIdent and rightIdent exist
    if (!coin.leftIdent || !coin.rightIdent) {
        throw new Error(`Coin object missing leftIdent or rightIdent properties: leftIdent=${JSON.stringify(coin.leftIdent)}, rightIdent=${JSON.stringify(coin.rightIdent)}`);
    }

    // Randomly choose left or right half
    const selectLeft = Math.random() < 0.5;
    
    // 3) Gather the elements of the RIS (Revealed Identity Strings)
    const ris = [];
    for (let i = 0; i < COIN_RIS_LENGTH; i++) {
        // Request the preimage that matches the selected hash
        const selectedHash = selectLeft ? leftHashes[i] : rightHashes[i];
        const preimage = coin.getRis(selectLeft, i);
        
        // Verify the preimage exists
        if (!preimage) {
            throw new Error(`Missing preimage for index ${i} in ${selectLeft ? 'leftIdent' : 'rightIdent'}`);
        }

        // Verify the hash
        if (utils.hash(preimage) !== selectedHash) {
            throw new Error(`Invalid RIS hash at index ${i}: expected ${selectedHash}, got ${utils.hash(preimage)}`);
        }
        
        ris.push(preimage);
    }

    // Log concise coin state after acceptance
    console.log(`Coin accepted: GUID=${coin.guid}, Amount=${coin.amount}, Selected=${selectLeft ? 'left' : 'right'}, RIS length=${ris.length}`);

    return ris;
}

/**
 * If a token has been double-spent, determine who is the cheater
 * and print the result to the screen.
 * 
 * @param guid - Globally unique identifier for coin.
 * @param ris1 - Identity string reported by first merchant.
 * @param ris2 - Identity string reported by second merchant.
 */
function determineCheater(guid, ris1, ris2) {
    // If RIS strings are identical, merchant is cheating
    if (ris1.join(',') === ris2.join(',')) {
        console.log(`Merchant is cheating with coin ${guid}`);
        return;
    }

    // Check each pair of RIS strings
    for (let i = 0; i < COIN_RIS_LENGTH; i++) {
        // XOR the two RIS strings
        const xorResult = utils.decryptOTP({
            key: Buffer.from(ris1[i]),
            ciphertext: Buffer.from(ris2[i]),
            returnType: 'string'
        });
        
        // If XOR result starts with IDENT_STR, we can extract the cheater's ID
        if (xorResult.startsWith(IDENT_STR)) {
            const cheaterId = xorResult.substring(IDENT_STR.length + 1); // Skip IDENT_STR and colon
            console.log(`Double spending detected for coin ${guid}! Cheater is ${cheaterId}`);
            return;
        }
    }
    
    console.log(`No clear cheater identified for coin ${guid}`);
}

let coin = new Coin('alice', 20, N, E);

// Log concise coin state after creation
console.log(`Coin created: GUID=${coin.guid}, Amount=${coin.amount}, LeftIdent=${coin.leftIdent.length}, RightIdent=${coin.rightIdent.length}`);

coin.signature = signCoin(coin.blinded);

coin.unblind();

// Merchant 1 accepts the coin.
let ris1 = acceptCoin(coin);

// Merchant 2 accepts the same coin.
let ris2 = acceptCoin(coin);

// The bank realizes that there is an issue and
// identifies Alice as the cheater.
determineCheater(coin.guid, ris1, ris2);

console.log();
// On the other hand, if the RIS strings are the same,
// the merchant is marked as the cheater.
determineCheater(coin.guid, ris1, ris1);