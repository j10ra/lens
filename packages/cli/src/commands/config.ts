import { configGet, configSet } from "../util/config.js";
import { output } from "../util/format.js";

export async function configGetCommand(key: string): Promise<void> {
  try {
    const value = await configGet(key);
    output(value, false);
  } catch (err) {
    output(err instanceof Error ? err.message : String(err), false);
  }
}

export async function configSetCommand(key: string, value: string): Promise<void> {
  try {
    await configSet(key, value);
    output(`Config updated: ${key} = ${value}`, false);
  } catch (err) {
    output(err instanceof Error ? err.message : String(err), false);
    process.exit(1);
  }
}
