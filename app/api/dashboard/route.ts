import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/db";
import type { DashboardData } from "@/lib/types";

export async function GET() {
  try {
    const data: DashboardData = getDashboardData();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
