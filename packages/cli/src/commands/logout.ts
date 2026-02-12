import { clearAuth } from "../util/auth.js";
import { post } from "../util/client.js";
import { output } from "../util/format.js";

export async function logoutCommand(): Promise<void> {
  await clearAuth();
  try { await post("/api/auth/notify"); } catch {}
  output("Logged out of LENS cloud.", false);
}
