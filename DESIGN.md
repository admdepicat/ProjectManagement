# ProjectFlow — プロジェクト議事録・タスク管理アプリ 設計書

## 概要

プロジェクトごとに議事録・タスク・経緯(タイムライン)を一元管理するWebアプリ。
音声ファイルをアップロードすると自動で文字起こし → 議事録生成 → タスク抽出まで行い、
手作業を最小化する。

## 技術スタック

| レイヤ | 技術 |
|---|---|
| フレームワーク | Next.js 15 (App Router, TypeScript) |
| UI | Tailwind CSS v3、日本語UI |
| DB | SQLite (better-sqlite3)、`data/app.db` |
| AI: 議事録要約・タスク抽出 | Claude API (`claude-opus-4-8`, structured outputs) |
| AI: 文字起こし | OpenAI Whisper API (`OPENAI_API_KEY` 設定時)。未設定時はテキスト貼り付けで代替 |

## データモデル (lib/db.ts)

```sql
projects:   id TEXT PK, name TEXT NOT NULL, description TEXT DEFAULT '',
            status TEXT DEFAULT 'active',  -- 'active' | 'archived'
            created_at TEXT, updated_at TEXT

meetings:   id TEXT PK, project_id TEXT FK, title TEXT, date TEXT,
            audio_filename TEXT NULL, transcript TEXT,
            summary_md TEXT,              -- 議事録本文 (Markdown)
            decisions TEXT,               -- JSON string[]
            open_questions TEXT,          -- JSON string[]
            created_at TEXT

tasks:      id TEXT PK, project_id TEXT FK, meeting_id TEXT NULL FK,
            title TEXT, description TEXT DEFAULT '',
            assignee TEXT DEFAULT '', due_date TEXT NULL,
            priority TEXT DEFAULT 'medium', -- 'high' | 'medium' | 'low'
            status TEXT DEFAULT 'todo',     -- 'todo' | 'in_progress' | 'done'
            source TEXT DEFAULT 'manual',   -- 'ai' | 'manual'
            created_at TEXT, updated_at TEXT

activities: id TEXT PK, project_id TEXT FK,
            type TEXT,   -- 'project_created'|'meeting_added'|'task_created'|'task_updated'|'note'|'digest'
            content TEXT, created_at TEXT
```

- id は `crypto.randomUUID()`。日時は ISO 8601 文字列。
- 外部キーは ON DELETE CASCADE(プロジェクト削除で配下も削除)。
- DB初期化は lib/db.ts のモジュールロード時に `CREATE TABLE IF NOT EXISTS`。

## API ルート (app/api/**)

| Method/Path | 説明 |
|---|---|
| GET/POST `/api/projects` | 一覧(タスク件数付き)/作成 |
| GET/PATCH/DELETE `/api/projects/[id]` | 詳細(meetings/tasks/activities同梱)/更新/削除 |
| POST `/api/projects/[id]/meetings` | **中核**。multipart/form-data: `audio`(File, 任意) or `transcript`(string), `title`(任意), `date`(任意)。処理: 音声あれば transcribe() → extractMinutes() → meetings 挿入 → 抽出タスクを tasks に一括挿入(source='ai') → activities に meeting_added + task_created 記録。同期実行(数十秒〜数分かかる)。 |
| GET/DELETE `/api/meetings/[id]` | 議事録詳細/削除 |
| GET/POST `/api/tasks` | クエリ: projectId, status。作成は source='manual' |
| PATCH/DELETE `/api/tasks/[id]` | ステータス変更時は activities に task_updated 記録 |
| POST `/api/projects/[id]/digest` | generateDigest() で「現状整理」を生成し activities(type='digest') に保存して返す |
| GET `/api/dashboard` | 全プロジェクト横断: 期限切れ/今週期限/高優先度の未完了タスク、プロジェクトごとの未完了数 |

エラーは `{ error: string }` + 適切なHTTPステータス。route handler には
`export const maxDuration = 300;` を付与(AI処理が長いルートのみ)。

## AI 連携 (lib/ai/* — 実装済み、変更しないこと)

- `lib/ai/transcribe.ts` — `transcribeAudio(buffer, filename)`: Whisper API。キー未設定時は例外(呼び出し側で 400 を返す)
- `lib/ai/extract.ts` — `extractMinutes(transcript, projectName, projectDescription, today)`: Claude structured outputs で `MinutesExtraction` を返す
- `lib/ai/digest.ts` — `generateDigest(project, openTasks, recentActivities, recentMeetings)`: 現状整理テキスト(Markdown)を返す

型は `lib/types.ts` を唯一の正とする。

## 画面 (app/**, components/**) — 日本語UI

| パス | 内容 |
|---|---|
| `/` | ダッシュボード:「今やること」(期限切れ→赤、今週→黄、高優先度)、プロジェクトカード一覧、プロジェクト作成 |
| `/projects/[id]` | プロジェクト詳細。タブ: 概要(現状整理ボタン+最新digest表示) / 議事録一覧 / タスク(かんばん: todo/進行中/完了、ドラッグ不要・ボタンで状態遷移可) / 経緯(activitiesタイムライン) |
| `/projects/[id]/meetings/new` | 議事録作成: 音声ファイルD&D or テキスト貼り付け。処理中はスピナー+進捗メッセージ |
| `/projects/[id]/meetings/[meetingId]` | 議事録詳細: 要約、決定事項、未解決事項、抽出タスク一覧、文字起こし全文(折りたたみ) |

- クライアントコンポーネントから fetch で API を叩く構成(SWR等は不要、素の fetch + useState で良い)
- 見た目: シンプルで実用的。sidebar+main レイアウト。優先度バッジ、ステータスバッジは色分け。

## 環境変数 (.env.example)

```
ANTHROPIC_API_KEY=   # 必須: 議事録生成・タスク抽出
OPENAI_API_KEY=      # 任意: 音声文字起こし (Whisper)。未設定時はテキスト入力のみ
```

## 実行

```
npm install
npm run dev   # http://localhost:3000
```
