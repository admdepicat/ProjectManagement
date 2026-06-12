# ProjectFlow

プロジェクトごとに議事録・タスク・経緯を一元管理するWebアプリ。
会議の音声ファイルをアップロードするだけで、**文字起こし → 議事録生成 → タスク自動登録** まで自動で行います。

## 主な機能

- **議事録の自動生成** — 音声ファイル(または文字起こしテキストの貼り付け)から、Claude が構造化された議事録(要約・決定事項・未解決事項)を生成
- **タスクの自動抽出** — 会議中のアクションアイテムを担当者・期限・優先度付きで自動登録(「来週金曜まで」等の相対表現も日付に解決)
- **今やることダッシュボード** — 全プロジェクト横断で期限切れ・今週期限・高優先度タスクを一覧
- **経緯タイムライン** — プロジェクトがどういう流れで進んできたかを自動記録
- **現状整理(AIダイジェスト)** — ボタン一つで「現在地・今やるべきこと・リスク」を Claude が整理

## セットアップ

```bash
npm install
cp .env.example .env.local   # APIキーを設定
npm run dev                  # http://localhost:3000
```

### 環境変数

| 変数 | 必須 | 用途 |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | 議事録生成・タスク抽出・現状整理 (Claude API, `claude-opus-4-8`) |
| `OPENAI_API_KEY` | 任意 | 音声ファイルの文字起こし (Whisper)。未設定でもテキスト貼り付けで全機能利用可 |

## 技術構成

- Next.js 15 (App Router) / TypeScript / Tailwind CSS
- SQLite (better-sqlite3) — `data/app.db` に自動作成
- Claude API structured outputs によるタスク・議事録の構造化抽出

設計の詳細は [DESIGN.md](./DESIGN.md) を参照。
