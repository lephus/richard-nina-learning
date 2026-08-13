import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import type { GrammarLesson } from "../../src/content/types.js";

// Lat 2d: content_md cua 20 bai ngu phap chua GRID TABLE cua pandoc (+---+,
// +====), khong thu vien markdown JS pho thong nao render duoc.
//
// KHONG chay lai build-grammar-lessons.ts o day. Script do va
// data/clean/grammar.json da lech nhau tu commit 3c1914d: bai 2 duoc sua tay
// thang vao grammar.json (them ly thuyet danh tu, doi slug thanh
// "danh-tu-tinh-tu-va-trang-tu") ma khong cap nhat lai LessonSpec tuong ung.
// Ban dang seed that (xac minh qua tests/db-integrity.test.ts va 100 cau hoi
// mang lessonSlug "danh-tu-tinh-tu-va-trang-tu" trong data/clean/questions.json)
// khop voi grammar.json hien tai, khong khop voi thu generator se sinh ra hom
// nay. Chay lai generator se am tham ghi de bai 2 ve ban cu, gay lech du lieu
// that. Xem "Viec theo sau" trong
// docs/superpowers/specs/2026-08-13-lat-2d-lo-trinh-ngu-phap-design.md.
//
// Vi vay script nay chi doc data/clean/grammar.json DA CO SAN (nguon su that
// cho lat nay), sinh contentHtml tu chinh contentMd cua tung bai, va ghi de
// lai — giu nguyen tuyet doi moi truong khac (ordinal, slug, title, summary,
// contentMd, sourceFile).
const PATH = "data/clean/grammar.json";
const lessons = JSON.parse(readFileSync(PATH, "utf8")) as GrammarLesson[];

// Doc pandoc tu chinh writer markdown cua no (day chinh la contentMd da
// duoc pandoc -t markdown sinh ra truoc do) nen round-trip khong mat bang,
// danh sach danh so, hay in dam — grid table tro thanh <table> that.
function markdownSangHtml(md: string, nhanBai: string): string {
  const html = execFileSync(
    "pandoc",
    ["-f", "markdown", "-t", "html", "--wrap=none"],
    { input: md, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  // Kiem tai cho va no neu vi pham — cung mau nhu tests/grammar-html.test.ts.
  // HTML nay se duoc render bang dangerouslySetInnerHTML; no o day thi biet
  // ngay bai nao co van de, thay vi de test o buoc sau moi bat duoc.
  //
  // Mau on...= phai bat dau tu "<" va nam trong cung mot the thi moi tinh la
  // khop — khong duoc khop tu do trong van ban thuong. Ban dau mau la
  // /\son[a-z]+\s*=/i (khong neo vao "<"), va no khop nham cau "no one = not
  // anybody" o bai dai-tu ("on" nam trong tu "one", roi theo sau la " =") —
  // mot cau ngu phap hop le, khong phai the HTML. Neo vao "<[^>]*" la cach
  // tach markup khoi van xuoi.
  //
  // MO RONG O VONG SOAT CUOI lat 2d (muc minor): ba mau goc (script/iframe/on...=)
  // bo sot nam duong khac cung dua toi thuc thi ma hoac dieu huong ngoai y
  // muon trong mot chuoi HTML render bang dangerouslySetInnerHTML — <object>/
  // <embed> nhung noi dung/plugin ngoai (tuong duong <iframe> ve muc do rui
  // ro), <base> doi lai GOC tuong doi cua CA TRANG (moi link/anh tuong doi
  // sau do tro sai cho, ke ca cac lien ket noi bo khac cua chinh app), <form>
  // dung mot form khong do app kiem soat, va URL luoc do "javascript:" (co
  // the nam trong href/src cua BAT KY the nao, khong rieng <a>). Khong bai
  // nao trong 20 bai hien co khop cac mau nay (da kiem that tren
  // data/clean/grammar.json) — day la vien phong chong hoi quy, khong phai
  // sua du lieu.
  if (
    /<script/i.test(html) ||
    /<iframe/i.test(html) ||
    /<object\b/i.test(html) ||
    /<embed\b/i.test(html) ||
    /<base\b/i.test(html) ||
    /<form\b/i.test(html) ||
    /javascript:/i.test(html) ||
    /<[^>]*\son[a-z]+\s*=/i.test(html)
  ) {
    throw new Error(
      `HTML sinh ra cho bai "${nhanBai}" chua noi dung khong an toan ` +
        `(script/iframe/object/embed/base/form/javascript:/on...=)`,
    );
  }
  return html;
}

const out: GrammarLesson[] = lessons.map((l) => ({
  ...l,
  contentHtml: markdownSangHtml(l.contentMd, l.slug),
}));

writeFileSync(PATH, JSON.stringify(out, null, 2) + "\n");

for (const l of out) {
  console.log(`${l.ordinal}. ${l.slug} (${l.contentHtml.length} ky tu html)`);
}
console.log(`Da them contentHtml cho ${out.length} bai vao ${PATH}`);
