import { NextResponse } from "next/server";
import { getMeeting, deleteMeeting, listTasksByMeeting } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const meeting = getMeeting(id);
    if (!meeting) {
      return NextResponse.json(
        { error: "議事録が見つかりません" },
        { status: 404 }
      );
    }
    const tasks = listTasksByMeeting(id);
    return NextResponse.json({ meeting, tasks });
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
    const ok = deleteMeeting(id);
    if (!ok) {
      return NextResponse.json(
        { error: "議事録が見つかりません" },
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
