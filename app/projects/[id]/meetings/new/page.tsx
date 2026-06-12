"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Spinner from "@/components/Spinner";

type InputMethod = "audio" | "text";

const PROGRESS_MESSAGES = [
  "文字起こし中…",
  "議事録を生成中…",
  "タスクを抽出中…",
  "もう少しお待ちください…",
];

export default function NewMeetingPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [inputMethod, setInputMethod] = useState<InputMethod>("audio");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState(PROGRESS_MESSAGES[0]);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Rotate progress messages during loading
  useEffect(() => {
    if (loading) {
      let idx = 0;
      setProgressMsg(PROGRESS_MESSAGES[0]);
      progressIntervalRef.current = setInterval(() => {
        idx = (idx + 1) % PROGRESS_MESSAGES.length;
        setProgressMsg(PROGRESS_MESSAGES[idx]);
      }, 3500);
    } else {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [loading]);

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) setAudioFile(file);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (inputMethod === "audio" && !audioFile) {
      setError("音声ファイルを選択してください。");
      return;
    }
    if (inputMethod === "text" && !transcript.trim()) {
      setError("テキストを入力してください。");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      if (title.trim()) formData.append("title", title.trim());
      if (date) formData.append("date", date);

      if (inputMethod === "audio" && audioFile) {
        formData.append("audio", audioFile);
      } else {
        formData.append("transcript", transcript);
      }

      const res = await fetch(`/api/projects/${projectId}/meetings`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `エラーが発生しました (${res.status})`);
      }

      router.push(`/projects/${projectId}/meetings/${data.meeting.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setLoading(false);
    }
  }

  // Full-screen progress overlay
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <div className="text-center space-y-6 px-8">
          <Spinner size="lg" />
          <p className="text-lg font-medium text-gray-700 animate-pulse">
            {progressMsg}
          </p>
          <p className="text-sm text-gray-400">
            音声の長さによっては数分かかることがあります
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-8 max-w-2xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-indigo-600">ダッシュボード</Link>
        <span>/</span>
        <Link href={`/projects/${projectId}`} className="hover:text-indigo-600">
          プロジェクト
        </Link>
        <span>/</span>
        <span className="text-gray-700">議事録を作成</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-8">議事録を作成</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            タイトル
          </label>
          <input
            type="text"
            placeholder="空欄ならAIが自動生成"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            日付
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        {/* Input method toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            入力方法
          </label>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
            <button
              type="button"
              onClick={() => setInputMethod("audio")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                inputMethod === "audio"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              🎙️ 音声ファイル
            </button>
            <button
              type="button"
              onClick={() => setInputMethod("text")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                inputMethod === "text"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              📝 テキスト貼り付け
            </button>
          </div>
        </div>

        {/* Audio drop zone */}
        {inputMethod === "audio" && (
          <div>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-indigo-400 bg-indigo-50"
                  : audioFile
                  ? "border-green-400 bg-green-50"
                  : "border-gray-300 hover:border-indigo-300 hover:bg-gray-50"
              }`}
            >
              {audioFile ? (
                <div className="space-y-2">
                  <p className="text-2xl">🎵</p>
                  <p className="text-sm font-medium text-green-700">
                    {audioFile.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {(audioFile.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAudioFile(null);
                    }}
                    className="text-xs text-red-500 hover:underline"
                  >
                    削除
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-3xl">🎙️</p>
                  <p className="text-sm font-medium text-gray-700">
                    音声ファイルをドラッグ＆ドロップ
                  </p>
                  <p className="text-xs text-gray-400">
                    またはクリックしてファイルを選択
                  </p>
                  <p className="text-xs text-gray-400">
                    ※ OPENAI_API_KEY の設定が必要です
                  </p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setAudioFile(f);
              }}
            />
          </div>
        )}

        {/* Text transcript */}
        {inputMethod === "text" && (
          <div>
            <textarea
              placeholder="文字起こし済みテキストや会議メモを貼り付け"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={12}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y"
            />
            {transcript && (
              <p className="text-xs text-gray-400 mt-1 text-right">
                {transcript.length.toLocaleString()} 文字
              </p>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="submit"
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            議事録を作成
          </button>
          <Link
            href={`/projects/${projectId}`}
            className="px-6 py-2.5 text-gray-600 hover:text-gray-800 transition-colors"
          >
            キャンセル
          </Link>
        </div>
      </form>
    </div>
  );
}
