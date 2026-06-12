// 共有型定義 — DB行・API・AI抽出結果の唯一の正
// バックエンド/フロントエンドはこのファイルの型をimportして使うこと。

export type ProjectStatus = "active" | "archived";
export type TaskPriority = "high" | "medium" | "low";
export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskSource = "ai" | "manual";
export type ActivityType =
  | "project_created"
  | "meeting_added"
  | "task_created"
  | "task_updated"
  | "note"
  | "digest";

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface Meeting {
  id: string;
  project_id: string;
  title: string;
  date: string; // ISO date (YYYY-MM-DD)
  audio_filename: string | null;
  transcript: string;
  summary_md: string;
  decisions: string[]; // DBではJSON文字列、API境界では配列
  open_questions: string[];
  created_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  meeting_id: string | null;
  title: string;
  description: string;
  assignee: string;
  due_date: string | null; // YYYY-MM-DD
  priority: TaskPriority;
  status: TaskStatus;
  source: TaskSource;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  project_id: string;
  type: ActivityType;
  content: string;
  created_at: string;
}

// ---- AI抽出結果 (lib/ai/extract.ts が返す) ----

export interface ExtractedTask {
  title: string;
  description: string;
  assignee: string; // 不明なら ""
  due_date: string | null; // YYYY-MM-DD or null
  priority: TaskPriority;
}

export interface MinutesExtraction {
  title: string; // 会議タイトル(ユーザー未指定時に使用)
  summary_md: string; // 議事録本文 Markdown
  decisions: string[];
  open_questions: string[];
  tasks: ExtractedTask[];
  progress_note: string; // 経緯タイムライン用の1〜2文の進捗メモ
}

// ---- API レスポンス ----

export interface ProjectWithCounts extends Project {
  open_task_count: number;
  meeting_count: number;
}

export interface ProjectDetail extends Project {
  meetings: Meeting[];
  tasks: Task[];
  activities: Activity[];
}

export interface DashboardData {
  overdue: Task[]; // 期限切れ未完了
  due_this_week: Task[]; // 7日以内期限の未完了
  high_priority: Task[]; // 高優先度の未完了(上2つと重複除外)
  projects: ProjectWithCounts[];
}
