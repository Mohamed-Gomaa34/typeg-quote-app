// Encrypt / decrypt the price list that ships in the public repo.
//   PRICES_PW=... node tools/prices.mjs encrypt private/prices.json www/prices.enc
//   PRICES_PW=... node tools/prices.mjs decrypt www/prices.enc private/prices.json
// Same format as the app (PBKDF2-SHA256 250k -> AES-GCM-256), so the app can open it with the same password.
import { webcrypto as wc } from 'node:crypto';
import fs from 'node:fs';
const [, , cmd, src, dst] = process.argv;
const pw = process.env.PRICES_PW;
if (!pw || !cmd || !src || !dst) { console.error('usage: PRICES_PW=.. node tools/prices.mjs encrypt|decrypt <src> <dst>'); process.exit(1); }
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = b => Buffer.from(b).toString('base64'), unb64 = s => new Uint8Array(Buffer.from(s, 'base64'));
async function key(salt) {
  const base = await wc.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
  return wc.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
if (cmd === 'encrypt') {
  const catalog = JSON.parse(fs.readFileSync(src, 'utf8'));
  const salt = wc.getRandomValues(new Uint8Array(16)), iv = wc.getRandomValues(new Uint8Array(12));
  const ct = await wc.subtle.encrypt({ name: 'AES-GCM', iv }, await key(salt), enc.encode(JSON.stringify({ catalog })));
  const ver = Date.now();
  fs.writeFileSync(dst, JSON.stringify({ app: 'typeg-quote', kind: 'prices', v: 1, ver, salt: b64(salt), iv: b64(iv), data: b64(ct) }));
  console.log(`encrypted ${catalog.length} items, ver ${ver}`);
} else if (cmd === 'decrypt') {
  const f = JSON.parse(fs.readFileSync(src, 'utf8'));
  const pt = await wc.subtle.decrypt({ name: 'AES-GCM', iv: unb64(f.iv) }, await key(unb64(f.salt)), unb64(f.data));
  const { catalog } = JSON.parse(dec.decode(pt));
  fs.writeFileSync(dst, JSON.stringify(catalog, null, 1));
  console.log(`decrypted ${catalog.length} items (ver ${f.ver})`);
}
