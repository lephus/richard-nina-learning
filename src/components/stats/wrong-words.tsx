import type { WrongWord } from "@/lib/stats/compute";

/**
 * Danh sách các từ hay sai nhất, để người học biết nên ôn từ nào trước. Đã
 * được `topWrongWords` sắp theo số lần sai giảm dần và cắt tối đa
 * `TOP_WRONG_LIMIT` dòng — component chỉ hiển thị, không tự sắp lại.
 */
export function WrongWords({ words }: { words: WrongWord[] }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Từ hay sai nhất</h2>
      {words.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Chưa có từ nào bạn sai.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {words.map((w) => (
            <li
              key={w.wordId}
              data-testid="wrong-word"
              className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0"
            >
              <span>
                <span className="font-medium">{w.word}</span>{" "}
                <span className="text-slate-500">— {w.meaningVi}</span>
              </span>
              <span className="text-sm text-slate-500">sai {w.wrongCount} lần</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
