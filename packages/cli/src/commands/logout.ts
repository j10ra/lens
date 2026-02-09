import { clearAuth } from "../util/auth.js";
import { output } from "../util/format.js";

export async function logoutCommand(): Promise<void> {
  await clearAuth();
  output("Logged out of LENS cloud.", false);
}
