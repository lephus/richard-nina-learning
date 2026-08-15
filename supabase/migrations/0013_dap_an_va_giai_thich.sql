-- Lat "dung lai xem ket qua": sau khi tra loi, nguoi hoc duoc xem dap an dung
-- va giai thich. 537 cau ngu phap DA co san `explanation` tieng Viet.
--
-- Vi sao phai la RPC security definer: `explanation` KHONG nam trong danh sach
-- cot cap cho `authenticated` (0004_rls.sql:47-48, "answer, explanation chi
-- server doc"). Va Server Action KHONG dac quyen hon client — no dung chinh
-- SupabaseClient cua nguoi dung, cung vai `authenticated`, nen no vap dung hang
-- rao cot do. Cap thang cot nay cho authenticated la mo cua cho client doc giai
-- thich TRUOC khi tra loi, tuc biet luon dap an.
--
-- Ham nay THAY `answer_for_question` trong duong cham diem (xem
-- src/lib/exam/run.ts): tra ca hai truong trong MOT luot, nen so vong goi cho
-- cau ngu phap khong doi. `answer_for_question` van giu nguyen, khong drop —
-- no la mot API nho, va bo di la mot thay doi khong lien quan toi lat nay.
--
-- Bieu thuc lay dap an sao nguyen tu `answer_for_question` (0006): cot `answer`
-- luu chu cai A-D, `options` la mang jsonb, nen chi so la ascii(answer) - 65.
create or replace function public.dap_an_va_giai_thich(p_question_id bigint)
returns table(dap_an text, giai_thich text)
language sql
security definer
set search_path = public, pg_temp
as $$
  select (options ->> (ascii(answer) - ascii('A'))), explanation
  from grammar_questions where id = p_question_id
$$;

revoke all on function public.dap_an_va_giai_thich(bigint) from public, anon;
grant execute on function public.dap_an_va_giai_thich(bigint) to authenticated;
