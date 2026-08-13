import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ExamRunner } from "@/components/exam/ExamRunner";

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  if (!/^[1-9][0-9]*$/.test(raw)) notFound();
  const assessmentId = Number(raw);

  const supabase = await createClient();
  const { data: bai } = await supabase
    .from("assessments").select("id, status").eq("id", assessmentId).maybeSingle();
  if (!bai) notFound();

  const { data: items, error } = await supabase
    .from("assessment_items")
    .select("position, payload")
    .eq("assessment_id", assessmentId)
    .order("position");
  if (error) throw error;

  const cau = (items ?? []).map((r) => ({
    position: r.position as number,
    ...(r.payload as { prompt: string; options: string[]; kind: string }),
  }));

  return <ExamRunner assessmentId={assessmentId} cauHoi={cau} />;
}
