import { NextResponse } from "next/server";
import {
  getProject,
  listOpenTasks,
  listActivities,
  listRecentMeetings,
  insertActivity,
} from "@/lib/db";
import { generateDigest } from "@/lib/ai/digest";

export const maxDuration = 300;

export async function POST(
  _req: Request,
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

    const openTasks = listOpenTasks(id);
    const recentActivities = listActivities(id, 20);
    const recentMeetings = listRecentMeetings(id, 5);

    let digest: string;
    try {
      digest = await generateDigest(
        project,
        openTasks,
        recentActivities,
        recentMeetings
      );
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message },
        { status: 500 }
      );
    }

    const activity = insertActivity(id, "digest", digest);
    return NextResponse.json({ digest, activity });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
