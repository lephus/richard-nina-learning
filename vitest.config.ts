import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup-env.ts"],
    // Cac tep test cham database dung CHUNG mot Supabase production, va chung
    // khong doc lap voi nhau: tests/rls.test.ts co y chen vocab_words voi
    // ordinal 9999 trong suot thoi gian no chay, con tests/db-integrity.test.ts
    // khang dinh khong ton tai dong nao ordinal > 605. Vitest mac dinh chay cac
    // TEP song song, nen hai tep giam len nhau va db-integrity do ngau nhien.
    //
    // Da do bang thuc nghiem: chay song song thi do, chay tuan tu thi xanh,
    // va database sach sau ca hai — tuc phan don dep dung, chi co thu tu la sai.
    //
    // Gia phai tra la ~2-3 giay cho ca bo. Cac tep test ham thuan chay vai
    // mili giay nen mat mat khong dang ke.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@content": resolve(__dirname, "src/content"),
      "@": resolve(__dirname, "src"),
    },
  },
});
