import type { TaskPriority } from "@/lib/types";

const labels: Record<TaskPriority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const styles: Record<TaskPriority, string> = {
  high: "bg-red-100 text-red-700 border border-red-200",
  medium: "bg-gray-100 text-gray-600 border border-gray-200",
  low: "bg-blue-100 text-blue-700 border border-blue-200",
};

export default function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${styles[priority]}`}
    >
      {labels[priority]}
    </span>
  );
}
