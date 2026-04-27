/* ============================================================
 * AstroInsight - Main App
 * 既存 AstroApp クラスのオーケストレーション層。
 *
 * 各種ロジックは以下のコンポーネント/コアへ委譲：
 *  - AstroDB           ... IndexedDB ラッパー
 *  - ConfigLoader      ... models.json / prompts.json の読み込み・統合
 *  - AIWorkerManager   ... Web Worker 経由のAI生成
 *  - UIController      ... タブ切替などのUI操作
 *  - ProfileComponent  ... プロフィール
 *  - AnalysisComponent ... 自己分析（中断/再開対応）
 *  - TodayComponent    ... 今日の星
 *  - HoroscopeComponent ... 詳細分析（履歴）
 *  - TimelineComponent ... 予報
 *  - ChatComponent     ... AIチャット
 *  - SettingsComponent ... モデル管理・プロンプト編集・データ管理
 *
 * 既存の startGeneration / finishGeneration / handleError / Wake Lock /
 * resume_state 管理 / debounce はこのクラスに残す。
 * ============================================================ */

class AstroApp {
    constructor() {
        // --- コア ---
        this.db = new AstroDB('AstroInsightDB', 1);
        this.config = new ConfigLoader(this.db, {
            modelsPath: './js/config/models.json',
            promptsPath: './js/config/prompts.json'
        });
        this.workerMgr = new AIWorkerManager('./js/workers/ai-worker.js');

        // --- 状態 ---
        this.wakeLock = null;
        this.chartInstance = null;
        this.isGenerating = false;
        this.lastSave = 0;
        this.horoscopeHistory = [];
        this.forecastType = 'monthly';
        this.currentTask = null;

        // --- コントローラー＆コンポーネント ---
        this.ui = new UIController(this);
        this.profile = new ProfileComponent(this);
        this.analysis = new AnalysisComponent(this);
        this.today = new TodayComponent(this);
        this.horoscope = new HoroscopeComponent(this);
        this.timeline = new TimelineComponent(this);
        this.chat = new ChatComponent(this);
        this.settings = new SettingsComponent(this);

        this._bindWorker();
        this.init();
    }

    async init() {
        await this.db.init();
        await this.config.loadDefaults();

        // 設定UIをセットアップ（モデルセレクト・プロンプト編集UI を生成）
        await this.settings.load();

        // 既存データのロード
        await this.profile.load();
        await this.analysis.load();
        await this.horoscope.load();
        await this.timeline.load();
        await this.chat.load();

        this.ui.setupEventListeners();
        await this.analysis.checkResumeState();

        // プロフィール自動保存（debounce）
        this.profile.bindAutoSave();
    }

    /** Worker のメッセージを各種ハンドラに振り分け */
    _bindWorker() {
        this.workerMgr.on('chunk', async (data) => {
            const targetId =
                this.currentTask === 'analysis'
                    ? 'analysis-result'
                    : this.currentTask === 'today'
                      ? 'today-result'
                      : this.currentTask === 'horoscope'
                        ? 'horoscope-result'
                        : null;
            if (targetId) {
                document.getElementById(targetId).innerHTML =
                    marked.parse(data.text) + '<span class="text-astro animate-pulse"> ▍</span>';
                if (
                    this.currentTask === 'analysis' &&
                    (!this.lastSave || Date.now() - this.lastSave > 1500)
                ) {
                    await this.db.set('resume_state', { task: 'analysis', text: data.text });
                    this.lastSave = Date.now();
                }
            }
        });
        this.workerMgr.on('done', (data) => this.finishGeneration(data.text));
        this.workerMgr.on('error', (data) => this.handleError(data.message));
    }

    // ============================================================
    // 生成共通フロー
    // ============================================================

    /**
     * 生成を開始する共通エントリ。
     * @param {string} task  - 'analysis' | 'today' | 'horoscope' | 'timeline' | 'chat'
     * @param {string} promptStr - 各コンポーネントから組み立て済みのプロンプト
     * @param {boolean} isJson - JSON出力期待か
     */
    async startGeneration(task, promptStr, isJson = false) {
        const cfg = await this.settings.getActiveAIConfig();
        if (!cfg) return alert('設定タブからAIモデルとAPIキーを設定してください。');

        // 設定画面で設定された任意の追加システムプロンプト + コア制約を結合
        const sysPrompt = cfg.prompt ? `【システム役割】\n${cfg.prompt}\n\n` : '';
        const coreConstraint = this.config.getCoreConstraint();
        const finalPrompt = sysPrompt + promptStr + '\n\n' + coreConstraint;

        this.isGenerating = true;
        this.currentTask = task;
        this.lastSave = 0;
        await this.requestWakeLock();
        document.getElementById('loading-overlay').classList.remove('hidden');
        await this.db.set('resume_state', { task: task, text: '', prompt: finalPrompt, isJson });

        this.workerMgr.generate({
            apiKey: cfg.apiKey,
            model: cfg.model,
            modelMeta: cfg.modelMeta,
            prompt: finalPrompt,
            isJson
        });
    }

    async finishGeneration(finalText) {
        this.isGenerating = false;
        document.getElementById('loading-overlay').classList.add('hidden');
        this.releaseWakeLock();
        try {
            if (this.currentTask === 'analysis') {
                document.getElementById('analysis-result').innerHTML = marked.parse(finalText);
                await this.db.set('analysis_result', finalText);
            } else if (this.currentTask === 'today') {
                document.getElementById('today-result').innerHTML = marked.parse(finalText);
            } else if (this.currentTask === 'chat') {
                await this.chat.add('model', finalText);
            } else if (this.currentTask === 'timeline') {
                await this.timeline.processResult(finalText);
            } else if (this.currentTask === 'horoscope') {
                await this.horoscope.pushHistory(finalText);
            }
            await this.db.set('resume_state', null);
        } catch (e) {
            this.handleError(e.message);
        }
    }

    handleError(msg) {
        this.isGenerating = false;
        document.getElementById('loading-overlay').classList.add('hidden');
        this.releaseWakeLock();
        alert('エラー発生: ' + msg);
    }

    // ============================================================
    // Wake Lock
    // ============================================================

    async requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
                document.getElementById('wake-lock-status').classList.remove('hidden');
            } catch (e) {
                /* 黙殺 */
            }
        }
    }

    releaseWakeLock() {
        if (this.wakeLock) {
            this.wakeLock.release().then(() => {
                this.wakeLock = null;
                document.getElementById('wake-lock-status').classList.add('hidden');
            });
        }
    }

    // ============================================================
    // ユーティリティ
    // ============================================================

    debounce(func, wait) {
        let t;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // ============================================================
    // 公開ショートカット（onclick属性から呼ばれるため互換維持）
    // ============================================================

    saveProfile(silent) { return this.profile.save(silent); }
    generateAnalysis() { return this.analysis.generate(); }
    resumeGeneration() { return this.analysis.resume(); }
    generateToday(type) { return this.today.generate(type); }
    generateHoroscope() { return this.horoscope.generate(); }
    generateTimeline() { return this.timeline.generate(); }
    handleChatSubmit(e) { return this.chat.handleSubmit(e); }
    saveSettings() { return this.settings.save(); }
    addCustomModel() { return this.settings.addCustomModel(); }
    exportData() { return this.settings.exportData(); }
    importData(e) { return this.settings.importData(e); }
    syncToFileSystem() { return this.settings.syncToFileSystem(); }
    clearAllData() { return this.settings.clearAll(); }
    loadTimeline() { return this.timeline.load(); }
    addChatMessage(role, text) { return this.chat.add(role, text); }
}

// ============================================================
// 起動
// ============================================================

window.addEventListener('DOMContentLoaded', () => {
    // Service Worker の登録（既存挙動踏襲）
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch((err) => console.error(err));
    }
    window.app = new AstroApp();
});
