-- Lat 2d: content_md cua 20 bai ngu phap chua GRID TABLE cua pandoc (+---+,
-- +===+) — khong thu vien markdown JS pho thong nao render duoc, va gia tri
-- cua ca 20 bai nam o cac bang so sanh hai cot do. Xem muc 1 cua
-- docs/superpowers/specs/2026-08-13-lat-2d-lo-trinh-ngu-phap-design.md
--
-- Them cot moi thay vi sua de content_md: cot cu da seed va da co test doi
-- chieu (tests/db-integrity.test.ts, tests/grammar-lessons.test.ts). Doi nghia
-- cua mot cot dang duoc khang dinh la mot cai bay cho nguoi doc sau.
--
-- Mac dinh chuoi rong de lenh nay chay duoc tren bang da co du lieu; buoc seed
-- ngay sau se dien noi dung that.
alter table grammar_lessons
  add column if not exists content_html text not null default '';
