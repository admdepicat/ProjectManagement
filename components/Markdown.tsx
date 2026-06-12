import React from "react";

/**
 * Tiny Markdown renderer — no external dependencies.
 * Supports: ## / ### headings, - bullet lists, **bold**, paragraphs, line breaks.
 * Renders safely via React elements (no dangerouslySetInnerHTML).
 */

function parseInline(text: string): React.ReactNode[] {
  // Split on **bold** markers
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export default function Markdown({ content }: { content: string }) {
  if (!content) return null;

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++} className="list-disc list-inside space-y-1 my-2 text-gray-700">
          {listItems.map((item, i) => (
            <li key={i}>{parseInline(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Heading ##
    if (line.startsWith("### ")) {
      flushList();
      elements.push(
        <h3 key={key++} className="text-base font-semibold text-gray-800 mt-4 mb-1">
          {parseInline(line.slice(4))}
        </h3>
      );
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      elements.push(
        <h2 key={key++} className="text-lg font-bold text-gray-900 mt-5 mb-2">
          {parseInline(line.slice(3))}
        </h2>
      );
      continue;
    }
    if (line.startsWith("# ")) {
      flushList();
      elements.push(
        <h1 key={key++} className="text-xl font-bold text-gray-900 mt-5 mb-2">
          {parseInline(line.slice(2))}
        </h1>
      );
      continue;
    }

    // Bullet list
    if (line.match(/^[-*] /)) {
      listItems.push(line.slice(2));
      continue;
    }

    // Empty line — flush list, add paragraph break
    if (line.trim() === "") {
      flushList();
      // Only add spacing element if next non-empty line exists
      if (i < lines.length - 1) {
        elements.push(<div key={key++} className="h-2" />);
      }
      continue;
    }

    // Regular paragraph line
    flushList();
    elements.push(
      <p key={key++} className="text-gray-700 leading-relaxed">
        {parseInline(line)}
      </p>
    );
  }

  flushList();

  return <div className="prose-like">{elements}</div>;
}
