import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { themRelNoopenerChoLienKetNgoai } from "@/lib/content/external-links";

interface Bai { ordinal: number; contentHtml: string }
const bai = JSON.parse(readFileSync("data/clean/grammar.json", "utf8")) as Bai[];

describe("themRelNoopenerChoLienKetNgoai", () => {
  it("thêm rel + target vào liên kết ngoài chưa có", () => {
    const out = themRelNoopenerChoLienKetNgoai('<a href="https://hochay.com/foo">bar</a>');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
    expect(out).toBe(
      '<a href="https://hochay.com/foo" rel="noopener noreferrer" target="_blank">bar</a>',
    );
  });

  it("idempotent — gọi lại trên chuỗi đã vá không thêm lần hai", () => {
    const mot = themRelNoopenerChoLienKetNgoai('<a href="https://hochay.com/foo">bar</a>');
    const hai = themRelNoopenerChoLienKetNgoai(mot);
    expect(hai).toBe(mot);
    expect(hai.match(/rel="noopener noreferrer"/g)).toHaveLength(1);
    expect(hai.match(/target="_blank"/g)).toHaveLength(1);
  });

  it("không đụng vào rel/target đã có sẵn từ trước (kể cả giá trị khác)", () => {
    const out = themRelNoopenerChoLienKetNgoai(
      '<a href="https://hochay.com/foo" target="_self" rel="nofollow">bar</a>',
    );
    expect(out).toBe('<a href="https://hochay.com/foo" target="_self" rel="nofollow">bar</a>');
  });

  it("không đụng liên kết KHÔNG phải http(s) tuyệt đối", () => {
    const out = themRelNoopenerChoLienKetNgoai('<a href="/grammar">nội bộ</a>');
    expect(out).toBe('<a href="/grammar">nội bộ</a>');
  });

  it("vá đúng cả 4 liên kết ngoài thật trong data/clean/grammar.json", () => {
    for (const b of bai) {
      const out = themRelNoopenerChoLienKetNgoai(b.contentHtml);
      const the = [...out.matchAll(/<a\s+href="https?:\/\/[^"]*"[^>]*>/gi)];
      for (const m of the) {
        expect(m[0]).toContain('rel="noopener noreferrer"');
        expect(m[0]).toContain('target="_blank"');
      }
    }
  });
});
