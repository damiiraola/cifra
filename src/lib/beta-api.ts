import { createServerFn } from "@tanstack/react-start";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const saveBetaBrief = createServerFn({ method: "POST" })
  .validator((d: { answers: Record<string, string | string[]> }) => d)
  .handler(async ({ data }) => {
    const dir = path.join(process.cwd(), "data");
    await mkdir(dir, { recursive: true });
    const payload = { savedAt: new Date().toISOString(), answers: data.answers };
    await writeFile(path.join(dir, "beta-brief.json"), JSON.stringify(payload, null, 2), "utf8");
    return { ok: true as const };
  });

export const saveLaunchBrief = createServerFn({ method: "POST" })
  .validator((d: { answers: Record<string, string | string[]> }) => d)
  .handler(async ({ data }) => {
    const dir = path.join(process.cwd(), "data");
    await mkdir(dir, { recursive: true });
    const payload = { savedAt: new Date().toISOString(), answers: data.answers };
    await writeFile(path.join(dir, "launch-brief.json"), JSON.stringify(payload, null, 2), "utf8");
    return { ok: true as const };
  });
