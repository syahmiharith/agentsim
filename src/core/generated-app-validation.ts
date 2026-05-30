import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface GeneratedAppValidation {
  ok: boolean;
  message: string;
}

export async function validateGeneratedApp(finalPackageDir: string): Promise<GeneratedAppValidation> {
  const requiredFiles = ["app/package.json", "app/README.md", "app/server.js", "app/src/App.tsx", "app/src/main.tsx"];
  const missing: string[] = [];

  for (const file of requiredFiles) {
    try {
      await readFile(join(finalPackageDir, file), "utf8");
    } catch {
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    return { ok: false, message: `Missing generated app files: ${missing.join(", ")}` };
  }

  const readme = await readFile(join(finalPackageDir, "app", "README.md"), "utf8");
  if (!readme.includes("pnpm dev:api") || !readme.includes("pnpm dev:web")) {
    return { ok: false, message: "Generated app README is missing run commands." };
  }

  return { ok: true, message: "Generated app structure and run instructions are present." };
}
