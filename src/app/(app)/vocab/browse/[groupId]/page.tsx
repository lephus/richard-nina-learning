import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadCards } from "@/lib/vocab/load-cards";
import { lessonsOf, wordRangeLabel, TOTAL_GROUPS } from "@/lib/curriculum/groups";
import { Deck } from "@/components/vocab/deck";

/**
 * Xem lại 60 từ của một nhóm.
 *
 * Dùng ĐÚNG `Deck` của pha học, chỉ khác ba chỗ: 60 thẻ thay vì 30, không có
 * nút "Làm bài", và không ghi `lesson_cursor` (60 từ của một nhóm không thuộc
 * buổi nào để đánh dấu). Ghi chú vẫn sửa được như bình thường.
 *
 * Mở được với nhóm CHƯA HỌC — đó là cả điểm của tính năng này.
 */
export default async function BrowsePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const group = Number(groupId);
  if (!Number.isInteger(group) || group < 1 || group > TOTAL_GROUPS) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ordinals = lessonsOf(group);
  const { data: lessons, error } = await supabase
    .from("lessons").select("id, ordinal").in("ordinal", [...ordinals]);
  if (error) throw error;

  // Sắp theo ordinal chứ không tin thứ tự `.in()` trả về: PostgREST không bảo
  // đảm thứ tự khớp mảng đầu vào, và thứ tự này quyết định 60 thẻ xếp ra sao.
  const ids = [...(lessons ?? [])]
    .sort((a, b) => (a.ordinal as number) - (b.ordinal as number))
    .map((l) => l.id as number);
  if (ids.length !== ordinals.length) notFound();

  const cards = await loadCards(supabase, ids, user.id);
  const hideWord = (await cookies()).get("vocab_hide_word")?.value === "1";

  return (
    <main className="flex flex-col gap-5">
      <h1 data-testid="browse-heading" className="text-2xl font-semibold">
        Xem lại · Nhóm {group} · {wordRangeLabel(group)}
      </h1>
      <Deck
        cards={cards}
        initialIndex={0}
        examAction={null}
        lessonId={null}
        initialHideWord={hideWord}
      />
    </main>
  );
}
