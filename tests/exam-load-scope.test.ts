import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { napPhamVi } from "@/lib/exam/load-scope";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(URL && SERVICE);

describe.skipIf(!hasEnv)("napPhamVi", () => {
  const db = createClient(URL ?? "http://localhost", SERVICE ?? "x", {
    auth: { persistSession: false },
  });

  it("một buổi cho 30 từ và đủ 30 đáp án điền", async () => {
    const { words, blankAnswers } = await napPhamVi(db, [1]);
    expect(words).toHaveLength(30);
    expect(blankAnswers.size).toBe(30);
    for (const w of words) expect(blankAnswers.has(w.id)).toBe(true);
  });

  it("hai buổi cho 60 từ, không trùng, và đủ 60 đáp án — đây là bài ôn tập nhóm", async () => {
    const { words, blankAnswers } = await napPhamVi(db, [1, 2]);
    expect(words).toHaveLength(60);
    expect(new Set(words.map((w) => w.id)).size).toBe(60);
    expect(blankAnswers.size).toBe(60);
    // Gộp thiếu một nửa là lỗi âm thầm: buildVocabExam sẽ ném ở câu điền đầu
    // tiên thuộc buổi bị thiếu, và người học chỉ thấy trang lỗi.
    for (const w of words) expect(blankAnswers.has(w.id)).toBe(true);
  });

  it("giữ đúng thứ tự buổi rồi tới thứ tự từ trong buổi", async () => {
    const { words } = await napPhamVi(db, [1, 2]);
    const buoi1 = await napPhamVi(db, [1]);
    expect(words.slice(0, 30).map((w) => w.id)).toEqual(buoi1.words.map((w) => w.id));
  });

  it("ném khi một ordinal không tồn tại, thay vì trả phạm vi ngắn hơn", async () => {
    // SỬA Ở VÒNG SOÁT CUỐI: `rejects.toBeTruthy()` khớp với BẤT KỲ lý do
    // reject nào — kể cả một lỗi kết nối không liên quan gì tới hành vi đang
    // muốn kiểm (ví dụ Supabase local không chạy). Test khi đó vẫn xanh dù
    // nhánh "ném khi thiếu ordinal" (load-scope.ts) chưa từng chạy tới. Assert
    // đúng thông điệp mà `napPhamVi` tự ném cho đúng nhánh này.
    await expect(napPhamVi(db, [999])).rejects.toThrow(/không tìm thấy buổi ứng với ordinal 999/);
  });
});
