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

-- MOT nguoi chi co MOT bai `in_progress` tai mot thoi diem (thiet ke muc 7).
--
-- startAssessment da kiem dieu nay bang mot lan DOC roi moi CHEN, nhung doc-roi-
-- chen khong phai mot phep toan nguyen tu: hai yeu cau "bat dau" chay song song
-- (bam dup, hai tab, mot lan thu lai sau timeout) deu thay "khong co bai nao dang
-- do" roi deu chen. Hau qua khong tu lanh: `nextStep` chi xet lan thu co id LON
-- NHAT (ham `latest`), nen dong cu hon khong bao gio duoc chon de `resume` hay
-- `close-expired` — no nam lai `in_progress` vinh vien, va tu do MOI lan
-- startAssessment sau nay deu nem loi. Nguoi hoc kep cung, khong con duong nao
-- di tiep bang giao dien.
--
-- Chi so duy nhat MOT PHAN (partial unique index) la cho duy nhat bien dieu do
-- thanh bat bien that: database tu choi dong thu hai, bat ke ung dung doc duoc
-- gi truoc do. Dieu kien `where status = 'in_progress'` la bat buoc — khong co
-- no thi mot nguoi chi duoc lam MOT bai danh gia tron doi.
--
-- LUU Y THU TU: tep migration nay duoc dan len dashboard o CUOI lat, nen chi so
-- duoi day CHUA song trong database luc dang viet code. `startAssessment` bat
-- ma loi 23505 va doi thanh dung AssessmentInProgressError ma lan doc phia truoc
-- da nem — code chay dung o CA HAI phia moc dan. Vi vay khong co test nao doi
-- hoi chi so nay ton tai: viet test do bay gio thi no do cho toi luc dan.
--
-- Neu luc dan ma lenh nay bao loi trung khoa, nghia la trong bang DANG co mot
-- nguoi voi hai dong `in_progress` — dung dieu no sinh ra de chan. Dong lai het
-- tru dong moi nhat (`update assessments set status = 'submitted' ...`) roi dan
-- lai, dung go bo dieu kien `where` cua chi so.
create unique index if not exists assessments_one_in_progress
  on assessments (user_id) where status = 'in_progress';
