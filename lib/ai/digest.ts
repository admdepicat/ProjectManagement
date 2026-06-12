// プロジェクトの「現状整理」ダイジェスト生成。
// 未完了タスク・直近の経緯・直近議事録から、いま何をすべきかを Markdown で整理する。

import { getClient, MODEL } from "./client";
import type { Project, Task, Activity, Meeting } from "../types";

const SYSTEM_PROMPT = `あなたは優秀なプロジェクトマネージャーのアシスタントです。
プロジェクトの現状データから「いま何をやるべきか」を簡潔に整理します。

出力形式 (Markdown、日本語):
## 現在地
プロジェクトがどこまで進んでいるか 2〜3文で。

## 今やるべきこと
優先度順の箇条書き(最大5件)。期限切れ・期限間近を最優先。各項目になぜ今やるべきかを一言添える。

## 注意点・リスク
未解決事項や停滞しているものがあれば指摘(なければこのセクションは省略)。`;

export async function generateDigest(
  project: Project,
  openTasks: Task[],
  recentActivities: Activity[],
  recentMeetings: Meeting[]
): Promise<string> {
  const client = getClient();
  const today = new Date().toISOString().slice(0, 10);

  const taskLines = openTasks
    .map(
      (t) =>
        `- [${t.status}] ${t.title} (優先度:${t.priority}${
          t.due_date ? ` 期限:${t.due_date}` : ""
        }${t.assignee ? ` 担当:${t.assignee}` : ""})`
    )
    .join("\n");

  const activityLines = recentActivities
    .map((a) => `- ${a.created_at.slice(0, 10)} [${a.type}] ${a.content}`)
    .join("\n");

  const meetingLines = recentMeetings
    .map(
      (m) =>
        `### ${m.date} ${m.title}\n決定事項: ${m.decisions.join(" / ") || "なし"}\n未解決: ${m.open_questions.join(" / ") || "なし"}`
    )
    .join("\n\n");

  const userContent = `今日の日付: ${today}

# プロジェクト: ${project.name}
${project.description || ""}

# 未完了タスク (${openTasks.length}件)
${taskLines || "なし"}

# 直近の経緯
${activityLines || "なし"}

# 直近の議事録サマリ
${meetingLines || "なし"}

このプロジェクトの現状整理をお願いします。`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("ダイジェスト生成が拒否されました。");
  }
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("ダイジェスト生成結果が空でした。");
  return text;
}
