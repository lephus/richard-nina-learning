-- Loi dang sua: `finalize` (src/lib/assessment/run.ts) dong bai bang RPC
-- `finalize_assessment_items` (status -> 'submitted') ROI MOI ghi
-- score/passed/submitted_at bang mot UPDATE RIENG, hai luot round-trip tach
-- doi. Neu request dut GIUA hai luot do (function timeout, mat ket noi, mot
-- lan deploy roi dung luc) — RPC da commit, UPDATE diem thi khong — dong do
-- mac ket vinh vien o status='submitted', score=NULL. `nextStep` chi tra
-- 'close-expired' cho dong 'in_progress'; mot dong TREO la 'submitted' voi
-- passed=null nen roi thang xuong nhanh "bat dau bo tuc" — nguoi hoc dat
-- 22/25 bi ghi la truot va bi day vao bai bo tuc ho khong he truot.
--
-- Cach sua: khong con hai luot ghi de rach o giua. Ham nhan them nguong dat
-- va moc thoi gian, TU CHAM VA DONG BAI trong DUNG MOT cau UPDATE. Khong con
-- trang thai trung gian nao quan sat duoc tu ben ngoai — hoac bai van
-- 'in_progress' (chua nop/chua het han), hoac da 'submitted' VOI DU ca
-- score/passed/submitted_at cung luc.
--
-- CHU KY DOI (them p_pass_mark, p_now; RETURNS TABLE them score, passed) nen
-- `create or replace` se bao loi "cannot change return type of existing
-- function" — DA KIEM BANG CACH CHAY THAT, khong doan suong: phai drop ham cu
-- (chu ky mot tham so) truoc khi tao lai.
drop function if exists public.finalize_assessment_items(bigint);

-- Dong bang cham diem, DEM, TINH DIEM, VA DONG BAI cho MOT bai — TAT CA trong
-- MOT cau UPDATE duy nhat o buoc 7 ben duoi. Van la ham `security definer` vi
-- ly do cu (0008_assessment_items_grants.sql): is_correct da bi thu hoi
-- SELECT khoi `authenticated`, backfill/dem can doc duoc cot do.
--
-- p_pass_mark VA p_now truyen tu TypeScript, khong hardcode trong SQL:
-- PASS_MARK theo tung loai bai (review/test/remedial) van chi dinh nghia MOT
-- noi duy nhat, trong run.ts — ham nay khong biet nguong cua tung loai bai,
-- no chi SO SANH score da tinh voi nguong duoc dua vao. p_now thay `now()`
-- cua Postgres vi CA UNG DUNG deu doc dong ho o SERVER TRUYEN VAO (spec muc
-- 6.2, xem comment dau run.ts) — khong bao gio hoi Postgres bay gio la may
-- gio de tranh mot nguon thoi gian thu hai lech voi nguon da dung o moi noi
-- khac trong he thong.
create or replace function public.finalize_assessment_items(
  p_assessment_id bigint,
  p_pass_mark     int,
  p_now           timestamptz
)
returns table(total int, correct int, score int, passed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status  assessment_status;
  v_score   int;
  v_passed  boolean;
  v_total   int;
  v_correct int;
  v_updated int;
begin
  -- 1. Kiem chu so huu BEN TRONG ham la hang rao THAT DUY NHAT: security
  --    definer chay bang quyen chu bang, bo qua RLS hoan toan. Thieu dieu
  --    kien nay la mot nguoi hoc bat ky finalize duoc bai cua nguoi khac.
  if not exists (
    select 1 from assessments a
    where a.id = p_assessment_id and a.user_id = auth.uid()
  ) then
    raise exception 'khong co quyen tren bai danh gia %', p_assessment_id
      using errcode = '42501';
  end if;

  select a.status, a.score, a.passed
    into v_status, v_score, v_passed
    from assessments a
   where a.id = p_assessment_id;

  -- 2. Da nop THAT SU roi (co diem luu, khong chi status='submitted') — duong
  --    nop hai lan, phai bat bien: khong ghi gi them, tra dung gia tri da
  --    luu. Dieu kien nay dung DUY NHAT diem luu (khong con "status =
  --    submitted" don le) vi budoc 7 duoi day khong con co the tao ra mot
  --    dong 'submitted' ma score con NULL nua — hai gia tri do luon di cung
  --    nhau trong CHINH mot cau UPDATE, nen "score khac null" va "da nop that
  --    su" gio la MOT dieu kien, khong phai hai.
  if v_status = 'submitted' and v_score is not null then
    select count(*)::int, count(*) filter (where ai.is_correct)::int
      into v_total, v_correct
      from assessment_items ai
     where ai.assessment_id = p_assessment_id;
    return query select v_total, v_correct, v_score, v_passed;
    return;
  end if;

  -- 3. Dien is_correct = false cho moi cau con bo trong (null) — luat "cau
  --    chua lam tinh sai" (spec muc 6.2) phai dung TRONG DU LIEU, khong chi
  --    trong phep chia tinh diem o buoc 6. user_answer CO Y giu nguyen NULL
  --    (khong dung toi cot nay): no la thu duy nhat con phan biet "bo trong"
  --    voi "tra loi sai" khi xem lai bai.
  update assessment_items
     set is_correct = false
   where assessment_id = p_assessment_id
     and is_correct is null;

  -- 4. Dem tong/dung TU CHINH cac dong is_correct — mot nguon su that duy
  --    nhat, khong co bo dem rieng nao de troi lech (spec muc 6.3).
  select count(*)::int, count(*) filter (where ai.is_correct)::int
    into v_total, v_correct
    from assessment_items ai
   where ai.assessment_id = p_assessment_id;

  -- 5. Bai 0 cau: NEM NGAY, KHONG dong bai — de dong nam lai 'in_progress'
  --    cho mot lan goi sau con cuu duoc. Day la diem KHAC ban cu: ban cu dong
  --    bai (RPC cu doi status truoc) roi TypeScript moi nem, tao ra mot dong
  --    'submitted' vinh vien khong bao gio cham lai duoc (khong con gi de
  --    tinh diem). `startAssessment` da chan khong cho bai rong ra doi; toi
  --    day duoc thi co gi do hong that (tien trinh chet giua hai luot ghi cua
  --    startAssessment, xem deleteEmptyAssessment o run.ts).
  if v_total = 0 then
    raise exception 'bai % khong co cau nao - khong cham duoc', p_assessment_id;
  end if;

  -- 6. Tinh diem (phan tram) va ket luan dat/truot. round() cua Postgres
  --    tren numeric duong lam tron nua-len (half away from zero), cung huong
  --    voi Math.round() cua JavaScript ma ham nay thay the — hai ben khong
  --    lech nhau o cac gia tri .5.
  v_score  := round((v_correct::numeric * 100) / v_total)::int;
  v_passed := v_score >= p_pass_mark;

  -- 7. DONG BAI BANG MOT UPDATE DUY NHAT — status, score, passed,
  --    submitted_at cung mot cau lenh, khong con hai luot round-trip tach
  --    doi nhu ban cu. CAS ngay trong WHERE (`status = 'in_progress'`): dong
  --    da 'submitted' (do mot finalize khac vua thang, hoac do mot dong treo
  --    cu tu ban TRUOC migration nay) se khop 0 dong o day, khong ghi de len
  --    ket qua da co.
  update assessments
     set status       = 'submitted',
         score        = v_score,
         passed       = v_passed,
         submitted_at = p_now
   where id = p_assessment_id
     and status = 'in_progress';
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    -- Thua CAS: mot finalize khac (hai request finalize chay DONG THOI tren
    -- cung mot bai) da dong bai truoc, ngay TRONG chinh giao dich cua no —
    -- UPDATE cua ho da khoa dong nay, giao dich nay bi chan cho toi khi ho
    -- commit, roi moi doc lai duoc gia tri MOI. Doc lai gia tri ho da ghi va
    -- tra ve, KHONG nem loi: hai finalize chay dong thoi tren cung mot bai
    -- phai cho ra CUNG mot ket qua, khong phai mot ben thanh cong mot ben
    -- loi.
    select a.score, a.passed
      into v_score, v_passed
      from assessments a
     where a.id = p_assessment_id;
  end if;

  -- 8. Tra total/correct da dem o buoc 4 (dung cho ca hai nhanh thang/thua
  --    CAS — du lieu items khong doi giua hai buoc, boi finalize khong con
  --    nhan cau tra loi nao sau khi da roi khoi 'in_progress') cung
  --    score/passed vua chot (tu chinh giao dich nay hoac doc lai tu nguoi
  --    thang cuoc).
  return query select v_total, v_correct, v_score, v_passed;
end;
$$;

revoke all on function public.finalize_assessment_items(bigint, int, timestamptz) from public, anon;
grant execute on function public.finalize_assessment_items(bigint, int, timestamptz) to authenticated;
