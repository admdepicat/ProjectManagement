import { NextResponse } from "next/server";
import { getTask, updateTask, deleteTask, insertActivity } from "@/lib/db";
import type { TaskPriority, TaskStatus } from "@/lib/types";

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "未着手",
  in_progress: "進行中",
  done: "完了",
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = getTask(id);
    if (!existing) {
      return NextResponse.json(
        { error: "タスクが見つかりません" },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const patch: {
      title?: string;
      description?: string;
      assignee?: string;
      due_date?: string | null;
      priority?: TaskPriority;
      status?: TaskStatus;
    } = {};
    if (typeof body.title === "string") patch.title = body.title;
    if (typeof body.description === "string") patch.description = body.description;
    if (typeof body.assignee === "string") patch.assignee = body.assignee;
    if (body.due_date === null || typeof body.due_date === "string")
      patch.due_date = body.due_date || null;
    if (
      body.priority === "high" ||
      body.priority === "medium" ||
      body.priority === "low"
    )
      patch.priority = body.priority;
    if (
      body.status === "todo" ||
      body.status === "in_progress" ||
      body.status === "done"
    )
      patch.status = body.status;

    const statusChanged =
      patch.status !== undefined && patch.status !== existing.status;

    const updated = updateTask(id, patch);
    if (!updated) {
      return NextResponse.json(
        { error: "タスクが見つかりません" },
        { status: 404 }
      );
    }

    if (statusChanged) {
      insertActivity(
        updated.project_id,
        "task_updated",
        `タスク「${updated.title}」を${STATUS_LABEL[updated.status]}に変更`
      );
    }

    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ok = deleteTask(id);
    if (!ok) {
      return NextResponse.json(
        { error: "タスクが見つかりません" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
