-- Bai bo tuc luon gan voi MOT lan thu da truot. Khong co cot nay, nextStep phai
-- doan moi lien he bang (type, scope, started_at) — va khi mot nguoi truot cung
-- mot bai HAI lan, hai bai bo tuc cung scope chi phan biet duoc bang thu tu thoi
-- gian. Do la loai logic dung cho toi lan dau tien no sai, va khi sai thi nguoi
-- hoc bi dua vao bai bo tuc cua lan truot cu.
--
-- on delete cascade: xoa lan thu goc thi bai bo tuc cua no khong con y nghia.

alter table assessments
  add column if not exists parent_id bigint references assessments(id) on delete cascade;

create index if not exists assessments_parent_id_idx on assessments (parent_id);
