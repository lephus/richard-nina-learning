-- Lat 2a: doi khung chuong trinh tu 35 slot khoa tuan tu sang 10 nhom hoc tu do.
-- Xem docs/superpowers/specs/2026-08-11-phase2-vocab-first-restructure-design.md
--
-- THU TU BAT BUOC: xoa het du lieu nguoi hoc TRUOC, roi moi dung lai enum.
-- PostgreSQL khong xoa duoc mot gia tri enum, nen phai tao type moi va chuyen
-- cot bang `using ...::text::...` — phep chuyen do NO ngay khi con mot dong
-- mang gia tri 'test' hay 'expired'. Chi an toan khi bang da rong.

-- Boc ca file trong MOT giao dich. Bon lenh `delete` o buoc 1 ngay duoi day
-- khong the lui lai duoc: neu bat ky lenh nao sau do trong file nay loi, ca
-- file phai cuon lai (rollback) het, khong duoc de mat du lieu roi dung nua
-- chung. Khong dua vao gia dinh cong cu chay file nay se tu mo giao dich thay
-- minh (vd SQL Editor cua Supabase lam vay) — do la thuoc tinh cua CONG CU,
-- khong phai cua FILE. Da chung minh hau qua that luc kiem idempotent cuc bo:
-- chay bang `psql -f` (khong truyen co `-1`) khien script dung giua chung, de
-- lai database dang do — mat chi so/constraint da drop, con enum `*_v2` treo
-- lai giua chung.
begin;

-- 1. Xoa sach tien do nguoi hoc. Giu auth.users va profiles.
delete from assessment_items;
delete from assessments;
delete from word_mastery;
delete from grammar_mastery;

-- 2. Bo dong ho khoa cung. Khong con bai thi nao bi gioi han thoi gian, nen
--    cot nay khong con nghia gi — de lai thi lan sau ai do se tin no.
alter table assessments drop column if exists expires_at;

-- 3. Hai chi so dung toi cot `status` phai bien mat TRUOC khi doi kieu cot,
--    roi dung lai y nguyen o buoc 5. Doi kieu mot cot dang co chi so phu
--    thuoc se bi tu choi.
--
--    SUA SO VOI BAN BRIEF GOC: them dong drop constraint duoi day. Phat hien
--    bang cach chay rieng file nay LAN HAI tren mot database da migrate mot
--    lan (buoc kiem idempotent) — lan dau bang rong nen chua co
--    assessments_grammar_scope (constraint nay chi duoc tao o buoc 6) luc
--    toi buoc 4 nen khong sao, nhung lan hai no da ton tai tu lan chay
--    truoc, va bieu thuc CHECK cua no khoa cung kieu assessment_type CU. Doi
--    kieu cot `type` sang assessment_type_v2 khi con constraint nay bi
--    Postgres tu choi thang: "operator does not exist: assessment_type_v2 =
--    assessment_type". Cung ly do voi hai chi so tren nen gop chung vao
--    buoc 3. Buoc 6 van tu drop lai constraint nay truoc khi add (da co san
--    if exists) nen dong duoi day khong doi hanh vi buoc 6, chi dam bao
--    constraint bien mat SOM hon, truoc khi buoc 4 doi kieu cot.
drop index if exists assessments_user_id_status_idx;
drop index if exists assessments_one_in_progress;
alter table assessments drop constraint if exists assessments_grammar_scope;

-- 4. Dung lai hai enum.
--    assessment_type: bo 'test' (bai 60 phut da bo), them 'lesson' (bai cuoi
--    buoi hoc, truoc day khong phai mot assessment) va 'grammar'.
create type assessment_type_v2 as enum ('lesson','review','remedial','grammar');
alter table assessments
  alter column type type assessment_type_v2 using type::text::assessment_type_v2;
drop type assessment_type;
alter type assessment_type_v2 rename to assessment_type;

--    assessment_status: bo 'expired'. Phai go default truoc roi dat lai sau —
--    default la mot bieu thuc mang KIEU CU, no chan phep doi kieu.
create type assessment_status_v2 as enum ('in_progress','submitted');
alter table assessments alter column status drop default;
alter table assessments
  alter column status type assessment_status_v2 using status::text::assessment_status_v2;
alter table assessments alter column status set default 'in_progress';
drop type assessment_status;
alter type assessment_status_v2 rename to assessment_status;

-- 5. Dung lai hai chi so da xoa o buoc 3, y nguyen dinh nghia cu.
--    Chi so duy nhat MOT PHAN giu bat bien "mot nguoi chi co MOT bai dang lam"
--    o tang database — xem giai thich day du tai 0007_assessment_parent.sql.
create index if not exists assessments_user_id_status_idx on assessments (user_id, status);
create unique index if not exists assessments_one_in_progress
  on assessments (user_id) where status = 'in_progress';

-- 6. Cot rieng cho bai ngu phap. KHONG nhet id bai ngu phap vao `scope int[]`:
--    scope dang mang ordinal buoi tu vung (1..20), con id bai ngu phap la mot
--    he so hoan toan khac. Tron hai he vao mot cot la loi khong bao, khong vo,
--    chi sai — va sai vao dung luc thong ke doc nham.
alter table assessments
  add column if not exists grammar_lesson_id bigint references grammar_lessons(id);
alter table assessments drop constraint if exists assessments_grammar_scope;
alter table assessments add constraint assessments_grammar_scope
  check ((type = 'grammar') = (grammar_lesson_id is not null));

-- 7. user_lesson_progress -> lesson_cursor.
--    Moi cot cu tru khoa chinh deu bi bo (status, score, completed_at,
--    position, final_correct): trang thai buoi nay SUY TU `assessments` chu
--    khong luu song song. Drop roi create, khong alter dan tung cot — va viec
--    do cung xoa luon cai bay da ghi chu ky trong lesson-status.ts: cot
--    `status` mac dinh 'locked' khien mot INSERT khong set tuong minh khoa
--    nham mot buoi dang mo.
drop table if exists user_lesson_progress;
drop type if exists lesson_status;

create table if not exists lesson_cursor (
  user_id    uuid   not null references auth.users(id) on delete cascade,
  lesson_id  bigint not null references lessons(id),
  word_index int    not null default 0 check (word_index between 0 and 29),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- 8. Ghi chu nhieu dong cua nguoi hoc cho tung tu.
--    Tran 2000 ky tu dat o tang database chu khong chi o form: form la lop
--    chan de di vong nhat (Server Action goi duoc thang bang fetch).
create table if not exists word_notes (
  user_id    uuid   not null references auth.users(id) on delete cascade,
  word_id    bigint not null references vocab_words(id),
  body       text   not null default '' check (char_length(body) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (user_id, word_id)
);

-- 9. RLS cho hai bang moi — cung khuon voi 0004_rls.sql muc 1.
alter table lesson_cursor enable row level security;
alter table word_notes    enable row level security;

drop policy if exists own_cursor on lesson_cursor;
create policy own_cursor on lesson_cursor
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists own_notes on word_notes;
create policy own_notes on word_notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 10. `anon` khong co viec gi voi hai bang nay. RLS da chan (khong policy nao
--     cho anon thay dong nao), nhung quyen bang va RLS la HAI co che doc lap —
--     0004_rls.sql muc 4 da ghi chu dung cai bay nay. Thu hoi trang de sau nay
--     ai them mot policy cho `anon` cung khong mo duoc du lieu rieng tu.
revoke all on lesson_cursor from anon;
revoke all on word_notes    from anon;

-- Ket thuc giao dich mo o dau file — commit MOT LAN duy nhat, tat ca hoac
-- khong gi ca.
commit;
