// 文字起こしテキストから議事録(要約・決定事項・未解決事項)とタスクを
// Claude の structured outputs で一括抽出する。

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getClient, MODEL } from "./client";
import type { MinutesExtraction } from "../types";

const ExtractedTaskSchema = z.object({
  title: z.string().describe("タスクの簡潔なタイトル(体言止めまたは動詞終止)"),
  description: z
    .string()
    .describe("背景・完了条件など。会議中の文脈を補足。なければ空文字"),
  assignee: z.string().describe("担当者名。会話から特定できなければ空文字"),
  due_date: z
    .string()
    .nullable()
    .describe(
      "期限 (YYYY-MM-DD)。『来週金曜まで』等の相対表現は会議日付から具体日に解決する。不明なら null"
    ),
  priority: z
    .enum(["high", "medium", "low"])
    .describe("緊急度・重要度から判断した優先度"),
});

const MinutesExtractionSchema = z.object({
  title: z
    .string()
    .describe("会議の内容を表す簡潔なタイトル(例: 〇〇キックオフMTG)"),
  summary_md: z
    .string()
    .describe(
      "議事録本文 (Markdown)。## 見出しで議題ごとに整理し、議論の要点・経緯を箇条書きでまとめる。発言の単純な羅列ではなく構造化された議事録にする"
    ),
  decisions: z.array(z.string()).describe("会議で決定した事項のリスト"),
  open_questions: z
    .array(z.string())
    .describe("未解決のまま持ち越された論点・宿題のリスト"),
  tasks: z
    .array(ExtractedTaskSchema)
    .describe("会議から発生したアクションアイテム(タスク)"),
  progress_note: z
    .string()
    .describe(
      "プロジェクトの経緯タイムラインに記録する1〜2文の進捗メモ(この会議で何が前進したか)"
    ),
});

const SYSTEM_PROMPT = `あなたは優秀なプロジェクトマネージャーのアシスタントです。
会議の文字起こしテキストから、構造化された議事録とアクションアイテムを抽出します。

抽出方針:
- 議事録は読み手がその場にいなくても経緯と結論が分かるように書く
- 決定事項と「単に話題に出ただけのこと」を区別する
- タスクは実行可能な粒度で抽出する。明確な担当者・期限が会話に出ていれば必ず拾う
- 相対的な日付表現(「来週まで」「月末」など)は会議日付を基準に YYYY-MM-DD に解決する
- 文字起こしの誤変換が推測できる場合は文脈から正しい用語に直してよい
- 出力はすべて日本語`;

export async function extractMinutes(
  transcript: string,
  projectName: string,
  projectDescription: string,
  meetingDate: string // YYYY-MM-DD
): Promise<MinutesExtraction> {
  const client = getClient();

  const userContent = `プロジェクト名: ${projectName}
プロジェクト概要: ${projectDescription || "(未設定)"}
会議日付: ${meetingDate}

以下が会議の文字起こしです。議事録とタスクを抽出してください。

<transcript>
${transcript}
</transcript>`;

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    output_config: { format: zodOutputFormat(MinutesExtractionSchema) },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("議事録の生成が拒否されました。内容を確認してください。");
  }
  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("議事録の解析に失敗しました。もう一度お試しください。");
  }
  return parsed as MinutesExtraction;
}
