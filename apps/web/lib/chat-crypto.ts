// End-to-end encryption for Messages, with the browser's WebCrypto. The
// mobile app does exactly the same (apps/mobile/lib/src/chat/crypto.dart);
// keep the two in step.
//
// - Each device (browser, desktop app) has an X25519 key pair. The private
//   key is created non-extractable and kept in this browser's IndexedDB; the
//   server keeps the public key (base64 of 32 bytes).
// - A message is encrypted once with a fresh random 32-byte key and a fresh
//   random 12-byte nonce (AES-256-GCM); associated data binds it to sender
//   and recipient: "hgv-chat-v1|<sender id>|<recipient id>".
// - The key is wrapped for each device of both people: X25519(sender device,
//   device) → HKDF-SHA256 (salt "hgv-chat-wrap-v1", info "<sender device
//   id>|<device id>") → AES-256-GCM with its own random nonce, associated
//   data = the message's nonce (base64).
// - Photos: each file is encrypted on its own with a fresh random key and
//   nonce (AES-256-GCM, associated data "hgv-chat-file-v1") and stored as an
//   opaque blob; its id, key, nonce, size and tiny preview travel inside the
//   encrypted message ("a" next to the text "t"), as WhatsApp does.

const enc = new TextEncoder();
const dec = new TextDecoder();
const SALT = enc.encode("hgv-chat-wrap-v1");

export const b64 = (b: ArrayBuffer | Uint8Array) => {
  const a = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s);
};
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** A photo inside a message: blob id, its key and nonce, size, tiny preview. */
export interface FileRef { id: string; k: string; n: string; w?: number; h?: number; th?: string }

/** Encrypts a file with its own fresh key: the blob for the server, the key for the message. */
export async function sealFile(bytes: Uint8Array<ArrayBuffer>): Promise<{ data: string; key: string; nonce: string }> {
  const raw = random(32), nonce = random(12);
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const c = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: enc.encode("hgv-chat-file-v1") }, key, bytes as BufferSource);
  return { data: b64(c), key: b64(raw), nonce: b64(nonce) };
}

/** The file's bytes, or null when it doesn't open (wrong key, tampered). */
export async function openFile(data: string, keyB64: string, nonceB64: string): Promise<Uint8Array | null> {
  try {
    const key = await crypto.subtle.importKey("raw", unb64(keyB64), "AES-GCM", false, ["decrypt"]);
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(nonceB64), additionalData: enc.encode("hgv-chat-file-v1") }, key, unb64(data)));
  } catch {
    return null;
  }
}

export interface Sealed {
  ciphertext: string;
  nonce: string;
  keys: Record<string, { wrapped: string; nonce: string }>;
}

export interface Device {
  id: string;
  publicKey: string;
  privateKey: CryptoKey;
}

/** Whether this browser can do Messages' encryption (X25519 in WebCrypto). */
export async function supported(): Promise<boolean> {
  try {
    await crypto.subtle.generateKey({ name: "X25519" }, false, ["deriveBits"]);
    return true;
  } catch {
    return false;
  }
}

// ── This device's key pair, kept in IndexedDB (per account) ──────────────
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("hgv-chat", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("devices");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const r = db.transaction("devices").objectStore("devices").get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });
}
async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("devices", "readwrite");
    tx.objectStore("devices").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** This device for [owner] (the user id): made once, then reused. */
export async function loadDevice(owner: string): Promise<Device> {
  const saved = await idbGet<Device>(`device:${owner}`);
  if (saved?.privateKey && saved.publicKey && saved.id) return saved;
  const pair = (await crypto.subtle.generateKey({ name: "X25519" }, false, ["deriveBits"])) as CryptoKeyPair;
  const publicKey = b64(await crypto.subtle.exportKey("raw", pair.publicKey));
  const id = "d_" + b64(random(12)).replace(/[^A-Za-z0-9]/g, "");
  const device: Device = { id, publicKey, privateKey: pair.privateKey };
  await idbPut(`device:${owner}`, device);
  return device;
}

/** A device from a raw 32-byte X25519 private key (tests). */
export async function deviceFromSeed(id: string, seed: Uint8Array, publicKey: string): Promise<Device> {
  // PKCS#8 wrapper for an X25519 private key (RFC 8410).
  const prefix = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20]);
  const pkcs8 = new Uint8Array(prefix.length + 32);
  pkcs8.set(prefix);
  pkcs8.set(seed, prefix.length);
  const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "X25519" }, false, ["deriveBits"]);
  return { id, publicKey, privateKey };
}

async function kek(me: Device, publicKey: string, senderDevice: string, receiverDevice: string): Promise<CryptoKey> {
  const pub = await crypto.subtle.importKey("raw", unb64(publicKey), { name: "X25519" }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: "X25519", public: pub } as AlgorithmIdentifier, me.privateKey, 256);
  const hk = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: SALT, info: enc.encode(`${senderDevice}|${receiverDevice}`) },
    hk, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

/** Encrypts [text] with the key wrapped for every device (id → public key). */
export async function seal(me: Device, text: string, senderId: string, recipientId: string, devices: Record<string, string>, files: FileRef[] = []): Promise<Sealed> {
  const raw = random(32), nonce = random(12);
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const body = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: enc.encode(`hgv-chat-v1|${senderId}|${recipientId}`) },
    key, enc.encode(JSON.stringify(files.length ? { t: text, a: files } : { t: text })),
  );
  const nonceB64 = b64(nonce);
  const keys: Sealed["keys"] = {};
  for (const [deviceId, publicKey] of Object.entries(devices)) {
    const wn = random(12);
    const w = await crypto.subtle.encrypt({ name: "AES-GCM", iv: wn, additionalData: enc.encode(nonceB64) },
      await kek(me, publicKey, me.id, deviceId), raw);
    keys[deviceId] = { wrapped: b64(w), nonce: b64(wn) };
  }
  return { ciphertext: b64(body), nonce: nonceB64, keys };
}

/** The text of a message, or null when it can't be read on this device. */
export async function open(me: Device, m: Parameters<typeof openBody>[1]): Promise<string | null> {
  return (await openBody(me, m))?.text ?? null;
}

/** The text and photos of a message, or null when it can't be read here. */
export async function openBody(me: Device, m: {
  ciphertext: string; nonce: string; wrapped: string; wrapNonce: string;
  senderDeviceId: string; senderPublicKey: string; senderId: string; recipientId: string;
}): Promise<{ text: string; files: FileRef[] } | null> {
  try {
    const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(m.wrapNonce), additionalData: enc.encode(m.nonce) },
      await kek(me, m.senderPublicKey, m.senderDeviceId, me.id), unb64(m.wrapped));
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    const clear = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(m.nonce), additionalData: enc.encode(`hgv-chat-v1|${m.senderId}|${m.recipientId}`) },
      key, unb64(m.ciphertext),
    );
    const j = JSON.parse(dec.decode(clear));
    if (typeof j?.t !== "string") return null;
    return { text: j.t, files: Array.isArray(j.a) ? (j.a as FileRef[]).filter((f) => f && typeof f.id === "string") : [] };
  } catch {
    return null;
  }
}

/** The conversation's security code (same 30 digits on both sides). */
export async function securityCode(publicKeys: string[]): Promise<string> {
  const sorted = [...publicKeys].sort();
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(sorted.join("|"))));
  const groups: string[] = [];
  for (let g = 0; g < 6; g++) {
    const n = (((b[4 * g] << 24) >>> 0) + (b[4 * g + 1] << 16) + (b[4 * g + 2] << 8) + b[4 * g + 3]) % 100000;
    groups.push(String(n).padStart(5, "0"));
  }
  return groups.join(" ");
}
