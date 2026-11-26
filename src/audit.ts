import { newPage, gotoUrl } from "./browser.js";
import { runAxe, type AuditLevel, type AxeResult, type Impact } from "./axe.js";
import { hasFailures, resultsToMarkdown } from "./report.js";

export interface BatchOptions {
  level?: AuditLevel;
  bestPractices?: boolean;
  lang?: "ja" | "en";
  concurrency?: number;
  timeoutMs?: number;
  failOn?: Impact;
}

export interface BatchResult {
  results: AxeResult[];
  errors: { url: string; error: string }[];
  /** failOn 以上の違反があったページの URL */
  failedUrls: string[];
}

/** 複数 URL をまとめて axe で検査する（CI 用） */
export async function auditUrls(urls: string[], opts: BatchOptions = {}): Promise<BatchResult> {
  const queue = [...new Set(urls)];
  const results: AxeResult[] = [];
  const errors: BatchResult["errors"] = [];
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 3, 8));

  async function worker() {
    while (queue.length) {
      const url = queue.shift()!;
      const page = await newPage();
      try {
        await gotoUrl(page, url, opts.timeoutMs);
        results.push(await runAxe(page, { level: opts.level, bestPractices: opts.bestPractices, lang: opts.lang }));
      } catch (e) {
        errors.push({ url, error: e instanceof Error ? e.message : String(e) });
      } finally {
        await page.close().catch(() => {});
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  // 入力順に並べ直す
  const order = new Map(urls.map((u, i) => [u, i]));
  results.sort((a, b) => (order.get(a.url) ?? 0) - (order.get(b.url) ?? 0));

  const failOn = opts.failOn ?? "serious";
  return { results, errors, failedUrls: results.filter((r) => hasFailures(r, failOn)).map((r) => r.url) };
}

export function batchToJson(b: BatchResult): string {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      summary: {
        pages: b.results.length,
        errors: b.errors.length,
        failedPages: b.failedUrls.length,
      },
      ...b,
    },
    null,
    2,
  );
}

export function batchToMarkdown(b: BatchResult): string {
  return resultsToMarkdown(b.results, b.errors);
}
