import { config } from "dotenv";
config({ path: ".env.local" });

import { adminClient, deleteTestUser } from "./admin";
import { TEST_DISPLAY_NAME, TEST_EMAIL, TEST_PASSWORD } from "./test-user";

export default async function globalSetup(): Promise<void> {
  const admin = adminClient();
  // Dọn trước, phòng lần chạy trước bị ngắt giữa chừng.
  await deleteTestUser(admin);

  const { error } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: TEST_DISPLAY_NAME },
  });
  if (error) throw error;
}
