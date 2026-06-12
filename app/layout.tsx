import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProjectFlow",
  description: "プロジェクト議事録・タスク管理",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <div className="flex min-h-screen">
          {/* Fixed sidebar */}
          <aside className="fixed top-0 left-0 h-full w-56 bg-white border-r border-gray-200 flex flex-col z-10 shadow-sm">
            <div className="px-5 py-5 border-b border-gray-100">
              <Link
                href="/"
                className="text-lg font-bold text-indigo-600 tracking-tight hover:text-indigo-700 transition-colors"
              >
                ProjectFlow
              </Link>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              <Link
                href="/"
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              >
                <span className="text-base">📋</span>
                ダッシュボード
              </Link>
            </nav>
            <div className="px-5 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">ProjectFlow v1.0</p>
            </div>
          </aside>

          {/* Main content — offset by sidebar width */}
          <main className="ml-56 flex-1 min-h-screen">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
