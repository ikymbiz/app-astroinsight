/* ============================================================
 * AstroInsight - AI Worker Manager
 * Web Worker を生成し、AI生成リクエストの送信と
 * メッセージのコールバック振り分けを行うラッパー。
 *
 * 既存 AstroApp.setupWorkerListeners / startGeneration の
 * Worker通信ロジックを分離独立クラス化。
 * ============================================================ */

class AIWorkerManager {
    /**
     * @param {string} workerPath - 例: './js/workers/ai-worker.js'
     */
    constructor(workerPath = './js/workers/ai-worker.js') {
        this.workerPath = workerPath;
        this.worker = null;
        this.handlers = {
            chunk: () => {},
            done: () => {},
            error: () => {}
        };
        this._init();
    }

    _init() {
        try {
            this.worker = new Worker(this.workerPath);
        } catch (e) {
            // file:// などで読めない場合はfetch + Blob でフォールバック
            console.warn('[AIWorkerManager] Worker直接生成に失敗、Blob経由で再試行:', e.message);
            this._initFromBlob();
            return;
        }
        this._bind();
    }

    async _initFromBlob() {
        try {
            const res = await fetch(this.workerPath);
            const code = await res.text();
            const blob = new Blob([code], { type: 'application/javascript' });
            this.worker = new Worker(URL.createObjectURL(blob));
            this._bind();
        } catch (e) {
            console.error('[AIWorkerManager] Blob経由のWorker生成にも失敗:', e);
        }
    }

    _bind() {
        this.worker.onmessage = (e) => {
            const data = e.data;
            if (data.type === 'chunk') this.handlers.chunk(data);
            else if (data.type === 'done') this.handlers.done(data);
            else if (data.type === 'error') this.handlers.error(data);
        };
        this.worker.onerror = (e) => {
            this.handlers.error({ type: 'error', message: e.message || 'Worker内部エラー' });
        };
    }

    on(type, handler) {
        if (this.handlers[type] !== undefined) this.handlers[type] = handler;
    }

    /**
     * 生成リクエストを送信。
     * @param {Object} payload - { apiKey, model, modelMeta, prompt, isJson }
     */
    generate(payload) {
        if (!this.worker) {
            this.handlers.error({ type: 'error', message: 'Workerが利用できません' });
            return;
        }
        this.worker.postMessage({ action: 'generate', ...payload });
    }
}

window.AIWorkerManager = AIWorkerManager;
