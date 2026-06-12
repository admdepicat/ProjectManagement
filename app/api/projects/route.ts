import { NextResponse } from "next/server";
import { listProjects, createProject, insertActivity } from "@/lib/db";

export async function GET() {
  try {
    return NextResponse.json(listProjects());
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
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "プロジェクト名は必須です" }, { status: 400 });
    }
    const description =
      typeof body.description === "string" ? body.description : "";
    const project = createProject(name, description);
    insertActivity(
      project.id,
      "project_created",
      `プロジェクト「${project.name}」を作成`
    );
    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
