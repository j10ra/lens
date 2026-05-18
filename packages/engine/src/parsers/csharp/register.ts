import csharpLang from "@ast-grep/lang-csharp";
import { registerDynamicLanguage } from "@ast-grep/napi";

let registered = false;

export function ensureCsharpRegistered(): void {
  if (registered) return;
  registered = true;
  try {
    registerDynamicLanguage({ csharp: csharpLang });
  } catch {
    // C# support unavailable; downstream parse('csharp', ...) will throw.
  }
}
