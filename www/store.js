// Local storage on the phone (IndexedDB) + encrypted backup/restore.
(function () {
  const DB = 'typeg-quotes', VER = 1;
  let dbp;
  function db() {
    return dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('kv');
        d.createObjectStore('jobs', { keyPath: 'id' });
        d.createObjectStore('photos', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  }
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode), s = t.objectStore(store);
      const out = fn(s);
      t.oncomplete = () => res(out instanceof IDBRequest ? out.result : out);
      t.onerror = () => rej(t.error);
    });
  }
  const Store = {
    get: (k) => tx('kv', 'readonly', s => s.get(k)),
    set: (k, v) => tx('kv', 'readwrite', s => s.put(v, k)),
    jobs: () => tx('jobs', 'readonly', s => s.getAll()),
    job: (id) => tx('jobs', 'readonly', s => s.get(id)),
    putJob: (j) => tx('jobs', 'readwrite', s => s.put(j)),
    delJob: (id) => tx('jobs', 'readwrite', s => s.delete(id)),
    photo: (id) => tx('photos', 'readonly', s => s.get(id)),
    putPhoto: (p) => tx('photos', 'readwrite', s => s.put(p)),
    delPhoto: (id) => tx('photos', 'readwrite', s => s.delete(id)),
    photos: () => tx('photos', 'readonly', s => s.getAll()),
    async clearAll() {
      await tx('jobs', 'readwrite', s => s.clear());
      await tx('photos', 'readwrite', s => s.clear());
      await tx('kv', 'readwrite', s => s.clear());
    }
  };

  // ---- Encryption: PBKDF2(SHA-256, 250k) -> AES-GCM 256 ----
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = buf => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function key(pass, salt) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const Crypto = {
    async encrypt(obj, pass) {
      const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(pass, salt), enc.encode(JSON.stringify(obj)));
      return JSON.stringify({ app: 'typeg-quote', v: 1, salt: b64(salt), iv: b64(iv), data: b64(ct) });
    },
    async decrypt(text, pass) {
      const f = JSON.parse(text);
      if (f.app !== 'typeg-quote') throw new Error('الملف ده مش نسخة من التطبيق');
      try {
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(f.iv) }, await key(pass, unb64(f.salt)), unb64(f.data));
        return JSON.parse(dec.decode(pt));
      } catch (e) { throw new Error('الرقم السري غلط أو الملف تالف'); }
    }
  };

  async function exportAll() {
    return { exportedAt: new Date().toISOString(), settings: await Store.get('settings'), catalog: await Store.get('catalog'),
      jobs: await Store.jobs(), photos: await Store.photos() };
  }
  async function importAll(data) {
    await Store.clearAll();
    await Store.set('settings', data.settings);
    await Store.set('catalog', data.catalog);
    for (const j of data.jobs || []) await Store.putJob(j);
    for (const p of data.photos || []) await Store.putPhoto(p);
  }
  window.Store = Store; window.AppCrypto = Crypto; window.Backup = { exportAll, importAll };
})();
