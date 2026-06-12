"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type {
  ProjectDetail,
  Task,
  Meeting,
  Activity,
  TaskStatus,
  TaskPriority,
  ActivityType,
} from "@/lib/types";
import PriorityBadge from "@/components/PriorityBadge";
import StatusBadge from "@/components/StatusBadge";
import Spinner from "@/components/Spinner";
import Markdown from "@/components/Markdown";

// ---- helpers ----

type Tab = "overview" | "meetings" | "tasks" | "activities";

function formatDate(d: string | null | undefined): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${y}/${m}/${day}`;
}

function isOverdue(due: string | null): boolean {
  if (!due) return false;
  return new Date(due) < new Date(new Date().toISOString().slice(0, 10));
}

// ---- Overview tab ----

function OverviewTab({
  project,
  onDigestCreated,
}: {
  project: ProjectDetail;
  onDigestCreated: () => void;
}) {
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestError, setDigestError] = useState("");

  const latestDigest = project.activities
    .filter((a) => a.type === "digest")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  const openTasks = project.tasks.filter(
    (t) => t.status === "todo" || t.status === "in_progress"
  );

  async function handleDigest() {
    setDigestLoading(true);
    setDigestError("");
    try {
      const res = await fetch(`/api/projects/${project.id}/digest`, {
        method: "POST",
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "生成に失敗しました");
      }
      onDigestCreated();
    } catch (err) {
      setDigestError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setDigestLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-indigo-600">{openTasks.length}</p>
          <p className="text-xs text-gray-500 mt-1">未完了タスク</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-700">{project.meetings.length}</p>
          <p className="text-xs text-gray-500 mt-1">議事録</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-700">{project.tasks.length}</p>
          <p className="text-xs text-gray-500 mt-1">全タスク</p>
        </div>
      </div>

      {/* Digest section */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">現状整理</h3>
          <button
            onClick={handleDigest}
            disabled={digestLoading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {digestLoading ? (
              <>
                <Spinner size="sm" />
                Claudeが現状を整理しています…
              </>
            ) : (
              "現状を整理する"
            )}
          </button>
        </div>

        {digestError && (
          <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">
            <p className="text-sm text-red-700">{digestError}</p>
          </div>
        )}

        {latestDigest ? (
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-400 mb-3">
              最終更新: {new Date(latestDigest.created_at).toLocaleString("ja-JP")}
            </p>
            <Markdown content={latestDigest.content} />
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            まだ現状整理はありません。「現状を整理する」ボタンで生成できます。
          </p>
        )}
      </div>
    </div>
  );
}

// ---- Meetings tab ----

function MeetingsTab({
  project,
}: {
  project: ProjectDetail;
}) {
  const sorted = [...project.meetings].sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  return (
    <div className="space-y-3">
      {sorted.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl px-6 py-10 text-center text-gray-400">
          議事録がありません。
          <br />
          <Link
            href={`/projects/${project.id}/meetings/new`}
            className="text-indigo-600 hover:underline mt-2 inline-block"
          >
            + 議事録を追加
          </Link>
        </div>
      ) : (
        sorted.map((m) => (
          <MeetingRow key={m.id} meeting={m} projectId={project.id} />
        ))
      )}
    </div>
  );
}

function MeetingRow({
  meeting,
  projectId,
}: {
  meeting: Meeting;
  projectId: string;
}) {
  return (
    <Link
      href={`/projects/${projectId}/meetings/${meeting.id}`}
      className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-5 py-4 hover:border-indigo-300 hover:shadow-sm transition-all group"
    >
      <div className="flex-shrink-0 text-center">
        <p className="text-xs text-gray-400">{formatDate(meeting.date)}</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
          {meeting.title || "（無題）"}
        </p>
        {meeting.decisions.length > 0 && (
          <p className="text-xs text-gray-500 mt-0.5">
            決定事項 {meeting.decisions.length}件
          </p>
        )}
      </div>
      {meeting.audio_filename && (
        <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full flex-shrink-0">
          🎙️ 音声
        </span>
      )}
    </Link>
  );
}

// ---- Tasks kanban ----

const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: "todo", label: "未着手", color: "bg-gray-50 border-gray-200" },
  { status: "in_progress", label: "進行中", color: "bg-amber-50 border-amber-200" },
  { status: "done", label: "完了", color: "bg-green-50 border-green-200" },
];

const STATUS_SEQUENCE: TaskStatus[] = ["todo", "in_progress", "done"];

function TaskCard({
  task,
  onStatusChange,
}: {
  task: Task;
  onStatusChange: (id: string, status: TaskStatus) => void;
}) {
  const currentIdx = STATUS_SEQUENCE.indexOf(task.status);
  const canPrev = currentIdx > 0;
  const canNext = currentIdx < STATUS_SEQUENCE.length - 1;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm space-y-2">
      <div className="flex items-start gap-2">
        <p className="text-sm font-medium text-gray-900 flex-1 leading-snug">
          {task.title}
        </p>
        {task.source === "ai" && (
          <span className="text-xs bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded flex-shrink-0">
            AI
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <PriorityBadge priority={task.priority} />
        {task.due_date && (
          <span
            className={`text-xs font-medium ${
              isOverdue(task.due_date) ? "text-red-600" : "text-gray-500"
            }`}
          >
            {formatDate(task.due_date)}
          </span>
        )}
        {task.assignee && (
          <span className="text-xs text-gray-500">{task.assignee}</span>
        )}
      </div>
      <div className="flex gap-1 pt-1">
        <button
          onClick={() => canPrev && onStatusChange(task.id, STATUS_SEQUENCE[currentIdx - 1])}
          disabled={!canPrev}
          className="px-2 py-0.5 text-xs border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
          title="前のステータスへ"
        >
          ←
        </button>
        <button
          onClick={() => canNext && onStatusChange(task.id, STATUS_SEQUENCE[currentIdx + 1])}
          disabled={!canNext}
          className="px-2 py-0.5 text-xs border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
          title="次のステータスへ"
        >
          →
        </button>
      </div>
    </div>
  );
}

function AddTaskForm({
  projectId,
  onAdded,
}: {
  projectId: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          title: title.trim(),
          assignee: assignee.trim(),
          due_date: dueDate || null,
          priority,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "追加に失敗しました");
      }
      setTitle("");
      setAssignee("");
      setDueDate("");
      setPriority("medium");
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 w-full text-xs text-gray-500 hover:text-indigo-600 hover:bg-gray-50 border border-dashed border-gray-300 rounded-md py-2 transition-colors"
      >
        + タスク追加
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 bg-white border border-indigo-200 rounded-lg p-3 space-y-2"
    >
      <input
        type="text"
        placeholder="タスクタイトル *"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
        autoFocus
        required
      />
      <input
        type="text"
        placeholder="担当者"
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
      <div className="flex gap-2">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
        </select>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading && <Spinner size="sm" />}
          追加
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}

function TasksTab({
  project,
  onTaskUpdated,
}: {
  project: ProjectDetail;
  onTaskUpdated: () => void;
}) {
  const [tasks, setTasks] = useState<Task[]>(project.tasks);

  useEffect(() => {
    setTasks(project.tasks);
  }, [project.tasks]);

  async function handleStatusChange(taskId: string, newStatus: TaskStatus) {
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        // revert
        setTasks(project.tasks);
      } else {
        onTaskUpdated();
      }
    } catch {
      setTasks(project.tasks);
    }
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {COLUMNS.map(({ status, label, color }) => {
        const colTasks = tasks.filter((t) => t.status === status);
        return (
          <div
            key={status}
            className={`border rounded-xl p-4 ${color}`}
          >
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              {label}
              <span className="ml-2 text-xs text-gray-400 font-normal">
                {colTasks.length}
              </span>
            </h3>
            <div className="space-y-2">
              {colTasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>
            <AddTaskForm projectId={project.id} onAdded={onTaskUpdated} />
          </div>
        );
      })}
    </div>
  );
}

// ---- Activities tab ----

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  project_created: "作成",
  meeting_added: "議事録",
  task_created: "タスク",
  task_updated: "更新",
  digest: "現状整理",
  note: "メモ",
};

const ACTIVITY_ICONS: Record<ActivityType, string> = {
  project_created: "🚀",
  meeting_added: "🗒️",
  task_created: "✅",
  task_updated: "✏️",
  digest: "🔍",
  note: "📌",
};

function ActivityItem({ activity }: { activity: Activity }) {
  const [expanded, setExpanded] = useState(false);
  const isDigest = activity.type === "digest";
  const firstLine = activity.content.split("\n")[0];
  const hasMore = activity.content.includes("\n");

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-sm shadow-sm">
          {ACTIVITY_ICONS[activity.type]}
        </div>
        <div className="flex-1 w-px bg-gray-200 mt-1" />
      </div>
      <div className="flex-1 pb-6 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-gray-600">
            {ACTIVITY_LABELS[activity.type]}
          </span>
          <span className="text-xs text-gray-400">
            {new Date(activity.created_at).toLocaleString("ja-JP")}
          </span>
        </div>
        {isDigest ? (
          <div>
            {expanded ? (
              <div>
                <Markdown content={activity.content} />
                <button
                  onClick={() => setExpanded(false)}
                  className="text-xs text-indigo-600 hover:underline mt-1"
                >
                  折りたたむ
                </button>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-700 truncate">{firstLine}</p>
                {hasMore && (
                  <button
                    onClick={() => setExpanded(true)}
                    className="text-xs text-indigo-600 hover:underline mt-1"
                  >
                    展開
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-700">{activity.content}</p>
        )}
      </div>
    </div>
  );
}

function ActivitiesTab({ activities }: { activities: Activity[] }) {
  const sorted = [...activities].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );

  if (sorted.length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl px-6 py-10 text-center text-gray-400">
        経緯がありません。
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      {sorted.map((a) => (
        <ActivityItem key={a.id} activity={a} />
      ))}
    </div>
  );
}

// ---- Main page ----

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");

  const fetchProject = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error("プロジェクトの取得に失敗しました");
      setProject(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "概要" },
    { id: "meetings", label: "議事録" },
    { id: "tasks", label: "タスク" },
    { id: "activities", label: "経緯" },
  ];

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/" className="hover:text-indigo-600 transition-colors">
          ダッシュボード
        </Link>
        <span>/</span>
        <span className="text-gray-700">{project?.name ?? "…"}</span>
      </div>

      {loading && (
        <div className="flex items-center gap-3 py-16 justify-center">
          <Spinner size="lg" />
          <span className="text-gray-500">読み込み中…</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6 flex items-center justify-between">
          <span className="text-sm text-red-700">{error}</span>
          <button
            onClick={fetchProject}
            className="text-sm text-red-600 font-medium hover:underline"
          >
            再試行
          </button>
        </div>
      )}

      {project && (
        <>
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
              {project.description && (
                <p className="text-gray-500 mt-1">{project.description}</p>
              )}
            </div>
            <Link
              href={`/projects/${id}/meetings/new`}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors flex-shrink-0"
            >
              + 議事録を追加
            </Link>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200 mb-6">
            {TABS.map(({ id: tabId, label }) => (
              <button
                key={tabId}
                onClick={() => setTab(tabId)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  tab === tabId
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === "overview" && (
            <OverviewTab project={project} onDigestCreated={fetchProject} />
          )}
          {tab === "meetings" && <MeetingsTab project={project} />}
          {tab === "tasks" && (
            <TasksTab project={project} onTaskUpdated={fetchProject} />
          )}
          {tab === "activities" && (
            <ActivitiesTab activities={project.activities} />
          )}
        </>
      )}
    </div>
  );
}
