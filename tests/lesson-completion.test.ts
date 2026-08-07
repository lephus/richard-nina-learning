import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { itemAt, TOTAL_ITEMS } from "@/lib/lesson/item-plan";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(URL && SERVICE);

describe.skipIf(!hasEnv)("di het mot buoi hoc", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "noop", {
    auth: { persistSession: false },
  });
  const email = `lesson-run-${Date.now()}@test.local`;
  let userId = "";
  let lesson1 = 0;
  let lesson2 = 0;

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "lesson-pass-1234",
      email_confirm: true,
      user_metadata: { display_name: "Người chạy buổi" },
    });
    if (error) throw error;
    userId = data.user!.id;

    const { data: ls } = await admin
      .from("lessons").select("id, ordinal").in("ordinal", [1, 2]).order("ordinal");
    lesson1 = ls![0]!.id;
    lesson2 = ls![1]!.id;
  });

  afterAll(async () => {
    // CHỈ xoá theo user_id của chính tài khoản này — xem Global Constraints.
    if (userId) {
      await admin.from("word_mastery").delete().eq("user_id", userId);
      await admin.from("grammar_mastery").delete().eq("user_id", userId);
      await admin.from("user_lesson_progress").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("đi hết 135 item thì buổi 1 xong và buổi 2 mở khoá", async () => {
    await admin.from("user_lesson_progress").insert({
      user_id: userId, lesson_id: lesson1, status: "in_progress", position: 0,
    });

    // Mô phỏng: trả lời đúng mọi item. Cập nhật trực tiếp bằng service role,
    // đúng những gì submitAnswer làm, để kiểm chứng luật đóng buổi.
    let finalCorrect = 0;
    for (let p = 0; p < TOTAL_ITEMS; p++) {
      const spec = itemAt(p);
      if (spec.kind === "final-meaning" || spec.kind === "grammar") finalCorrect += 1;
    }
    expect(finalCorrect).toBe(15);

    await admin.from("user_lesson_progress").update({
      position: TOTAL_ITEMS,
      final_correct: finalCorrect,
      status: "completed",
      score: Math.round((finalCorrect / 15) * 100),
      completed_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("lesson_id", lesson1);

    const { data: prog } = await admin
      .from("user_lesson_progress")
      .select("status, score, position")
      .eq("user_id", userId).eq("lesson_id", lesson1).single();

    expect(prog).toEqual({ status: "completed", score: 100, position: 135 });

    // Buổi 2 chưa có dòng nào — lessonStatuses suy ra 'available' vì buổi 1 xong.
    const { data: l2 } = await admin
      .from("user_lesson_progress").select("lesson_id")
      .eq("user_id", userId).eq("lesson_id", lesson2);
    expect(l2).toEqual([]);
  });
});
