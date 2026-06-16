"use client";

import { useState } from "react";

type Status = "idle" | "loading" | "success" | "error";

export default function VpsPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");

  async function handleRestart() {
    if (!user || !password) {
      setMessage("ユーザー名とパスワードを入力してください");
      setStatus("error");
      return;
    }

    const confirmed = window.confirm(
      "VPS を再起動します。接続中のセッションはすべて切断されます。よろしいですか？"
    );
    if (!confirmed) return;

    setStatus("loading");
    setMessage("");

    try {
      const credentials = btoa(`${user}:${password}`);
      const res = await fetch("/api/vps/restart", {
        method: "POST",
        headers: { Authorization: `Basic ${credentials}` },
      });

      const data = await res.json();

      if (res.ok) {
        setStatus("success");
        setMessage(data.message || "再起動コマンドを送信しました");
      } else {
        setStatus("error");
        setMessage(data.error || "エラーが発生しました");
      }
    } catch {
      setStatus("error");
      setMessage("ネットワークエラーが発生しました");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">VPS コントロール</h1>
        <p className="text-gray-500 text-sm mb-8">
          サーバーの再起動を実行します
        </p>

        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ユーザー名
            </label>
            <input
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="admin"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
              autoComplete="current-password"
              onKeyDown={(e) => e.key === "Enter" && handleRestart()}
            />
          </div>
        </div>

        <button
          onClick={handleRestart}
          disabled={status === "loading"}
          className={`w-full py-3 rounded-xl font-semibold text-white transition-colors ${
            status === "loading"
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-red-500 hover:bg-red-600 active:bg-red-700"
          }`}
        >
          {status === "loading" ? "送信中..." : "VPS を再起動する"}
        </button>

        {message && (
          <div
            className={`mt-4 p-3 rounded-lg text-sm ${
              status === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {status === "success" ? "✓ " : "✗ "}
            {message}
          </div>
        )}

        {status === "success" && (
          <p className="mt-3 text-xs text-gray-400 text-center">
            サーバーが再起動するまで数分かかる場合があります
          </p>
        )}
      </div>
    </div>
  );
}
