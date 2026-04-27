# AstroInsight - コンポーネント分割版

AI占星術＆自己分析モバイルWebアプリ（PWA）。
既存の単一HTMLファイル実装をコンポーネントごとに分割し、AIモデル定義・システムプロンプトをJSONで管理できるようにリファクタリングしたものです。

---

## 1. 主な変更点

### 1.1 AIモデル名の更新（2026年4月時点の最新へ）

| 旧モデル | 新モデル | プロバイダー |
|---|---|---|
| `gemini-2.5-flash` | `gemini-2.5-flash`（変わらず・推奨） | Google |
| `claude-3-haiku-20240307`（2026/4/19廃止） | `claude-haiku-4-5` | Anthropic |
| `gpt-4o-mini`（レガシー） | `gpt-5.4-mini` | OpenAI |
| `grok-beta`（レガシー） | `grok-4-1-fast-non-reasoning` | xAI |

加えて、`claude-sonnet-4-6` / `claude-opus-4-7` / `gpt-5.5` / `grok-4.20` / `gemini-3-flash-preview` も選択肢として用意。

### 1.2 コンポーネント分割

```
astro-insight/
├── index.html                       # メインHTML（UI構造のみ・既存と同等）
├── sw.js                            # Service Worker（PWA）
├── css/
│   └── styles.css                   # 既存のカスタムCSSを分離
└── js/
    ├── config/
    │   ├── models.json              # ★ AIモデル定義（要件 §4）
    │   └── prompts.json             # ★ 機能別システムプロンプト（要件 §6）
    ├── workers/
    │   └── ai-worker.js             # AI生成 Web Worker（SSEパース）
    ├── core/
    │   ├── db.js                    # IndexedDBラッパー（要件 §19）
    │   ├── config-loader.js         # JSON読み込み＋ユーザー設定マージ
    │   └── ai-worker-manager.js     # Worker通信管理
    ├── components/
    │   ├── ui-controller.js         # タブ切替・チャットバブル等
    │   ├── profile.js               # プロフィール
    │   ├── analysis.js              # 自己分析（中断/再開対応）
    │   ├── today.js                 # 今日の星
    │   ├── horoscope.js             # 詳細分析（履歴）
    │   ├── timeline.js              # 予報（4粒度・チャート）
    │   ├── chat.js                  # AIチャット
    │   └── settings.js              # 設定（モデル・プロンプト・データ）
    └── app.js                       # メインアプリ（コンポーネント統合）
```

### 1.3 システムプロンプトのJSON管理

`js/config/prompts.json` で、要件 §6 で定義された機能ごとのシステムプロンプトを管理：

| 機能キー | 対象 |
|---|---|
| `prompt_natal` | ネイタル分析 |
| `prompt_today` | 今日・今週・今月のトランジット |
| `prompt_forecast` | 予報（タイムライン） |
| `prompt_compat` | 相性分析（将来用・スタブ） |
| `prompt_chat` | チャット |
| `prompt_detail` | 詳細画面のトランジット解説 |

設定画面の「機能ごとのシステムプロンプト」エリアで、各機能のプロンプトを個別に編集できます（ユーザー設定が優先、空の場合はデフォルト）。

### 1.4 既存機能の保持

以下の既存機能はすべて保持しています：

- プロフィール入力（自動保存・debounce）
- 自己分析（中断・再開機能付き）
- 今日・今週の星
- 詳細分析（履歴管理）
- 予報（月次/週次/日次/時間 の4粒度・Chart.jsグラフ・カードカルーセル）
- AIチャット（履歴・Markdown表示）
- 設定（AIモデル選択・APIキー・共通システムプロンプト）
- データ管理（バックアップDL/復元/ローカルファイル保存/全削除）
- Service Worker（PWA・オフラインキャッシュ）
- Web Worker（マルチプロバイダーSSEストリーミング）
- Wake Lock（生成中スリープ防止）
- IndexedDB永続化

加えて、要件定義書から以下も取り込みました：

- カスタムモデルの追加・削除（設定画面）
- デフォルトモデルの非表示切替
- 機能ごとのシステムプロンプト個別編集

---

## 2. 起動方法

このアプリはローカルJSONファイル（`models.json` / `prompts.json`）をfetchで読み込むため、**HTTPサーバー経由での起動が必要**です（`file://` プロトコル直開きでは fetch がブロックされます）。

### Pythonで起動

```bash
cd astro-insight
python3 -m http.server 8000
# ブラウザで http://localhost:8000/ を開く
```

### Node.jsで起動

```bash
cd astro-insight
npx serve -p 8000
```

### VSCode

「Live Server」拡張機能で `index.html` を右クリック→「Open with Live Server」。

---

## 3. 使い方

1. **プロフィール**タブで名前・生年月日・出生地を入力
2. **設定**タブでAIモデルを選択し、APIキーを入力して保存
3. **分析**タブで「生成・更新」を押して自己分析を生成
4. **今日の星**タブで今日/今週の運勢を生成
5. **詳細**タブで指定日時のトランジット分析
6. **予報**タブで未来予測（4粒度切替）
7. **チャット**タブでAIに自由質問

---

## 4. APIキーの取得先

| プロバイダー | コンソール |
|---|---|
| Google (Gemini) | https://aistudio.google.com/apikey |
| Anthropic (Claude) | https://console.anthropic.com/ |
| OpenAI (GPT) | https://platform.openai.com/api-keys |
| xAI (Grok) | https://console.x.ai/ |

---

## 5. 注意事項

- **ブラウザから直接APIを叩く構成**のため、開発・個人利用以外では Cloudflare Workers などのプロキシ経由を推奨します（要件定義書 §5）。
- Anthropic API は通常CORSをブロックするため、`anthropic-dangerously-allow-browser: true` ヘッダで開発用に許可しています。本番ではプロキシ必須。
- データはすべて端末のIndexedDBに保存されます。ブラウザのデータを消すと消失するので、定期的に「バックアップをDL」を推奨。
