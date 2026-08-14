import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { danhTinhNguoiDung } from "@/lib/supabase/danh-tinh";
import { loadCards } from "@/lib/vocab/load-cards";
import { groupOf } from "@/lib/curriculum/groups";
import { Deck } from "@/components/vocab/deck";
import { batDauBaiThi } from "@/app/(app)/exam/[id]/actions";

export default async function LearnPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const id = Number(lessonId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const supabase = await createClient();
  const user = await danhTinhNguoiDung(supabase);
  if (!user) redirect("/login");

  const { data: lesson, error: lessonError } = await supabase
    .from("lessons").select("id, ordinal").eq("id", id).maybeSingle();
  if (lessonError) throw lessonError;
  if (!lesson) notFound();

  // KHÔNG có tấm chắn "buổi này đã mở chưa" như lát 1: 10 nhóm mở hết, gõ
  // thẳng URL của buổi 19 là hành vi hợp lệ, không phải đường tấn công.
  const [cards, cursorRes] = await Promise.all([
    loadCards(supabase, [id], user.id),
    supabase
      .from("lesson_cursor").select("word_index")
      .eq("user_id", user.id).eq("lesson_id", id).maybeSingle(),
  ]);
  if (cursorRes.error) throw cursorRes.error;

  const ordinal = lesson.ordinal as number;
  const hideWord = (await cookies()).get("vocab_hide_word")?.value === "1";

  return (
    <main className="flex flex-col gap-5">
      <h1 data-testid="learn-heading" className="text-2xl font-semibold">
        Nhóm {groupOf(ordinal)} · Buổi {ordinal}
      </h1>
      <Deck
        cards={cards}
        initialIndex={cursorRes.data?.word_index ?? 0}
        examAction={batDauBaiThi.bind(null, id)}
        lessonId={id}
        initialHideWord={hideWord}
      />
    </main>
  );
}
