import { config } from "dotenv";

// Nap khoa Supabase tu .env.local truoc khi bat ky test file nao duoc import.
// Can thiet vi tests/rls.test.ts doc process.env ngay o than module, con
// tests/db-integrity.test.ts tu bo qua khi thieu bien moi truong. Khong co
// buoc nay thi hai bo test do khong bao gio chay that.
config({ path: ".env.local" });
