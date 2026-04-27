/* ============================================================
 * AstroInsight - Config Loader
 * models.json / prompts.json を読み込み、
 * IndexedDBに保存されたカスタム設定とマージしてアプリに提供。
 * 要件: モデル定義・システムプロンプトはJSONで管理。
 * ============================================================ */

class ConfigLoader {
    /**
     * @param {AstroDB} db - IndexedDBラッパー
     * @param {Object} opts - { modelsPath, promptsPath }
     */
    constructor(db, opts = {}) {
        this.db = db;
        this.modelsPath = opts.modelsPath || './js/config/models.json';
        this.promptsPath = opts.promptsPath || './js/config/prompts.json';
        this.defaultModels = [];
        this.defaultPrompts = null;
        this.coreConstraint = '';
    }

    /** デフォルトJSONをfetch */
    async loadDefaults() {
        try {
            const [mRes, pRes] = await Promise.all([
                fetch(this.modelsPath, { cache: 'no-cache' }),
                fetch(this.promptsPath, { cache: 'no-cache' })
            ]);
            if (!mRes.ok) throw new Error('models.json fetch失敗: ' + mRes.status);
            if (!pRes.ok) throw new Error('prompts.json fetch失敗: ' + pRes.status);
            this.defaultModels = await mRes.json();
            this.defaultPrompts = await pRes.json();
            this.coreConstraint = this.defaultPrompts.core_constraint || '';
        } catch (e) {
            console.error('[ConfigLoader] デフォルト設定の読み込みに失敗:', e);
            // 最低限のフォールバック（オフライン等）
            this.defaultModels = [
                {
                    id: 'gemini-2.5-flash',
                    name: 'Gemini 2.5 Flash (推奨)',
                    provider: 'google',
                    endpoint:
                        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent',
                    streaming: 'sse',
                    recommended: true,
                    proxySupported: true
                }
            ];
            this.defaultPrompts = { prompts: {}, core_constraint: '' };
            this.coreConstraint = '';
        }
    }

    /**
     * カスタムモデル＋デフォルトモデル＋非表示フラグを統合した
     * 「使用可能モデル一覧」を返す。
     */
    async getMergedModels() {
        const customModels = (await this.db.get('custom_models')) || [];
        const hiddenIds = (await this.db.get('hidden_default_models')) || [];

        // デフォルトのうち非表示でないもの
        const visibleDefaults = this.defaultModels.filter((m) => !hiddenIds.includes(m.id));
        // カスタムを後ろに追加（同IDがあればカスタム優先）
        const customIds = new Set(customModels.map((m) => m.id));
        const merged = [
            ...visibleDefaults.filter((m) => !customIds.has(m.id)),
            ...customModels
        ];
        return merged;
    }

    /** 全モデル（非表示を含む）— 設定画面のデフォルト一覧表示用 */
    getAllDefaultModels() {
        return this.defaultModels.slice();
    }

    /** カスタムモデル追加 */
    async addCustomModel(model) {
        if (!model || !model.id || !model.name) throw new Error('モデルID・表示名は必須');
        const customModels = (await this.db.get('custom_models')) || [];
        const idx = customModels.findIndex((m) => m.id === model.id);
        if (idx >= 0) customModels[idx] = model;
        else customModels.push(model);
        await this.db.set('custom_models', customModels);
    }

    /** カスタムモデル削除 */
    async removeCustomModel(id) {
        const customModels = (await this.db.get('custom_models')) || [];
        const filtered = customModels.filter((m) => m.id !== id);
        await this.db.set('custom_models', filtered);
    }

    /** デフォルトモデルの非表示切り替え */
    async toggleDefaultHidden(id) {
        const hiddenIds = (await this.db.get('hidden_default_models')) || [];
        const i = hiddenIds.indexOf(id);
        if (i >= 0) hiddenIds.splice(i, 1);
        else hiddenIds.push(id);
        await this.db.set('hidden_default_models', hiddenIds);
        return hiddenIds.includes(id);
    }

    /**
     * 機能キー指定でシステムプロンプトを取得。
     * ユーザー設定が存在する場合はユーザー設定を優先、未設定の場合はデフォルトを使用。
     * @param {string} key - 例: 'prompt_natal'
     */
    async getPrompt(key) {
        const userPrompts = (await this.db.get('user_prompts')) || {};
        if (userPrompts[key] && userPrompts[key].trim()) return userPrompts[key];
        const def = this.defaultPrompts.prompts?.[key];
        return def?.default || '';
    }

    /** 全機能のデフォルトプロンプト一覧を返す */
    getAllPromptDefs() {
        return this.defaultPrompts.prompts || {};
    }

    /** ユーザープロンプトを保存 */
    async saveUserPrompt(key, value) {
        const userPrompts = (await this.db.get('user_prompts')) || {};
        userPrompts[key] = value;
        await this.db.set('user_prompts', userPrompts);
    }

    /** ユーザープロンプトをデフォルトに戻す */
    async resetUserPrompt(key) {
        const userPrompts = (await this.db.get('user_prompts')) || {};
        delete userPrompts[key];
        await this.db.set('user_prompts', userPrompts);
    }

    /** 全機能の現在のプロンプト（ユーザー or デフォルト）を返す */
    async getAllCurrentPrompts() {
        const result = {};
        const defs = this.getAllPromptDefs();
        for (const k of Object.keys(defs)) {
            result[k] = {
                label: defs[k].label,
                description: defs[k].description,
                value: await this.getPrompt(k),
                isCustom: !!(await this.db.get('user_prompts'))?.[k]
            };
        }
        return result;
    }

    /** モデルIDから完全な定義を取得 */
    async getModelById(id) {
        const merged = await this.getMergedModels();
        return merged.find((m) => m.id === id) || null;
    }

    /** 共通プロンプト制約 */
    getCoreConstraint() {
        return this.coreConstraint;
    }
}

window.ConfigLoader = ConfigLoader;
