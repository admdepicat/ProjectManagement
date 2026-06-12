import { NextResponse } from "next/server";
import { listTasks, insertTask, getProject, insertActivity } from "@/lib/db";
import type { TaskStatus, TaskPriority } from "@/lib/types";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") ?? undefined;
    const statusParam = searchParams.get("status");
    const status =
      statusParam === "todo" ||
      statusParam === "in_progress" ||
      statusParam === "done"
        ? (statusParam as TaskStatus)
        : undefined;
    return NextResponse.json(listTasks({ projectId, status }));
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const project_id =
      typeof body.project_id === "string" ? body.project_id : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!project_id) {
      return NextResponse.json(
        { error: "project_id は必須です" },
        { status: 400 }
      );
    }
    if (!title) {
      return NextResponse.json(
        { error: "タスクのタイトルは必須です" },
        { status: 400 }
      );
    }
    if (!getProject(project_id)) {
      return NextResponse.json(
        { error: "プロジェクトが見つかりません" },
        { status: 404 }
      );
    }

    const priority: TaskPriority =
      body.priority === "high" || body.priority === "low"
        ? body.priority
        : "medium";

    const task = insertTask({
      project_id,
      meeting_id: null,
      title,
      description: typeof body.description === "string" ? body.description : "",
      assignee: typeof body.assignee === "string" ? body.assignee : "",
      due_date: typeof body.due_date === "string" && body.due_date ? body.due_date : null,
      priority,
      status: "todo",
      source: "manual",
    });

    insertActivity(project_id, "task_created", `タスク「${title}」を追加`);

    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
