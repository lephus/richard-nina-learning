"use client";

import { useState } from "react";
import type { BuiltItem } from "@/lib/lesson/build-item";

export function FillBlank({
  item,
  disabled,
  onSubmit,
}: {
  item: Extract<BuiltItem, { kind: "fill" }>;
  disabled: boolean;
  onSubmit: (answer: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <p className="text-lg italic">{item.sentence}</p>
      <input
        data-testid="fill-input"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        className="rounded border border-slate-300 px-3 py-2"
        placeholder="Điền từ còn thiếu"
        autoComplete="off"
      />
      <button
        type="submit"
        disabled={disabled}
        className="self-start rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        Kiểm tra
      </button>
    </form>
  );
}
