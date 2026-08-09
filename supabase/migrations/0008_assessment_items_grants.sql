-- 0004_rls.sql dong ro ri dap an tren vocab_words va grammar_questions bang
-- column-level revoke/grant, vi RLS chi loc theo DONG, con dap an nam trong
-- COT. assessment_items cung co RLS (0004_rls.sql, policy own_items) nhung
-- CHUA co grant cot nao, nen `authenticated` van giu quyen mac dinh doc het
-- moi cot, ke ca is_correct.
--
-- `@supabase/ssr` ghi cookie phien voi httpOnly: false, nen mot nguoi hoc doc
-- duoc JWT cua chinh minh tu document.cookie va goi thang PostgREST:
--
--   GET /rest/v1/assessment_items?assessment_id=eq.N&select=position,is_correct
--
-- cho dung bai dang do cua ho — lay lai chinh xac diem dung/sai tung cau ma
-- ca lat nay cong suc de giu kin. Vi RLS policy own_items cho phep doc dong
-- cua chinh minh (dung), nen day khong phai loi RLS — la loi thieu grant cot.
--
-- KHONG the don gian revoke select(is_correct) roi xong: answerItem va
-- finalize (src/lib/assessment/run.ts) doc/ghi is_correct QUA CHINH client
-- cua nguoi hoc (server dong vai nguoi dung, khong dung service role):
--   - answerItem ghi is_correct khi cham tung cau (run.ts ~225, ~237)
--   - finalize dien is_correct = false cho cau bo trong bang mot UPDATE co
--     WHERE is_correct IS NULL, roi SELECT is_correct de dem tong/dung
--   - remedialSpecs loc dung nhung cau `is_correct = false` cua lan thu cha
-- Mot WHERE tren mot cot can quyen SELECT tren chinh cot do — revoke thang se
-- lam vo ca ba duong nay.
--
-- Giai phap: doi PHAN DOC sang hai ham `security definer`, dung tien le da co
-- cua chinh file nay (answer_for_word, answer_for_question o
-- 0006_lesson_position.sql), roi moi revoke select(is_correct). PHAN GHI
-- (answerItem cham diem tung cau) GIU NGUYEN qua client thuong — xem ghi chu
-- o cuoi file ve pham vi co y bo qua.
--
-- Tep RIENG, KHONG noi vao 0007: 0007 da duoc dan mot phan len dashboard va
-- se duoc dan lai NGUYEN CA TEP luc chot lat — noi them vao do de lam mot
-- migration ap dung MOT LAN roi thanh hai nguon that khac nhau ve cung mot
-- schema.

-- 1. Dong bang cham diem + tra tong/dung cho MOT bai. Gom ca backfill
--    (dien is_correct = false cho cau bo trong) VA dem trong CUNG mot ham vi
--    ca hai deu can SELECT is_correct — tach lam hai ham thi ham thu hai vao
--    ngay sau khi backfill van phai la security definer, khong loi gi hon.
--
--    Kiem tra chu so huu BEN TRONG ham la hang rao THAT DUY NHAT: security
--    definer chay bang quyen chu bang (bo qua RLS), nen thieu dieu kien nay
--    la mot nguoi hoc bat ky finalize duoc bai cua nguoi khac.
create or replace function public.finalize_assessment_items(p_assessment_id bigint)
returns table(total int, correct int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from assessments a
    where a.id = p_assessment_id and a.user_id = auth.uid()
  ) then
    raise exception 'khong co quyen tren bai danh gia %', p_assessment_id
      using errcode = '42501';
  end if;

  update assessment_items
     set is_correct = false
   where assessment_id = p_assessment_id
     and is_correct is null;

  return query
    select count(*)::int as total,
           count(*) filter (where is_correct)::int as correct
      from assessment_items
     where assessment_id = p_assessment_id;
end;
$$;

-- 2. Cau da sai cua LAN THU CHA, de dung bai bo tuc (spec muc 5.3). Tra ve
--    dung nhung cot buildRemedialItems can (position, item_type, ref_id,
--    payload) — KHONG tra is_correct: goi biet duoc mot cau nam trong ket qua
--    nay tuc no da sai, nhung do la thong tin dung "bai bo tuc gom nhung cau
--    nao" ma ban than assessment bo tuc da cong khai cho nguoi hoc, khong
--    phai kenh do dap an ma migration nay dong.
create or replace function public.wrong_items_for_assessment(p_assessment_id bigint)
returns table(position int, item_type text, ref_id bigint, payload jsonb)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from assessments a
    where a.id = p_assessment_id and a.user_id = auth.uid()
  ) then
    raise exception 'khong co quyen tren bai danh gia %', p_assessment_id
      using errcode = '42501';
  end if;

  return query
    select ai.position, ai.item_type, ai.ref_id, ai.payload
      from assessment_items ai
     where ai.assessment_id = p_assessment_id
       and ai.is_correct = false
     order by ai.position;
end;
$$;

revoke all on function public.finalize_assessment_items(bigint) from public, anon;
revoke all on function public.wrong_items_for_assessment(bigint) from public, anon;
grant execute on function public.finalize_assessment_items(bigint) to authenticated;
grant execute on function public.wrong_items_for_assessment(bigint) to authenticated;

-- 3. Chan kenh doc: chi thu hoi SELECT tren MOT cot is_correct, khong dung
--    "revoke all; grant select (danh sach cot)" nhu 0004_rls.sql da lam cho
--    vocab_words/grammar_questions — assessment_items con can INSERT/UPDATE
--    tren moi cot khac (startAssessment chen ca dong, answerItem ghi
--    user_answer/is_correct) va lam lai toan bo danh sach quyen o day de
--    long ghep dung mot cot se de sot mot quyen nao do ma khong ai nhan ra.
--
--    is_correct VAN GHI DUOC (khong revoke update/insert) — xem ghi chu duoi.
revoke select (is_correct) on assessment_items from authenticated;
revoke select (is_correct) on assessment_items from anon;

-- PHAM VI CO Y BO QUA, GHI LAI DE KHONG DOC NHAM LA THIEU SOT: is_correct VAN
-- GHI duoc boi `authenticated` (khong revoke update/insert). Mot nguoi hoc VAN
-- co the PATCH is_correct=true de tu lam gia mot bai da qua — nhung do la tu
-- lua doi chinh minh, khong lam lo thong tin cho ai. Con DOC is_correct moi la
-- kenh do ra dap an that (goi lien tuc voi cac dap an khac nhau, so is_correct
-- tra ve). Dong ca chieu ghi nghia la chuyen finalize xuong SQL toan bo — qua
-- muc so voi loai rui ro dang xu ly o day.
