import type { TaskStatus } from "@/lib/types";

const labels: Record<TaskStatus, string> = {
  todo: "未着手",
  in_progress: "進行中",
  done: "完了",
};

const styles: Record<TaskStatus, string> = {
  todo: "bg-gray-100 text-gray-600 border border-gray-200",
  in_progress: "bg-amber-100 text-amber-700 border border-amber-200",
  done: "bg-green-100 text-green-700 border border-green-200",
};

export default function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
