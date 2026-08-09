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
-- 0006_lesson_position.sql), roi moi thu hoi quyen doc tren client thuong.
-- PHAN GHI (answerItem cham diem tung cau) GIU NGUYEN qua client thuong — xem
-- ghi chu o cuoi file ve pham vi co y bo qua.
--
-- Tep RIENG, KHONG noi vao 0007: 0007 da duoc dan mot phan len dashboard va
-- se duoc dan lai NGUYEN CA TEP luc chot lat — noi them vao do de lam mot
-- migration ap dung MOT LAN roi thanh hai nguon that khac nhau ve cung mot
-- schema.
--
-- DA CHAY THAT tren PostgreSQL 16.11 cuc bo (Postgres.app), voi role/grant/RLS
-- mo phong dung Supabase (xem task-9-report.md phan "Xac minh that"): tep nay
-- chay sach tu dau den cuoi, dan lai lan hai idempotent, ba kieu tan cong doc
-- deu bi tu choi, va moi duong doc/ghi con lai trong src/ van chay dung duoi
-- quyen moi.

-- 1. Dong bang cham diem + tra tong/dung cho MOT bai. Gom ca backfill
--    (dien is_correct = false cho cau bo trong), dem, VA DONG BAI (chuyen
--    status khoi 'in_progress') trong CUNG mot ham:
--      - backfill+dem can SELECT is_correct, nen phai o trong ham security
--        definer nhu da giai thich o tren.
--      - DONG BAI ngay tai day (khong doi TypeScript goi them mot buoc rieng)
--        la phan sua cho mot lo hong thu hai: neu ham nay CHI backfill+dem ma
--        khong dong bai, no tro thanh mot oracle cham diem — goi lai sau MOI
--        cau tra loi (answerItem van nhan cau tra loi vi bai con
--        'in_progress') se lo dan correct/total, dò duoc ca bai kiem tra 60
--        cau ma khong can biet dap an that. Doi status ngay trong CUNG cau
--        UPDATE nay khien lan goi DAU TIEN (hop le hay khong) la lan CUOI
--        answerItem con nhan cau tra loi (dieu kien `status = 'in_progress'`
--        o run.ts) — goi ham nay giua bai chi tuong duong bam "Nop bai" som,
--        khong lo them gi ca.
--
--    CAS ngay trong WHERE (`status = 'in_progress'`): goi lai ham nay bao
--    nhieu lan cung chi doi duoc DUNG MOT lan; tu lan thu hai UPDATE nay khop
--    0 dong, khong lam gi them (backfill/dem van chay, nhung idempotent — moi
--    dong da co is_correct tu lan dau).
--
--    Kiem tra chu so huu BEN TRONG ham la hang rao THAT DUY NHAT: security
--    definer chay bang quyen chu bang (bo qua RLS), nen thieu dieu kien nay
--    la mot nguoi hoc bat ky finalize duoc bai cua nguoi khac.
--
--    Diem so (score, so sanh voi PASS_MARK theo type) VAN o TypeScript — ham
--    nay chi tra tong/dung da dem san, khong tinh phan tram hay ket luan
--    dat/truot. TypeScript (run.ts) doc total/correct, tu tinh score, roi ghi
--    score/passed/submitted_at bang MOT UPDATE rieng co dieu kien
--    `score is null` — CAS thay cho `status <> 'submitted'` cu, vi luc nay
--    status da bi ham nay doi truoc do roi (xem comment trong run.ts).
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

  update assessments
     set status = 'submitted'
   where id = p_assessment_id
     and status = 'in_progress';

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
--
--    "position" phai QUOTE trong RETURNS TABLE: no la mot COL_NAME_KEYWORD
--    trong grammar cua Postgres, va danh sach cot cua RETURNS TABLE di qua
--    production `param_name -> type_function_name`, loai tru chinh lop tu
--    khoa do. Khong quote thi CREATE FUNCTION bao "syntax error at or near
--    position" va ham khong bao gio duoc tao — REVOKE/GRANT execute ben duoi
--    theo do cung loi "function ... does not exist", nghia la ca hai RPC
--    trong tep coi nhu khong ton tai va MOI bai bo tuc that bai vinh vien voi
--    "Could not find the function" (da do that truoc khi sua — xem
--    task-9-report.md). Cac tham chieu `ai.position`/`order by ai.position`
--    trong than ham KHONG can quote — do la truy cap qua alias bang, khac voi
--    khai bao ten cot dau ra.
--
--    DIEU KIEN `a.status <> 'in_progress'` la hang rao thu hai, doc lap voi
--    chu so huu: ham nay chi hop le tren mot LAN THU CHA DA CHAM (dung de
--    dung bai bo tuc sau khi da truot), khong bao gio hop le giua chung mot
--    bai dang lam — thieu dieu kien nay, goi lai sau moi cau tra loi TRONG
--    LUC dang lam se lo ngay item nao vua sai ma khong can biet dap an, dung
--    kieu oracle nhu finalize_assessment_items da mo ta o tren. Dung
--    `<> 'in_progress'` thay vi `= 'submitted'`: kiem tra lai run.ts xac nhan
--    HIEN TAI finalize() chi bao gio ghi 'submitted' (khong co duong nao ghi
--    'expired' — enum con gia tri do nhung chua co cot code nao dat no), nen
--    hai dieu kien tuong duong o thoi diem nay; chon `<> 'in_progress'` vi no
--    van dung ca khi mot duong ghi 'expired' xuat hien sau nay, khong phai
--    doan truoc moi truong hop cho hien tai.
create or replace function public.wrong_items_for_assessment(p_assessment_id bigint)
returns table("position" int, item_type text, ref_id bigint, payload jsonb)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from assessments a
    where a.id = p_assessment_id
      and a.user_id = auth.uid()
      and a.status <> 'in_progress'
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

-- 3. Chan kenh doc. Ban dau tep nay chi `revoke select (is_correct)`, dua
--    tren gia dinh SAI la `authenticated` da co san mot grant cot (giong
--    vocab_words/grammar_questions o 0004). Thuc te KHONG PHAI vay:
--    assessment_items chua tung duoc grant theo cot — `authenticated` dang
--    giu quyen SELECT o CAP BANG (tu `grant all on all tables in schema
--    public` luc Supabase khoi tao du an). Postgres CHI kiem attacl (quyen
--    theo cot) cho NHUNG BIT quyen CHUA duoc thoa o cap bang; SELECT da thoa
--    o cap bang thi attacl tren tung cot khong bao gio duoc doc toi.
--    `revoke select (is_correct) on ... from authenticated` trong truong hop
--    do la MOT CAU LENH THANH CONG NHUNG KHONG LAM GI CA — khong loi, khong
--    canh bao, relacl khong doi — va is_correct van doc duoc nguyen ven qua
--    client thuong. Da do that: paste ban dau se de ke ho item 5 dinh dong
--    mo nguyen, khong mot dau hieu nao bao cho nguoi van hanh biet.
--
--    Cach dung DUY NHAT (va la cach 0004_rls.sql da dung cho vocab_words/
--    grammar_questions): REVOKE ALL o cap bang truoc, roi GRANT lai tung
--    quyen mot cach tuong minh — SELECT chi tren danh sach cot duoc phep,
--    INSERT nguyen bang (startAssessment chen ca dong), UPDATE chi tren hai
--    cot con duoc phep sua (user_answer, is_correct). Danh sach SELECT duoi
--    day gom moi cot ma mot noi nao do trong src/ dang doc HOAC dung lam dieu
--    kien WHERE/eq — thieu mot cot trong danh sach nay se lam chinh truy van
--    hop le do bao "permission denied", vi mot WHERE tren mot cot cung can
--    quyen SELECT tren cot do:
--      id            — answerItem doc de lay item, CAS update .eq("id", ...)
--      assessment_id — moi truy van deu loc .eq("assessment_id", ...)
--      position      — answerItem .eq("position", ...); trang lam bai doc de hien
--      item_type     — answerItem doc de biet nhanh cham (vocab/grammar)
--      ref_id        — answerItem doc de tra cuu dap an that
--      payload       — answerItem + trang lam bai doc de hien cau hoi
--      user_answer   — CAS `.is("user_answer", null)`; trang lam bai doc de hien lai
--    `anon` KHONG duoc grant lai gi ca (khac vocab_words/grammar_questions —
--    hai bang do la noi dung cong khai sau dang nhap, con assessment_items la
--    du lieu rieng cua nguoi hoc, khong co ly do nghiep vu nao de anon cham
--    toi, nen thu hoi trang la dung, khong can doi xung mot grant rong).
revoke all on assessment_items from authenticated, anon;

grant select (id, assessment_id, position, item_type, ref_id, payload, user_answer)
  on assessment_items to authenticated;
grant insert on assessment_items to authenticated;
grant update (user_answer, is_correct) on assessment_items to authenticated;

-- PHAM VI CHINH XAC CUA MIGRATION NAY, GHI LAI DE KHONG DOC NHAM THANH RONG
-- HON THUC TE: migration nay CHI dong KENH DOC is_correct qua assessment_items
-- (PostgREST + backfill, ket hop dieu kien dong bai o
-- finalize_assessment_items/wrong_items_for_assessment o tren) — KHONG phai
-- "kenh dung/sai" noi chung cua ca nhanh 1c. Nhanh nay BIET va CHAP NHAN CO Y
-- THUC con lai ba duong sau, deu VAN CON MO sau migration nay:
--
--   1. is_correct VAN GHI duoc boi `authenticated` (co trong grant update o
--      tren). Mot nguoi hoc VAN co the PATCH is_correct=true de tu lam gia
--      mot bai da qua — nhung do la tu lua doi chinh minh, khong lam lo
--      thong tin cho ai.
--   2. Migration nay KHONG dung tren assessments, user_lesson_progress,
--      word_mastery, hay grammar_mastery — moi policy RLS tren bon bang do
--      van la FOR ALL (doc lan ghi deu qua policy chu khong qua grant cot
--      rieng), va `@supabase/ssr` ghi cookie phien voi httpOnly: false (JWT
--      cua chinh nguoi hoc doc duoc tu document.cookie). Goi thang PostgREST
--      bang JWT do, mot nguoi hoc PATCH duoc assessments?id=eq.N de tu dat
--      passed=true, hoac dat mot dong user_lesson_progress thanh 'completed'.
--      FOR ALL cung bao gom DELETE: goi thang
--      DELETE /rest/v1/assessments?id=eq.N xoa duoc BAT KY bai nao cua chinh
--      minh, ke ca mot bai kiem tra dang lam dang khoa cung con nguyen gio.
--      Nhanh nay o tang ung dung (deleteEmptyAssessmentAction,
--      src/app/(app)/assessment/[id]/actions.ts, qua ham
--      deleteEmptyAssessment o run.ts) da tu gioi han duong xoa cua CHINH NO
--      chi con dung bai `in_progress` VA 0 cau hoi — nhung do la mot hang rao
--      cua ung dung, khong phai cua database; kenh PostgREST tho van mo y
--      nguyen cho MOI dong cua bang assessments, khong rieng dong 0 cau.
--   3. `applyMastery` (goi trong answerItem, src/lib/assessment/run.ts) cong
--      word_mastery.correct_count ngay o LUOT GHI DAU TIEN cua moi cau, va
--      assessment_items.ref_id van con SELECT trong grant o tren — nen doc
--      word_mastery?word_id=eq.<ref_id> NGAY GIUA bai lam la biet duoc luot
--      tra loi dau cho tu do dung hay sai. Mot kenh do khac, khong di qua
--      is_correct chut nao, nen khong nam trong pham vi migration nay dong.
--
-- Muc 1 va 3 la TU LUA DOI BAN THAN — khong lam lo thong tin cho NGUOI KHAC.
-- Rieng phan DELETE o muc 2 KHAC LOAI: no khong lo thong tin cho ai, nhung no
-- VO HIEU HOA THAT SU mot rang buoc thoi gian (khoa cung 60 phut cua bai
-- kiem tra) va bo qua duoc mot buoc bat buoc (vong bo tuc) neu ai do goi
-- DELETE tho thay vi di qua ung dung. Van CHAP NHAN CO Y THUC, khong revoke
-- them o migration nay, vi ba ly do: (a) day khong phai mot nang luc MOI —
-- FOR ALL tren assessments co tu 0003_user_state.sql, truoc ca lat 1c; (b)
-- tang ung dung da tu chan duong nay cho chinh luong nghiep vu cua no (xem
-- tren); (c) dong ca chieu ghi tren bon bang do (chuyen moi lan ghi sang RPC
-- security definer rieng, bo FOR ALL) la qua muc so voi loai rui ro dang xu
-- ly o day, va se la mot lat rieng neu can.
