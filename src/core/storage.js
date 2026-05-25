/**
 * storage.js
 * IndexedDB 封装 — Word Island Builder 数据持久化
 */

const DB_NAME = 'word-island-builder';
const DB_VERSION = 1;
const STORE = 'game-state';
const KEY = 'current';
let db = null;

export async function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      if (!e.target.result.objectStoreNames.contains(STORE))
        e.target.result.createObjectStore(STORE);
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

export async function saveGameData(data) {
  if (!db) await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadGameData() {
  if (!db) await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** 重置所有数据 */
export async function clearDB() {
  if (db) { db.close(); db = null; }
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => { console.warn('DB delete blocked'); resolve(); };
  });
}