-- 1. Bang trang thai nguoi dung: chi chu so huu doc/ghi duoc
alter table profiles             enable row level security;
alter table user_lesson_progress enable row level security;
alter table word_mastery         enable row level security;
alter table grammar_mastery      enable row level security;
alter table assessments          enable row level security;
alter table assessment_items     enable row level security;

create policy own_profile  on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy own_progress on user_lesson_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_wmastery on word_mastery
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_gmastery on grammar_mastery
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_assess   on assessments
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy own_items on assessment_items for all
  using (exists (select 1 from assessments a
                 where a.id = assessment_items.assessment_id and a.user_id = auth.uid()))
  with check (exists (select 1 from assessments a
                      where a.id = assessment_items.assessment_id and a.user_id = auth.uid()));

-- 2. Bang noi dung: ai dang nhap cung doc duoc
alter table vocab_words       enable row level security;
alter table grammar_lessons   enable row level security;
alter table grammar_questions enable row level security;
alter table lessons           enable row level security;
alter table lesson_words      enable row level security;

create policy read_vocab   on vocab_words       for select to authenticated using (true);
create policy read_glesson on grammar_lessons   for select to authenticated using (true);
create policy read_gq      on grammar_questions for select to authenticated using (true);
create policy read_lessons on lessons           for select to authenticated using (true);
create policy read_lwords  on lesson_words      for select to authenticated using (true);

-- 3. CHAN RO RI DAP AN bang quyen cap cot cua Postgres.
--    RLS loc theo DONG; day la thu duy nhat loc duoc theo COT.
revoke all on vocab_words from authenticated;
grant select (id, ordinal, word, pos, ipa, meaning_vi, definition_en,
              definition_vi, synonyms, example_en, example_vi)
  on vocab_words to authenticated;   -- blank_answer KHONG nam trong danh sach

revoke all on grammar_questions from authenticated;
grant select (id, lesson_id, stem, options)
  on grammar_questions to authenticated;  -- answer, explanation chi server doc

-- 4. Vai tro `anon` (khach chua dang nhap) PHAI duoc thu hep giong het `authenticated`.
--    Supabase mac dinh cap cho `anon` toan quyen tren moi cot cua moi bang, ke ca
--    vocab_words.blank_answer va grammar_questions.answer. Hien chua khai thac duoc
--    vi khong policy nao cho `anon` thay dong nao nen RLS loc sach (200 []). Nhung
--    day la BAY NGAM: chi can sau nay ai do them tinh nang "xem thu khong can dang
--    nhap" va tao mot policy select cho `anon`, hai cot dap an lo ngay lap tuc ma
--    khong con hang rao nao chan, vi quyen cap cot la thu DUY NHAT loc duoc theo
--    cot, va no chua duoc dung cho `anon`. Vi vay revoke/grant nay phai lam DOI XUNG
--    voi phan da lam cho `authenticated` o tren, dung doi rang RLS (loc theo dong)
--    se tu dong bao ve cot -- hai co che nay doc lap voi nhau.
revoke all on vocab_words from anon;
grant select (id, ordinal, word, pos, ipa, meaning_vi, definition_en,
              definition_vi, synonyms, example_en, example_vi)
  on vocab_words to anon;   -- blank_answer KHONG nam trong danh sach

revoke all on grammar_questions from anon;
grant select (id, lesson_id, stem, options)
  on grammar_questions to anon;  -- answer, explanation khong cap cho anon

-- Thu hoi them insert/update/delete cua `anon` tren cac bang noi dung con lai,
-- de sau nay neu co policy cho `anon` doc duoc thi khach van khong sua duoc de bai.
revoke all on grammar_lessons from anon;
grant select on grammar_lessons to anon;

revoke all on lessons from anon;
grant select on lessons to anon;

revoke all on lesson_words from anon;
grant select on lesson_words to anon;
