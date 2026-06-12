# ProjectFlow GAS版 設計書

Google スプレッドシートを DB、Google Drive を音声ファイル置き場とし、
Google Apps Script の Web アプリとして動作する ProjectFlow。
機能仕様は ../DESIGN.md と同等(議事録自動生成・タスク自動抽出・ダッシュボード・経緯・現状整理)。

## 構成ファイル

| ファイル | 役割 | 担当 |
|---|---|---|
| `appsscript.json` | マニフェスト (スコープ、webapp 設定) | 済 |
| `Main.gs` | `doGet` (HTML 配信)、`include()` ヘルパー | 済 |
| `Ai.gs` | Claude API (UrlFetchApp raw HTTP + structured outputs)、Whisper 文字起こし | 済・変更禁止 |
| `Db.gs` | シート初期化 + データアクセス層 | backend |
| `Api.gs` | `google.script.run` から呼ぶ公開サーバー関数 | backend |
| `index.html` | SPA 本体 (マークアップ + クライアントJS) | frontend |
| `styles.html` | CSS (`<style>` ブロック、include で挿入) | frontend |

## データモデル (スプレッドシート)

コンテナバインドされたスプレッドシートに4シート。1行目はヘッダー固定。
全セル値は文字列として保存(日時は ISO 8601、配列は JSON 文字列)。

```
projects   : id | name | description | status | created_at | updated_at
meetings   : id | project_id | title | date | audio_file_id | audio_filename |
             transcript | summary_md | decisions | open_questions | created_at
tasks      : id | project_id | meeting_id | title | description | assignee |
             due_date | priority | status | source | created_at | updated_at
activities : id | project_id | type | content | created_at
```

- 値の語彙は Next.js 版 (../lib/types.ts) と同一:
  status: active/archived, priority: high/medium/low,
  task status: todo/in_progress/done, source: ai/manual,
  activity type: project_created/meeting_added/task_created/task_updated/note/digest
- id は `Utilities.getUuid()`
- API 境界(クライアントへ返す形)では decisions / open_questions は string[] に parse する
- 書き込みは `LockService.getScriptLock()` で直列化(tryLock 30秒)
- シートが無ければ `ensureSheets_()` で自動作成(doGet 時と各書き込み時に呼ぶ)

## Drive

- `getOrCreateAudioFolder_()`: マイドライブ直下に `ProjectFlow_Audio` フォルダを取得/作成
- 音声はそこに保存し、meeting 行には file ID と元ファイル名を記録

## サーバー API (Api.gs — google.script.run から呼ばれる公開関数)

すべて JSON シリアライズ可能なプレーンオブジェクトを返す。エラーは
`throw new Error('日本語メッセージ')` — クライアントは withFailureHandler で受ける。

| 関数 | 内容 |
|---|---|
| `apiGetDashboard()` | `{overdue, due_this_week, high_priority, projects}` — ../lib/types.ts の DashboardData と同形。projects は active のみ + open_task_count/meeting_count 付き |
| `apiCreateProject(name, description)` | Project を返す。activities に project_created 記録 |
| `apiGetProjectDetail(projectId)` | Project + meetings(date降順) + tasks + activities(created_at降順) |
| `apiUpdateProject(projectId, patch)` | name/description/status の部分更新 |
| `apiDeleteProject(projectId)` | 配下の meetings/tasks/activities も削除(カスケード) |
| `apiTranscribeAudio(projectId, base64Data, filename, mimeType)` | base64→Blob→Drive保存→`aiTranscribe_()`。`{transcript, audio_file_id, audio_filename}` を返す。**ステップ分割**: 6分制限対策で文字起こしと議事録生成は別呼び出し |
| `apiCreateMeeting(payload)` | payload: `{projectId, title, date, transcript, audioFileId, audioFilename}`。`aiExtractMinutes_()` → meeting 行追加 → 抽出タスクを tasks に追加(source='ai') → activities に meeting_added(progress_note 連結)+ task_created(n件) 記録。`{meeting, tasks}` を返す |
| `apiGetMeeting(meetingId)` | `{meeting, tasks}` (meeting_id 一致のタスク) |
| `apiDeleteMeeting(meetingId)` | meeting 行 + 関連タスク削除。Drive の音声は残す |
| `apiCreateTask(payload)` | `{projectId, title, description, assignee, dueDate, priority}` → source='manual'、activities 記録 |
| `apiUpdateTask(taskId, patch)` | status 変更時は activities に task_updated 記録(未着手/進行中/完了 ラベル) |
| `apiDeleteTask(taskId)` | |
| `apiGenerateDigest(projectId)` | 未完了タスク+直近20 activities+直近5 meetings → `aiGenerateDigest_()` → activities(type='digest') 保存 → `{digest, activity}` |

ダッシュボードの分類ロジックは Next.js 版と同じ:
overdue = due_date < today、due_this_week = today..+7日、
high_priority = priority=='high' かつ前2グループ未含・未完了。due_date 昇順(null 末尾)。

## クライアント (index.html)

ハッシュルーティングの SPA (vanilla JS、ビルドなし、外部ライブラリなし):

- `#/` ダッシュボード: 「今やること」3グループ(期限切れ=赤/今週=黄/高優先度=青)、プロジェクトカード一覧、新規プロジェクト作成フォーム
- `#/project/{id}` プロジェクト詳細: タブ = 概要(現状整理ボタン+最新digest)/ 議事録一覧 / タスクかんばん(3列、←→ボタンで状態遷移、＋タスク追加)/ 経緯タイムライン
- `#/project/{id}/new-meeting` 議事録作成: 音声ファイル選択(input type=file, accept="audio/*") or テキスト貼り付けのトグル。音声は FileReader で base64 化し、**2段階呼び出し**: ①apiTranscribeAudio(進捗:「文字起こし中…」) → ②apiCreateMeeting(進捗:「議事録を生成中…」)。エラーは赤いアラート表示
- `#/meeting/{id}` 議事録詳細: 要約(簡易Markdown描画)、決定事項、未解決事項、抽出タスク、文字起こし全文(details折りたたみ)、削除

注意点:
- `google.script.run.withSuccessHandler(fn).withFailureHandler(fn).apiXxx(...)` パターン
- 音声ファイルは 20MB 超なら送信前に警告して中止(google.script.run のペイロード制限と Whisper の 25MB 制限のため)
- 簡易 Markdown 描画(##/###見出し、- 箇条書き、**太字**)は textContent ベースで XSS 安全に
- UI は日本語。CSS は styles.html に素の CSS で(フレームワークなし)。Next.js 版と同様のライト系デザイン

## セットアップ (gas/README.md に記載)

1. Google スプレッドシートを新規作成 → 拡張機能 → Apps Script
2. 本ディレクトリのファイルを作成(.gs はスクリプトファイル、.html は HTML ファイル)
   - appsscript.json はプロジェクト設定で「マニフェストを表示」を有効にして貼り付け
3. プロジェクト設定 → スクリプト プロパティ:
   - `ANTHROPIC_API_KEY` (必須)
   - `OPENAI_API_KEY` (音声文字起こしを使う場合のみ)
4. デプロイ → 新しいデプロイ → ウェブアプリ(自分として実行 / アクセス: 自分のみ 等)

## GAS 制約への対応

- 1実行 6分制限 → 文字起こしと議事録生成を別 RPC に分割
- UrlFetchApp タイムアウト → Claude 呼び出しは effort=medium・max_tokens 8000 で応答時間を抑制 (Ai.gs 実装済み)
- 同時書き込み → LockService
