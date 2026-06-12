"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Meeting, Task } from "@/lib/types";
import PriorityBadge from "@/components/PriorityBadge";
import StatusBadge from "@/components/StatusBadge";
import Spinner from "@/components/Spinner";
import Markdown from "@/components/Markdown";

function formatDate(d: string | null | undefined): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${y}年${m}月${day}日`;
}

function isOverdue(due: string | null): boolean {
  if (!due) return false;
  return new Date(due) < new Date(new Date().toISOString().slice(0, 10));
}

interface MeetingDetail {
  meeting: Meeting;
  tasks: Task[];
}

export default function MeetingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const meetingId = params.meetingId as string;

  const [data, setData] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/meetings/${meetingId}`);
      if (!res.ok) throw new Error("議事録の取得に失敗しました");
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleDelete() {
    if (!confirm("この議事録を削除しますか？この操作は元に戻せません。")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("削除に失敗しました");
      router.push(`/projects/${projectId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "削除に失敗しました");
      setDeleting(false);
    }
  }

  const { meeting, tasks } = data ?? {};

  return (
    <div className="px-8 py-8 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-indigo-600">ダッシュボード</Link>
        <span>/</span>
        <Link href={`/projects/${projectId}`} className="hover:text-indigo-600">
          プロジェクト
        </Link>
        <span>/</span>
        <span className="text-gray-700">議事録</span>
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
            onClick={fetchData}
            className="text-sm text-red-600 font-medium hover:underline"
          >
            再試行
          </button>
        </div>
      )}

      {meeting && (
        <div className="space-y-8">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {meeting.title || "（無題）"}
              </h1>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                <span>📅 {formatDate(meeting.date)}</span>
                {meeting.audio_filename && (
                  <span className="flex items-center gap-1">
                    🎙️
                    <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">
                      {meeting.audio_filename}
                    </span>
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-60 transition-colors"
            >
              {deleting ? <Spinner size="sm" /> : "🗑️"}
              削除
            </button>
          </div>

          {/* Summary */}
          {meeting.summary_md && (
            <section>
              <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span className="w-1 h-5 bg-indigo-500 rounded-full inline-block" />
                要約
              </h2>
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <Markdown content={meeting.summary_md} />
              </div>
            </section>
          )}

          {/* Decisions */}
          {meeting.decisions.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span className="w-1 h-5 bg-green-500 rounded-full inline-block" />
                決定事項
              </h2>
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <ul className="space-y-2">
                  {meeting.decisions.map((d, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 text-green-700 text-xs flex items-center justify-center font-medium mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-sm text-gray-700">{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* Open questions */}
          {meeting.open_questions.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span className="w-1 h-5 bg-amber-500 rounded-full inline-block" />
                未解決事項
              </h2>
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <ul className="space-y-2">
                  {meeting.open_questions.map((q, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="flex-shrink-0 text-amber-500 mt-0.5">?</span>
                      <span className="text-sm text-gray-700">{q}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* Extracted tasks */}
          {tasks && tasks.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span className="w-1 h-5 bg-violet-500 rounded-full inline-block" />
                抽出されたタスク
                <span className="text-xs text-gray-400 font-normal">
                  {tasks.length}件
                </span>
              </h2>
              <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                {tasks.map((task) => (
                  <div key={task.id} className="px-5 py-3.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {task.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <PriorityBadge priority={task.priority} />
                      <StatusBadge status={task.status} />
                      {task.assignee && (
                        <span className="text-xs text-gray-500">{task.assignee}</span>
                      )}
                      {task.due_date && (
                        <span
                          className={`text-xs font-medium ${
                            isOverdue(task.due_date)
                              ? "text-red-600"
                              : "text-gray-500"
                          }`}
                        >
                          {task.due_date}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {tasks && tasks.length === 0 && (
            <section>
              <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span className="w-1 h-5 bg-violet-500 rounded-full inline-block" />
                抽出されたタスク
              </h2>
              <div className="bg-white border border-gray-100 rounded-xl px-5 py-6 text-center text-sm text-gray-400">
                タスクは抽出されませんでした。
              </div>
            </section>
          )}

          {/* Transcript (collapsed) */}
          {meeting.transcript && (
            <section>
              <details className="group">
                <summary className="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-800 flex items-center gap-2 list-none">
                  <span className="text-gray-400 group-open:rotate-90 transition-transform inline-block">
                    ▶
                  </span>
                  文字起こし全文
                </summary>
                <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-5">
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed font-sans">
                    {meeting.transcript}
                  </pre>
                </div>
              </details>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
