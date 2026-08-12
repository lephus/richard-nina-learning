-- Bucket chua anh trang sach da nen (WebP 1600px) cho trang /doc-sach.
-- Xem docs/superpowers/specs/2026-08-12-doc-sach-design.md
--
-- RIENG TU, khong cong khai: day la tai lieu co ban quyen cua nhom Toeic
-- Practice Club. Bucket cong khai nghia la dang ca cuon sach cua nguoi khac
-- len internet o mot URL doan duoc, trong khi ca app da nam sau dang nhap.
--
-- Khong co policy insert/update/delete cho nguoi dung: anh chi do script
-- scripts/phase0/06-pack-book-pages.ts day len bang service key, ma service
-- key thi di vong qua RLS.
begin;

insert into storage.buckets (id, name, public)
values ('book-pages', 'book-pages', false)
on conflict (id) do update set public = false;

drop policy if exists read_book_pages on storage.objects;
create policy read_book_pages on storage.objects
  for select
  to authenticated
  using (bucket_id = 'book-pages');

commit;
