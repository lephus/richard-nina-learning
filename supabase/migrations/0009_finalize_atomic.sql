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
-- KHANG DINH TREN LA MOT BAT BIEN, KHONG PHAI MOT NIEM TIN: vong review sau
-- ban dau tung dau tay duoc mot loi goi voi p_pass_mark/p_now la NULL (chu
-- so huu that goi tren bai cua chinh minh) lam `v_passed` thanh NULL roi ghi
-- thang vao UPDATE — ket qua la mot dong 'submitted' voi `score` la SO THAT
-- nhung `passed` la NULL, dung hinh dang loi ma migration nay dung ra de xoa,
-- tai sinh xuyen qua chinh ham duoc viet de dong no lai. Buoc 2 trong than
-- ham (bao ve tham so, nem 22004 neu p_pass_mark/p_now la NULL) la hang rao
-- da them de khang dinh o tren LA THAT, khong chi la dung y — xem buoc do.
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

  -- 2. Bao ve tham so — them sau vong review: mot loi goi truyen p_pass_mark
  --    hoac p_now la NULL (vi du mot bug o TypeScript, PASS_MARK[type] tra ve
  --    gia tri la) truoc day se khong bi chan o dau ca. `v_score >= NULL`
  --    tinh ra NULL, chay thang vao UPDATE o buoc 8, ghi `passed = NULL` vao
  --    mot bai VUA 'submitted' voi `score` van la mot so THAT (vi
  --    v_correct/v_total luon la so). Dieu kien "da nop that su" o buoc 3
  --    chi xet `score is not null` — dong nay THOA dieu kien do, nen KHONG
  --    lan goi lai nao con sua duoc `passed = NULL`: dung HINH DANG loi ma ca
  --    task nay dung ra de xoa (nextStep doc `passed <> true` thanh truot
  --    vinh vien), tai sinh xuyen qua chinh ham duoc viet de dong no lai.
  --    Nem NGAY O DAY — truoc bat ky doc/ghi nao khac — la cach duy nhat dam
  --    bao mot loi o tang goi khong bao gio lot duoc vao du lieu duoi dang
  --    mot NULL nam im trong cot khong-null-ve-mat-logic.
  if p_pass_mark is null or p_now is null then
    raise exception 'p_pass_mark va p_now khong duoc NULL (bai %)', p_assessment_id
      using errcode = '22004';
  end if;

  select a.status, a.score, a.passed
    into v_status, v_score, v_passed
    from assessments a
   where a.id = p_assessment_id;

  -- 3. Da nop THAT SU roi (co diem luu, khong chi status='submitted') — duong
  --    nop hai lan, phai bat bien: khong ghi gi them, tra dung gia tri da
  --    luu. Dieu kien nay dung DUY NHAT diem luu (khong con "status =
  --    submitted" don le) vi buoc 8 duoi day khong con co the tao ra mot
  --    dong 'submitted' ma score con NULL nua — hai gia tri do luon di cung
  --    nhau trong CHINH mot cau UPDATE, nen "score khac null" va "da nop that
  --    su" gio la MOT dieu kien, khong phai hai.
  --
  --    NGOAI LE CO Y THUC, KHONG con duong nao SINH RA nhung van co the DOC
  --    duoc: mot dong 'submitted' voi `score IS NULL` tu dung TRUOC khi
  --    migration nay ton tai (dong treo cua co che HAI-luot-ghi cu — xem dau
  --    file). Dieu kien tren khong khop dong do (score la NULL), nen no roi
  --    tiep xuong buoc 4-7, roi khop 0 dong o CAS buoc 8 (status da la
  --    'submitted' tu truoc, khong con 'in_progress'), va DOC LAI dung NULL
  --    da luu o buoc 8b — tra ve `(total, correct, NULL, NULL)`, KHONG nem
  --    loi, KHONG tu suy ra mot gia tri thay the. Day la danh doi CO CHU
  --    DICH: ham khong con co che "tu sua" dong treo kieu cu nua (CAS moi chi
  --    khop 'in_progress'), doi lay viec KHONG BAO GIO con sinh ra dong treo
  --    MOI. Pin hanh vi nay bang test — xem
  --    tests/assessment-items-grants.test.ts, muc (D).
  if v_status = 'submitted' and v_score is not null then
    select count(*)::int, count(*) filter (where ai.is_correct)::int
      into v_total, v_correct
      from assessment_items ai
     where ai.assessment_id = p_assessment_id;
    return query select v_total, v_correct, v_score, v_passed;
    return;
  end if;

  -- 4. Dien is_correct = false cho moi cau con bo trong (null) — luat "cau
  --    chua lam tinh sai" (spec muc 6.2) phai dung TRONG DU LIEU, khong chi
  --    trong phep chia tinh diem o buoc 7. user_answer CO Y giu nguyen NULL
  --    (khong dung toi cot nay): no la thu duy nhat con phan biet "bo trong"
  --    voi "tra loi sai" khi xem lai bai.
  update assessment_items
     set is_correct = false
   where assessment_id = p_assessment_id
     and is_correct is null;

  -- 5. Dem tong/dung TU CHINH cac dong is_correct — mot nguon su that duy
  --    nhat, khong co bo dem rieng nao de troi lech (spec muc 6.3).
  select count(*)::int, count(*) filter (where ai.is_correct)::int
    into v_total, v_correct
    from assessment_items ai
   where ai.assessment_id = p_assessment_id;

  -- 6. Bai 0 cau: NEM NGAY, KHONG dong bai — de dong nam lai 'in_progress'
  --    cho mot lan goi sau con cuu duoc. Day la diem KHAC ban cu: ban cu dong
  --    bai (RPC cu doi status truoc) roi TypeScript moi nem, tao ra mot dong
  --    'submitted' vinh vien khong bao gio cham lai duoc (khong con gi de
  --    tinh diem). `startAssessment` da chan khong cho bai rong ra doi; toi
  --    day duoc thi co gi do hong that (tien trinh chet giua hai luot ghi cua
  --    startAssessment, xem deleteEmptyAssessment o run.ts).
  if v_total = 0 then
    raise exception 'bai % khong co cau nao - khong cham duoc', p_assessment_id;
  end if;

  -- 7. Tinh diem (phan tram) va ket luan dat/truot. round() cua Postgres
  --    tren numeric duong lam tron nua-len (half away from zero), cung huong
  --    voi Math.round() cua JavaScript ma ham nay thay the — hai ben khong
  --    lech nhau o cac gia tri .5. p_pass_mark da duoc dam bao khong NULL o
  --    buoc 2, nen v_passed o day khong bao gio la NULL.
  v_score  := round((v_correct::numeric * 100) / v_total)::int;
  v_passed := v_score >= p_pass_mark;

  -- 8. DONG BAI BANG MOT UPDATE DUY NHAT — status, score, passed,
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
    -- 8b. Thua CAS: mot finalize khac (hai request finalize chay DONG THOI
    -- tren cung mot bai) da dong bai truoc, ngay TRONG chinh giao dich cua
    -- no — UPDATE cua ho da khoa dong nay, giao dich nay bi chan cho toi khi
    -- ho commit, roi moi doc lai duoc gia tri MOI. Doc lai gia tri ho da ghi
    -- va tra ve, KHONG nem loi: hai finalize chay dong thoi tren cung mot bai
    -- phai cho ra CUNG mot ket qua, khong phai mot ben thanh cong mot ben
    -- loi.
    --
    -- GIA DINH MUC CO LAP READ COMMITTED — day la mac dinh cua Postgres VA
    -- la muc PostgREST/Supabase dung cho MOI request, nen dung voi hanh vi
    -- thuc te se chay, nhung KHONG phai dung voi moi muc co lap: duoi READ
    -- COMMITTED, giao dich thua bi BLOCK o UPDATE buoc 8 cho toi khi giao
    -- dich thang COMMIT, roi CHINH cau UPDATE do tu danh gia lai WHERE tren
    -- du lieu MOI NHAT (khop 0 dong vi status da doi) — do la co che khien
    -- nhanh doc-lai nay chay toi duoc ma khong loi. Duoi REPEATABLE READ
    -- (khong dung o day, nhung se doi neu ai do doi muc co lap mac dinh cua
    -- ket noi), giao dich thua van bi block, nhung sau khi giao dich thang
    -- commit thi UPDATE cua no KHONG danh gia lai duoc tren snapshot cu cua
    -- no — Postgres nem `could not serialize access due to concurrent
    -- update` NGAY TAI UPDATE buoc 8, nhanh doc-lai nay khong bao gio chay
    -- toi. Da do that bang cach chay lai dung kich ban dua o REPEATABLE READ.
    select a.score, a.passed
      into v_score, v_passed
      from assessments a
     where a.id = p_assessment_id;
  end if;

  -- 9. Tra total/correct da dem o buoc 5 (dung cho ca hai nhanh thang/thua
  --    CAS — du lieu items khong doi giua hai buoc, boi finalize khong con
  --    nhan cau tra loi nao sau khi da roi khoi 'in_progress') cung
  --    score/passed vua chot (tu chinh giao dich nay hoac doc lai tu nguoi
  --    thang cuoc).
  return query select v_total, v_correct, v_score, v_passed;
end;
$$;

revoke all on function public.finalize_assessment_items(bigint, int, timestamptz) from public, anon;
grant execute on function public.finalize_assessment_items(bigint, int, timestamptz) to authenticated;
