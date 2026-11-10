// Device API key (same format as the desktop app, electron/crypto.cjs):
//   RZT1.<base64url( iv[12] | tag[16] | ciphertext )>   AES-256-GCM, key = SHA-256(secret)
//   payload JSON { v, url, device_id, outlet_id, code, exp }
import { gcm } from '@noble/ciphers/aes.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { KEY_SECRET } from './config';
import { fromBase64, utf8Decode, utf8Encode } from './bytes';

const PREFIX = 'RZT1.';

export function decryptApiKey(apiKey) {
  const raw = String(apiKey || '').trim().replace(/\s+/g, '');
  if (!raw.startsWith(PREFIX)) throw new Error('This is not a Reztra device key.');
  let data;
  try { data = fromBase64(raw.slice(PREFIX.length)); } catch { throw new Error('The key is damaged. Copy it again from the web app.'); }
  if (data.length < 29) throw new Error('The key is incomplete. Copy it again from the web app.');
  let p;
  try {
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const ct = data.subarray(28);
    const sealed = new Uint8Array(ct.length + tag.length);   // noble expects ciphertext | tag
    sealed.set(ct, 0);
    sealed.set(tag, ct.length);
    const plain = gcm(sha256(utf8Encode(KEY_SECRET)), iv).decrypt(sealed);
    p = JSON.parse(utf8Decode(plain));
    if (!p.url || !p.device_id) throw new Error('missing fields');
  } catch {
    throw new Error('Invalid key. Check that it was copied completely and generated for this app.');
  }
  if (p.exp && Date.now() / 1000 > p.exp) throw new Error('This key has expired. Generate a new one in the web app.');
  return { url: String(p.url).replace(/\/+$/, ''), device_id: String(p.device_id), outlet_id: p.outlet_id || null, code: p.code || null, exp: p.exp || null };
}
