import { NextResponse } from "next/server";
import {
  getProject,
  insertMeeting,
  insertExtractedTask,
  insertActivity,
  today,
} from "@/lib/db";
import { transcribeAudio } from "@/lib/ai/transcribe";
import { extractMinutes } from "@/lib/ai/extract";
import type { Task } from "@/lib/types";

export const maxDuration = 300;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) {
      return NextResponse.json(
        { error: "プロジェクトが見つかりません" },
        { status: 404 }
      );
    }

    const form = await req.formData();
    const audio = form.get("audio");
    const file = audio instanceof File && audio.size > 0 ? audio : null;
    const transcriptInput =
      typeof form.get("transcript") === "string"
        ? (form.get("transcript") as string).trim()
        : "";
    const titleInput =
      typeof form.get("title") === "string"
        ? (form.get("title") as string).trim()
        : "";
    const dateInput =
      typeof form.get("date") === "string"
        ? (form.get("date") as string).trim()
        : "";
    const date = dateInput || today();

    if (!file && !transcriptInput) {
      return NextResponse.json(
        { error: "音声ファイルまたは文字起こしテキストが必要です" },
        { status: 400 }
      );
    }

    // 1. 文字起こし (音声がある場合)
    let transcript = transcriptInput;
    if (file) {
      try {
        const buf = Buffer.from(await file.arrayBuffer());
        transcript = await transcribeAudio(buf, file.name);
      } catch (err) {
        return NextResponse.json(
          { error: (err as Error).message },
          { status: 400 }
        );
      }
    }

    // 2. 議事録・タスク抽出
    let extraction;
    try {
      extraction = await extractMinutes(
        transcript,
        project.name,
        project.description,
        date
      );
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message },
        { status: 500 }
      );
    }

    // 3. meeting 挿入
    const title = titleInput || extraction.title;
    const meeting = insertMeeting({
      project_id: project.id,
      title,
      date,
      audio_filename: file?.name ?? null,
      transcript,
      summary_md: extraction.summary_md,
      decisions: extraction.decisions,
      open_questions: extraction.open_questions,
    });

    // 4. 抽出タスク一括挿入
    const tasks: Task[] = extraction.tasks.map((t) =>
      insertExtractedTask(project.id, meeting.id, t)
    );

    // 5. activities 記録
    insertActivity(
      project.id,
      "meeting_added",
      `議事録「${title}」を追加 — ${extraction.progress_note}`
    );
    if (tasks.length > 0) {
      insertActivity(
        project.id,
        "task_created",
        `会議から${tasks.length}件のタスクを自動登録`
      );
    }

    return NextResponse.json({ meeting, tasks }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
