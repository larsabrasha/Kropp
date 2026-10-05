// The client's local copy of every aggregate, in IndexedDB. The C# side is IndexedDbLocalStore;
// the rules for what may overwrite what are documented on ILocalStore and must stay the same as
// the in-memory store the sync engine's tests run against.

const DB_NAME = 'kropp';
const DB_VERSION = 1;
const RECORDS = 'records';
const META = 'meta';

let dbPromise = null;

function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            const records = db.createObjectStore(RECORDS, { keyPath: 'key' });
            records.createIndex('type', 'type');
            db.createObjectStore(META, { keyPath: 'name' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => { dbPromise = null; reject(request.error); };
    });
    return dbPromise;
}

// Runs work inside one transaction and resolves when it has committed, so a caller never
// sees success for a write the browser then rolled back.
async function inTransaction(stores, mode, work) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(stores, mode);
        let result;
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
        Promise.resolve(work(tx)).then(r => { result = r; }, e => { tx.abort(); reject(e); });
    });
}

function req(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

const time = iso => Date.parse(iso);

export function get(key) {
    return inTransaction([RECORDS], 'readonly', tx => req(tx.objectStore(RECORDS).get(key)))
        .then(r => r ?? null);
}

export function getAll(type) {
    return inTransaction([RECORDS], 'readonly', tx => req(tx.objectStore(RECORDS).index('type').getAll(type)));
}

export function getPending() {
    // Booleans cannot be indexed in IndexedDB; the data set is small enough to scan.
    return inTransaction([RECORDS], 'readonly', tx => req(tx.objectStore(RECORDS).getAll()))
        .then(all => all.filter(r => r.pending));
}

export function put(record) {
    return inTransaction([RECORDS], 'readwrite', tx => req(tx.objectStore(RECORDS).put(record)));
}

export function markSynced(pushed) {
    return inTransaction([RECORDS], 'readwrite', async tx => {
        const store = tx.objectStore(RECORDS);
        for (const p of pushed) {
            const local = await req(store.get(p.key));
            if (local && local.pending && time(local.modifiedAt) === time(p.modifiedAt)) {
                local.pending = false;
                await req(store.put(local));
            }
        }
    });
}

export function applyFromServer(records) {
    return inTransaction([RECORDS], 'readwrite', async tx => {
        const store = tx.objectStore(RECORDS);
        for (const r of records) {
            const key = `${r.type}:${r.id}`;
            const local = await req(store.get(key));
            if (local && local.pending && time(local.modifiedAt) > time(r.modifiedAt)) continue;
            await req(store.put({
                key, type: r.type, id: r.id, modifiedAt: r.modifiedAt,
                isDeleted: r.isDeleted, data: r.data ?? null, pending: false,
            }));
        }
    });
}

export function getMeta(name) {
    return inTransaction([META], 'readonly', tx => req(tx.objectStore(META).get(name)))
        .then(m => m ? m.value : null);
}

export function setMeta(name, value) {
    return inTransaction([META], 'readwrite', tx => req(tx.objectStore(META).put({ name, value })));
}
