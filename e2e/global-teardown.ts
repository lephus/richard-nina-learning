import { config } from "dotenv";
config({ path: ".env.local" });

import { adminClient, deleteTestUser } from "./admin";

export default async function globalTeardown(): Promise<void> {
  await deleteTestUser(adminClient());
}
