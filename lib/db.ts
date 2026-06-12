// SQLite データアクセス層。
// better-sqlite3 を用いた単一DBハンドル + 型付きヘルパー。
// 開発時のホットリロードで複数ハンドルが開かないよう globalThis にキャッシュする。

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  Project,
  ProjectWithCounts,
  ProjectDetail,
  Meeting,
  Task,
  Activity,
  TaskPriority,
  TaskStatus,
  ProjectStatus,
  ActivityType,
  ExtractedTask,
} from "./types";

// ---- シングルトン ----

const globalForDb = globalThis as unknown as {
  __pmDb?: Database.Database;
};

function createDb(): Database.Database {
  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "app.db");

  const database = new Database(dbPath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'active',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id             TEXT PRIMARY KEY,
      project_id     TEXT NOT NULL,
      title          TEXT NOT NULL DEFAULT '',
      date           TEXT NOT NULL,
      audio_filename TEXT,
      transcript     TEXT NOT NULL DEFAULT '',
      summary_md     TEXT NOT NULL DEFAULT '',
      decisions      TEXT NOT NULL DEFAULT '[]',
      open_questions TEXT NOT NULL DEFAULT '[]',
      created_at     TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL,
      meeting_id  TEXT,
      title       TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      assignee    TEXT NOT NULL DEFAULT '',
      due_date    TEXT,
      priority    TEXT NOT NULL DEFAULT 'medium',
      status      TEXT NOT NULL DEFAULT 'todo',
      source      TEXT NOT NULL DEFAULT 'manual',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activities (
      id         TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      type       TEXT NOT NULL,
      content    TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  return database;
}

export const db: Database.Database = globalForDb.__pmDb ?? createDb();
if (process.env.NODE_ENV !== "production") {
  globalForDb.__pmDb = db;
}

// ---- ユーティリティ ----

const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

// DB行 → API型 への変換 (JSON文字列 → 配列 など)

interface MeetingRow {
  id: string;
  project_id: string;
  title: string;
  date: string;
  audio_filename: string | null;
  transcript: string;
  summary_md: string;
  decisions: string;
  open_questions: string;
  created_at: string;
}

function rowToMeeting(row: MeetingRow): Meeting {
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    date: row.date,
    audio_filename: row.audio_filename,
    transcript: row.transcript,
    summary_md: row.summary_md,
    decisions: safeParseArray(row.decisions),
    open_questions: safeParseArray(row.open_questions),
    created_at: row.created_at,
  };
}

function safeParseArray(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

// ---- Projects ----

export function listProjects(): ProjectWithCounts[] {
  const rows = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status != 'done') AS open_task_count,
        (SELECT COUNT(*) FROM meetings m WHERE m.project_id = p.id) AS meeting_count
       FROM projects p
       ORDER BY p.created_at DESC`
    )
    .all() as ProjectWithCounts[];
  return rows;
}

export function listActiveProjectsWithCounts(): ProjectWithCounts[] {
  const rows = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status != 'done') AS open_task_count,
        (SELECT COUNT(*) FROM meetings m WHERE m.project_id = p.id) AS meeting_count
       FROM projects p
       WHERE p.status = 'active'
       ORDER BY p.created_at DESC`
    )
    .all() as ProjectWithCounts[];
  return rows;
}

export function getProject(id: string): Project | undefined {
  return db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as
    | Project
    | undefined;
}

export function getProjectDetail(id: string): ProjectDetail | undefined {
  const project = getProject(id);
  if (!project) return undefined;

  const meetingRows = db
    .prepare(
      `SELECT * FROM meetings WHERE project_id = ? ORDER BY date DESC, created_at DESC`
    )
    .all(id) as MeetingRow[];
  const tasks = db
    .prepare(`SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC`)
    .all(id) as Task[];
  const activities = db
    .prepare(
      `SELECT * FROM activities WHERE project_id = ? ORDER BY created_at DESC`
    )
    .all(id) as Activity[];

  return {
    ...project,
    meetings: meetingRows.map(rowToMeeting),
    tasks,
    activities,
  };
}

export function createProject(name: string, description = ""): Project {
  const ts = now();
  const project: Project = {
    id: randomUUID(),
    name,
    description: description ?? "",
    status: "active",
    created_at: ts,
    updated_at: ts,
  };
  db.prepare(
    `INSERT INTO projects (id, name, description, status, created_at, updated_at)
     VALUES (@id, @name, @description, @status, @created_at, @updated_at)`
  ).run(project);
  return project;
}

export function updateProject(
  id: string,
  patch: { name?: string; description?: string; status?: ProjectStatus }
): Project | undefined {
  const existing = getProject(id);
  if (!existing) return undefined;
  const updated: Project = {
    ...existing,
    name: patch.name ?? existing.name,
    description: patch.description ?? existing.description,
    status: patch.status ?? existing.status,
    updated_at: now(),
  };
  db.prepare(
    `UPDATE projects SET name = @name, description = @description, status = @status, updated_at = @updated_at WHERE id = @id`
  ).run(updated);
  return updated;
}

export function deleteProject(id: string): boolean {
  const res = db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  return res.changes > 0;
}

// ---- Meetings ----

export function insertMeeting(input: {
  project_id: string;
  title: string;
  date: string;
  audio_filename: string | null;
  transcript: string;
  summary_md: string;
  decisions: string[];
  open_questions: string[];
}): Meeting {
  const meeting: Meeting = {
    id: randomUUID(),
    project_id: input.project_id,
    title: input.title,
    date: input.date,
    audio_filename: input.audio_filename,
    transcript: input.transcript,
    summary_md: input.summary_md,
    decisions: input.decisions,
    open_questions: input.open_questions,
    created_at: now(),
  };
  db.prepare(
    `INSERT INTO meetings
      (id, project_id, title, date, audio_filename, transcript, summary_md, decisions, open_questions, created_at)
     VALUES
      (@id, @project_id, @title, @date, @audio_filename, @transcript, @summary_md, @decisions, @open_questions, @created_at)`
  ).run({
    ...meeting,
    decisions: JSON.stringify(meeting.decisions),
    open_questions: JSON.stringify(meeting.open_questions),
  });
  return meeting;
}

export function getMeeting(id: string): Meeting | undefined {
  const row = db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(id) as
    | MeetingRow
    | undefined;
  return row ? rowToMeeting(row) : undefined;
}

export function deleteMeeting(id: string): boolean {
  const res = db.prepare(`DELETE FROM meetings WHERE id = ?`).run(id);
  return res.changes > 0;
}

// ---- Tasks ----

export function listTasks(filter: {
  projectId?: string;
  status?: TaskStatus;
}): Task[] {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.projectId) {
    conditions.push("project_id = ?");
    params.push(filter.projectId);
  }
  if (filter.status) {
    conditions.push("status = ?");
    params.push(filter.status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return db
    .prepare(`SELECT * FROM tasks ${where} ORDER BY created_at DESC`)
    .all(...params) as Task[];
}

export function listTasksByMeeting(meetingId: string): Task[] {
  return db
    .prepare(
      `SELECT * FROM tasks WHERE meeting_id = ? ORDER BY created_at ASC`
    )
    .all(meetingId) as Task[];
}

export function getTask(id: string): Task | undefined {
  return db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as
    | Task
    | undefined;
}

export function insertTask(input: {
  project_id: string;
  meeting_id: string | null;
  title: string;
  description?: string;
  assignee?: string;
  due_date?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  source: "ai" | "manual";
}): Task {
  const ts = now();
  const task: Task = {
    id: randomUUID(),
    project_id: input.project_id,
    meeting_id: input.meeting_id,
    title: input.title,
    description: input.description ?? "",
    assignee: input.assignee ?? "",
    due_date: input.due_date ?? null,
    priority: input.priority ?? "medium",
    status: input.status ?? "todo",
    source: input.source,
    created_at: ts,
    updated_at: ts,
  };
  db.prepare(
    `INSERT INTO tasks
      (id, project_id, meeting_id, title, description, assignee, due_date, priority, status, source, created_at, updated_at)
     VALUES
      (@id, @project_id, @meeting_id, @title, @description, @assignee, @due_date, @priority, @status, @source, @created_at, @updated_at)`
  ).run(task);
  return task;
}

export function insertExtractedTask(
  projectId: string,
  meetingId: string,
  t: ExtractedTask
): Task {
  return insertTask({
    project_id: projectId,
    meeting_id: meetingId,
    title: t.title,
    description: t.description,
    assignee: t.assignee,
    due_date: t.due_date,
    priority: t.priority,
    status: "todo",
    source: "ai",
  });
}

export function updateTask(
  id: string,
  patch: {
    title?: string;
    description?: string;
    assignee?: string;
    due_date?: string | null;
    priority?: TaskPriority;
    status?: TaskStatus;
  }
): Task | undefined {
  const existing = getTask(id);
  if (!existing) return undefined;
  const updated: Task = {
    ...existing,
    title: patch.title ?? existing.title,
    description: patch.description ?? existing.description,
    assignee: patch.assignee ?? existing.assignee,
    due_date: patch.due_date !== undefined ? patch.due_date : existing.due_date,
    priority: patch.priority ?? existing.priority,
    status: patch.status ?? existing.status,
    updated_at: now(),
  };
  db.prepare(
    `UPDATE tasks SET
      title = @title, description = @description, assignee = @assignee,
      due_date = @due_date, priority = @priority, status = @status, updated_at = @updated_at
     WHERE id = @id`
  ).run(updated);
  return updated;
}

export function deleteTask(id: string): boolean {
  const res = db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
  return res.changes > 0;
}

// ---- Activities ----

export function insertActivity(
  projectId: string,
  type: ActivityType,
  content: string
): Activity {
  const activity: Activity = {
    id: randomUUID(),
    project_id: projectId,
    type,
    content,
    created_at: now(),
  };
  db.prepare(
    `INSERT INTO activities (id, project_id, type, content, created_at)
     VALUES (@id, @project_id, @type, @content, @created_at)`
  ).run(activity);
  return activity;
}

export function listActivities(
  projectId: string,
  limit?: number
): Activity[] {
  const base = `SELECT * FROM activities WHERE project_id = ? ORDER BY created_at DESC`;
  if (limit !== undefined) {
    return db.prepare(`${base} LIMIT ?`).all(projectId, limit) as Activity[];
  }
  return db.prepare(base).all(projectId) as Activity[];
}

// ---- Meetings (recent, for digest) ----

export function listRecentMeetings(projectId: string, limit: number): Meeting[] {
  const rows = db
    .prepare(
      `SELECT * FROM meetings WHERE project_id = ? ORDER BY date DESC, created_at DESC LIMIT ?`
    )
    .all(projectId, limit) as MeetingRow[];
  return rows.map(rowToMeeting);
}

export function listOpenTasks(projectId: string): Task[] {
  return db
    .prepare(
      `SELECT * FROM tasks WHERE project_id = ? AND status != 'done' ORDER BY created_at DESC`
    )
    .all(projectId) as Task[];
}

// ---- Dashboard ----

function sortByDueDateAsc(a: Task, b: Task): number {
  if (a.due_date === b.due_date) return 0;
  if (!a.due_date) return 1; // nulls last
  if (!b.due_date) return -1;
  return a.due_date < b.due_date ? -1 : 1;
}

export function getDashboardData() {
  const t = today();
  const week = new Date();
  week.setDate(week.getDate() + 7);
  const weekStr = week.toISOString().slice(0, 10);

  const openTasks = db
    .prepare(`SELECT * FROM tasks WHERE status != 'done'`)
    .all() as Task[];

  const overdue = openTasks
    .filter((task) => task.due_date !== null && task.due_date < t)
    .sort(sortByDueDateAsc);

  const dueThisWeek = openTasks
    .filter(
      (task) =>
        task.due_date !== null && task.due_date >= t && task.due_date <= weekStr
    )
    .sort(sortByDueDateAsc);

  const overdueIds = new Set(overdue.map((x) => x.id));
  const weekIds = new Set(dueThisWeek.map((x) => x.id));

  const highPriority = openTasks
    .filter(
      (task) =>
        task.priority === "high" &&
        !overdueIds.has(task.id) &&
        !weekIds.has(task.id)
    )
    .sort(sortByDueDateAsc);

  return {
    overdue,
    due_this_week: dueThisWeek,
    high_priority: highPriority,
    projects: listActiveProjectsWithCounts(),
  };
}

export { today, now };
