/* ============================================================
 * AstroInsight - IndexedDB Wrapper
 * 既存 AstroApp 内の initDB / getDB / setDB を独立クラス化。
 * 要件: 「全てのIndexedDB操作はラッパー関数経由に統一」
 * 将来Firestore移行時はここだけ差し替えれば良い設計。
 * ============================================================ */

class AstroDB {
    constructor(dbName = 'AstroInsightDB', dbVersion = 1) {
        this.dbName = dbName;
        this.dbVersion = dbVersion;
        this.db = null;
    }

    init() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, this.dbVersion);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('store')) db.createObjectStore('store');
                if (!db.objectStoreNames.contains('backups')) db.createObjectStore('backups');
            };
            req.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async get(key) {
        if (!this.db) await this.init();
        return new Promise((res) => {
            const req = this.db.transaction('store').objectStore('store').get(key);
            req.onsuccess = () => res(req.result);
            req.onerror = () => res(null);
        });
    }

    async set(key, value) {
        if (!this.db) await this.init();
        return new Promise((res, rej) => {
            const tx = this.db.transaction('store', 'readwrite');
            tx.objectStore('store').put(value, key);
            tx.oncomplete = () => res();
            tx.onerror = (e) => rej(e.target.error);
        });
    }

    async delete(key) {
        if (!this.db) await this.init();
        return new Promise((res, rej) => {
            const tx = this.db.transaction('store', 'readwrite');
            tx.objectStore('store').delete(key);
            tx.oncomplete = () => res();
            tx.onerror = (e) => rej(e.target.error);
        });
    }

    async clearAll() {
        if (!this.db) await this.init();
        return new Promise((res, rej) => {
            const tx = this.db.transaction(['store', 'backups'], 'readwrite');
            tx.objectStore('store').clear();
            tx.objectStore('backups').clear();
            tx.oncomplete = () => res();
            tx.onerror = (e) => rej(e.target.error);
        });
    }
}

window.AstroDB = AstroDB;
