export default function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const cls =
    size === "sm"
      ? "w-4 h-4 border-2"
      : size === "lg"
      ? "w-8 h-8 border-4"
      : "w-6 h-6 border-2";
  return (
    <div
      className={`${cls} border-gray-300 border-t-indigo-600 rounded-full animate-spin inline-block`}
      role="status"
      aria-label="読み込み中"
    />
  );
}
