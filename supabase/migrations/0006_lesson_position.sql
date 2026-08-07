-- Lat 1b: nguoi hoc di het 135 item cua mot buoi. Vi tri phai do SERVER giu,
-- khong phai trinh duyet — dong tab, doi may, hay mo lai sau ba ngay deu phai
-- ve dung cho dang do.
--
-- final_correct dem so cau dung trong 15 item chot buoi. 120 item dau la luyen
-- tap (co phan hoi ngay, khong tinh diem); chi 15 item chot moi la do luong.
-- Diem cua buoi = round(final_correct / 15 * 100).

alter table user_lesson_progress
  add column if not exists position      int not null default 0,
  add column if not exists final_correct int not null default 0;

-- position chay 0..135; bang 135 nghia la da xong het item.
alter table user_lesson_progress
  drop constraint if exists user_lesson_progress_position_range;
alter table user_lesson_progress
  add constraint user_lesson_progress_position_range
  check (position between 0 and 135);

alter table user_lesson_progress
  drop constraint if exists user_lesson_progress_final_correct_range;
alter table user_lesson_progress
  add constraint user_lesson_progress_final_correct_range
  check (final_correct between 0 and 15);

-- Server Action can doc dap an de cham bai, nhung 0004_rls.sql:41-48 da thu hoi
-- hai cot do khoi `authenticated`, va SUPABASE_SERVICE_ROLE_KEY khong duoc phep
-- len Vercel — ma Server Action thi chay tren Vercel.
--
-- Ham security definer la duong hop le duy nhat: no chay bang quyen chu so huu
-- va tra ve DUNG MOT chuoi dap an cho DUNG MOT item, khong mo lai ca cot cho ai.

create or replace function public.answer_for_word(p_word_id bigint)
returns text
language sql
security definer
set search_path = public, pg_temp
as $$ select blank_answer from vocab_words where id = p_word_id $$;

create or replace function public.answer_for_question(p_question_id bigint)
returns text
language sql
security definer
set search_path = public, pg_temp
as $$
  select (options ->> (ascii(answer) - ascii('A')))
  from grammar_questions where id = p_question_id
$$;

revoke all on function public.answer_for_word(bigint) from public, anon;
revoke all on function public.answer_for_question(bigint) from public, anon;
grant execute on function public.answer_for_word(bigint) to authenticated;
grant execute on function public.answer_for_question(bigint) to authenticated;
