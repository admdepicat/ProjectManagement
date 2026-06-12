// 音声ファイルの文字起こし。
// OpenAI Whisper API を使用 (OPENAI_API_KEY が必要)。
// キー未設定時は例外を投げ、呼び出し側がテキスト貼り付けへの誘導メッセージを返す。

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

export function transcriptionAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function transcribeAudio(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "音声文字起こしには OPENAI_API_KEY の設定が必要です。文字起こし済みテキストの貼り付けでも議事録を作成できます。"
    );
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)]),
    filename || "audio.m4a"
  );
  form.append("model", "whisper-1");
  form.append("language", "ja");
  form.append("response_format", "text");

  const res = await fetch(WHISPER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `文字起こしに失敗しました (HTTP ${res.status}): ${detail.slice(0, 300)}`
    );
  }
  const text = (await res.text()).trim();
  if (!text) throw new Error("文字起こし結果が空でした。音声ファイルを確認してください。");
  return text;
}
