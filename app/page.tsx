"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DashboardData, Task, ProjectWithCounts } from "@/lib/types";
import PriorityBadge from "@/components/PriorityBadge";
import Spinner from "@/components/Spinner";

// ---- helpers ----

function formatDate(d: string | null): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${y}/${m}/${day}`;
}

function isOverdue(due: string | null): boolean {
  if (!due) return false;
  return new Date(due) < new Date(new Date().toISOString().slice(0, 10));
}

// ---- Task row ----

function TaskRow({ task }: { task: Task }) {
  return (
    <Link
      href={`/projects/${task.project_id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 rounded-md transition-colors group"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate group-hover:text-indigo-600">
          {task.title}
        </p>
        {task.assignee && (
          <p className="text-xs text-gray-500 mt-0.5">{task.assignee}</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
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
      </div>
    </Link>
  );
}

// ---- Task section ----

function TaskSection({
  title,
  tasks,
  accentClass,
  emptyMsg,
}: {
  title: string;
  tasks: Task[];
  accentClass: string;
  emptyMsg?: string;
}) {
  if (tasks.length === 0 && !emptyMsg) return null;
  return (
    <div>
      <h3
        className={`text-xs font-semibold uppercase tracking-wide mb-2 ${accentClass}`}
      >
        {title}
        <span className="ml-2 text-gray-400 normal-case font-normal">
          {tasks.length}件
        </span>
      </h3>
      {tasks.length === 0 ? (
        <p className="text-sm text-gray-400 px-4 py-2">{emptyMsg}</p>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg bg-white">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- New project inline form ----

function NewProjectCard({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "作成に失敗しました");
      }
      setName("");
      setDescription("");
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl p-6 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors w-full h-full min-h-[120px]"
      >
        <span className="text-2xl">+</span>
        <span className="font-medium">新規プロジェクト</span>
      </button>
    );
  }

  return (
    <div className="border-2 border-indigo-300 rounded-xl p-5 bg-white">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">新規プロジェクト</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          placeholder="プロジェクト名 *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          autoFocus
          required
        />
        <textarea
          placeholder="説明（任意）"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {loading && <Spinner size="sm" />}
            作成
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            キャンセル
          </button>
        </div>
      </form>
    </div>
  );
}

// ---- Project card ----

function ProjectCard({ project }: { project: ProjectWithCounts }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="block bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-md transition-all group"
    >
      <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
        {project.name}
      </h3>
      {project.description && (
        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{project.description}</p>
      )}
      <div className="flex gap-3 mt-4">
        <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded-full">
          <span>📝</span>
          未完了 {project.open_task_count}件
        </span>
        <span className="inline-flex items-center gap-1 text-xs bg-gray-50 text-gray-600 border border-gray-200 px-2 py-1 rounded-full">
          <span>🗒️</span>
          議事録 {project.meeting_count}件
        </span>
      </div>
    </Link>
  );
}

// ---- Main page ----

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchData() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("データの取得に失敗しました");
      const json: DashboardData = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  const allActionTasks = data
    ? [...data.overdue, ...data.due_this_week, ...data.high_priority]
    : [];
  const hasActionTasks = allActionTasks.length > 0;

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">ダッシュボード</h1>

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
            onClick={fetchData}
            className="text-sm text-red-600 font-medium hover:underline"
          >
            再試行
          </button>
        </div>
      )}

      {data && (
        <>
          {/* Section: 今やること */}
          <section className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 mb-4">今やること</h2>
            {!hasActionTasks ? (
              <div className="bg-white border border-gray-100 rounded-xl px-6 py-10 text-center text-gray-500">
                対応が必要なタスクはありません 🎉
              </div>
            ) : (
              <div className="space-y-5">
                <TaskSection
                  title="期限切れ"
                  tasks={data.overdue}
                  accentClass="text-red-600"
                />
                <TaskSection
                  title="今週が期限"
                  tasks={data.due_this_week}
                  accentClass="text-amber-600"
                />
                <TaskSection
                  title="優先度: 高"
                  tasks={data.high_priority}
                  accentClass="text-blue-600"
                />
              </div>
            )}
          </section>

          {/* Section: プロジェクト */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-4">プロジェクト</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.projects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
              <NewProjectCard onCreated={fetchData} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
