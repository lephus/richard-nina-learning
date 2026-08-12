import { createClient } from "@supabase/supabase-js";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import sharp from "sharp";
import {
  BOOK_BUCKET, TOTAL_BOOK_PAGES, pdfPageOf, storagePath,
} from "../../src/lib/book/pages.js";

config({ path: ".env.local" });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("Thieu SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY trong .env.local");
}
const db = createClient(url, key, { auth: { persistSession: false } });

const IMG = "data/images";
// Da do that tren ba trang dai dien (dau/giua/cuoi): 1600px q80 cho 166-307KB
// moi trang, tong ~28MB, va chu than bai + IPA + anh minh hoa deu con sac net.
// 1240px lam vo IPA va anh minh hoa nho; 2000px ton them 40% cho phan chi tiet
// man hinh khong hien het. Xem muc 2 cua spec.
const WIDTH = 1600;
const QUALITY = 80;

// Doc thu muc DUNG MOT LAN. Goi readdirSync trong vong lap la 112 lan quet
// cung mot thu muc 112 tep.
const files = readdirSync(IMG);

const { data: existing, error: listErr } = await db.storage
  .from(BOOK_BUCKET)
  .list("", { limit: 1000 });
if (listErr) {
  console.error("Khong liet ke duoc bucket:", listErr.message);
  process.exit(1);
}
const have = new Set((existing ?? []).map((o) => o.name));

let uploaded = 0;
let skipped = 0;
let totalBytes = 0;
const missing: number[] = [];

for (let page = 1; page <= TOTAL_BOOK_PAGES; page++) {
  const name = storagePath(page);

  // Bo qua anh da co tren bucket: chay lai sau khi dut mang khong phai nen va
  // day lai tu dau. Cung khuon idempotent voi 01-render-ocr.ts.
  if (have.has(name)) { skipped++; continue; }

  const padded = String(pdfPageOf(page)).padStart(3, "0");
  const src = files.find((f) => f.startsWith(`p${padded}-`));
  if (!src) { missing.push(page); continue; }

  const buf = await sharp(join(IMG, src))
    .resize({ width: WIDTH })
    .webp({ quality: QUALITY })
    .toBuffer();

  const { error } = await db.storage
    .from(BOOK_BUCKET)
    .upload(name, buf, { contentType: "image/webp", upsert: false });
  if (error) {
    console.error(`Loi upload trang ${page} (${name}):`, error.message);
    process.exit(1);
  }

  uploaded++;
  totalBytes += buf.length;
  console.log(`trang ${page}/${TOTAL_BOOK_PAGES} -> ${name} (${Math.round(buf.length / 1024)}KB)`);
}

console.log(`\nXong: ${uploaded} anh moi, ${skipped} bo qua, tong ${(totalBytes / 1048576).toFixed(1)}MB da tai len.`);

// Bao thieu THANH TIENG thay vi ket thuc im lang voi 0 loi. Thieu anh o day
// se hien ra thanh o trong tren web, luc do truy nguoc ve buoc nay rat ton
// cong — con o day thi biet ngay trang nao thieu.
if (missing.length > 0) {
  console.error(`\nTHIEU ANH GOC cho ${missing.length} trang doc: ${missing.join(", ")}`);
  console.error(`Chay 'npm run phase0:render' de render lai tu PDF truoc.`);
  process.exit(1);
}
