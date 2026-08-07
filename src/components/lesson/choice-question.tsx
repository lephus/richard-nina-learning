"use client";

import type { BuiltItem } from "@/lib/lesson/build-item";

const PROMPT = {
  meaning: (w: string) => `"${w}" nghĩa là gì?`,
  synonym: (w: string) => `Từ nào đồng nghĩa với "${w}"?`,
} as const;

export function ChoiceQuestion({
  item,
  disabled,
  onPick,
}: {
  item: Extract<BuiltItem, { kind: "meaning" | "synonym" | "grammar" }>;
  disabled: boolean;
  onPick: (answer: string) => void;
}) {
  const prompt = item.kind === "grammar" ? item.stem : PROMPT[item.kind](item.word);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-lg">{prompt}</p>
      <div className="flex flex-col gap-2">
        {item.options.map((o) => (
          <button
            key={o}
            data-testid="choice-option"
            disabled={disabled}
            onClick={() => onPick(o)}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-left disabled:opacity-60"
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
