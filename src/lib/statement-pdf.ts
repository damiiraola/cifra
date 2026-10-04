/**
 * Text out of a statement PDF, in memory (server only; the bytes are never
 * written anywhere). Uses unpdf's serverless pdf.js build: no worker, no
 * canvas, no eval.
 */
import { PDF_MAX_PAGES, type PdfTextItem } from "./statement-import.ts";

export type PdfReadError = "password" | "badPassword" | "unreadable" | "tooManyPages";

export async function readPdfItems(
  bytes: Uint8Array,
  password = "",
): Promise<{ ok: true; items: PdfTextItem[]; pages: number } | { ok: false; error: PdfReadError }> {
  const { getDocumentProxy } = await import("unpdf");
  let doc: Awaited<ReturnType<typeof getDocumentProxy>> | null = null;
  try {
    doc = await getDocumentProxy(bytes, {
      password: password || undefined,
      disableFontFace: true,
      useSystemFonts: false,
      stopAtErrors: false,
      verbosity: 0,
    });
    if (doc.numPages > PDF_MAX_PAGES) return { ok: false, error: "tooManyPages" };
    const items: PdfTextItem[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      for (const it of content.items) {
        if (!("str" in it) || !it.str) continue;
        const t = it.transform as number[];
        items.push({ str: it.str, x: t[4] ?? 0, y: t[5] ?? 0, w: Number(it.width) || 0, page: n });
      }
      page.cleanup();
    }
    return { ok: true, items, pages: doc.numPages };
  } catch (err) {
    const e = err as { name?: string; code?: number };
    if (e?.name === "PasswordException") return { ok: false, error: e.code === 2 ? "badPassword" : "password" };
    return { ok: false, error: "unreadable" };
  } finally {
    const d = doc as unknown as { destroy?: () => Promise<void>; loadingTask?: { destroy?: () => Promise<void> } } | null;
    await (d?.loadingTask?.destroy ?? d?.destroy)?.call(d?.loadingTask ?? d).catch(() => {});
  }
}
