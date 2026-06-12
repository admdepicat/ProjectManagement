import Anthropic from "@anthropic-ai/sdk";

// ANTHROPIC_API_KEY は環境変数から解決される
let _client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY が設定されていません。.env.local に設定してください。"
    );
  }
  if (!_client) _client = new Anthropic();
  return _client;
}

export const MODEL = "claude-opus-4-8";
