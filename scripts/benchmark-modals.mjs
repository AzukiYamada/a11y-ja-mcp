// 正常なモーダルと、1 か所だけ壊したモーダルを Lighthouse・axe-core・a11y-ja-mcp で検査し、
// どこまで検出できるかを比べる。結果は Markdown の表で標準出力に出す。
//
//   npm run build && node scripts/benchmark-modals.mjs
//
// Lighthouse は npx で取得する（LIGHTHOUSE_VERSION で固定）。Chrome は a11y-ja-mcp と同じものを使う。
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { closeBrowser, getBrowser, gotoUrl, newPage } from "../dist/browser.js";
import { runAxe } from "../dist/axe.js";
import { checkModal } from "../dist/components.js";

const LIGHTHOUSE_VERSION = "13.6.0";
const run = promisify(execFile);
const dir = fileURLToPath(new URL("../examples/modals/", import.meta.url));

const CASES = [
  { file: "ok.html", label: "正常なモーダル", expect: null },
  { file: "focus-stays.html", label: "フォーカスが背面に残る", expect: "開いたときにフォーカスがモーダルの中へ移る" },
  { file: "tab-escapes.html", label: "Tab で背面に抜ける", expect: "Tab / Shift+Tab でフォーカスがモーダルの外（背面）へ出ない" },
  { file: "no-escape.html", label: "Escape で閉じられない", expect: "Escape キーで閉じられる" },
  { file: "no-return.html", label: "閉じてもフォーカスが戻らない", expect: "閉じたあと、フォーカスが開くボタンに戻る" },
];

// Lighthouse は file:// を検査できないので、ローカルで配信する
const server = createServer(async (req, res) => {
  try {
    const body = await readFile(join(dir, decodeURIComponent(new URL(req.url, "http://x").pathname)));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await getBrowser();
const chromePath = browser.process()?.spawnfile;

async function lighthouse(url) {
  const { stdout } = await run(
    "npx",
    ["-y", `lighthouse@${LIGHTHOUSE_VERSION}`, url, "--only-categories=accessibility", "--output=json", "--quiet", "--chrome-flags=--headless=new"],
    { env: { ...process.env, CHROME_PATH: chromePath }, maxBuffer: 64 * 1024 * 1024 },
  );
  const lhr = JSON.parse(stdout);
  const failed = Object.values(lhr.audits)
    .filter((a) => a.score === 0 && a.scoreDisplayMode === "binary")
    .map((a) => a.id);
  return { score: Math.round(lhr.categories.accessibility.score * 100), failed };
}

async function axe(url, openModal) {
  const page = await newPage();
  await gotoUrl(page, url);
  if (openModal) {
    await page.click("#open");
    await new Promise((r) => setTimeout(r, 300));
  }
  const r = await runAxe(page, { level: "wcag22aa", bestPractices: true });
  await page.close();
  return r.violations.map((v) => v.ruleId);
}

async function a11yJa(url) {
  const page = await newPage();
  await gotoUrl(page, url);
  const r = await checkModal(page, { trigger: "#open" });
  await page.close();
  return r.checks.filter((c) => c.ok === false).map((c) => c.label);
}

const rows = [];
for (const c of CASES) {
  const url = base + c.file;
  const [lh, axeClosed, axeOpen, ours] = [await lighthouse(url), await axe(url, false), await axe(url, true), await a11yJa(url)];
  rows.push({ ...c, lh, axeClosed, axeOpen, ours });
  console.error(`${c.label}: Lighthouse ${lh.score} [${lh.failed}] / axe ${axeClosed} / axe(open) ${axeOpen} / a11y-ja-mcp ${ours}`);
}

await closeBrowser();
server.close();

// 期待した問題（expect）を検出できたかで判定する。正常なモーダルは「何も出ないこと」が正解
const mark = (row, found) => {
  if (!row.expect) return found.length === 0 ? "✅ 指摘なし" : `❌ 誤検出（${found.join(", ")}）`;
  return found.length ? "✅ 検出" : "❌ 見逃し";
};
const out = [
  `| モーダル | Lighthouse ${LIGHTHOUSE_VERSION}（アクセシビリティ） | axe-core（ページを開いた状態） | axe-core（モーダルを開いた状態） | a11y-ja-mcp \`check_modal\` |`,
  "| --- | --- | --- | --- | --- |",
];
// a11y-ja-mcp は検査項目ごとに結果が出るので、狙った項目を検出できたかに加え、ほかの項目の誤検出も見る
const markOurs = (row) => {
  const extra = row.ours.filter((l) => l !== row.expect);
  const base = !row.expect ? (extra.length ? "❌ 誤検出" : "✅ 指摘なし") : row.ours.includes(row.expect) ? "✅ 検出" : "❌ 見逃し";
  return row.expect && extra.length ? `${base}（ほかに誤検出: ${extra.join("、")}）` : base;
};
for (const r of rows) {
  out.push(`| ${r.label} | ${mark(r, r.lh.failed)}（${r.lh.score} 点） | ${mark(r, r.axeClosed)} | ${mark(r, r.axeOpen)} | ${markOurs(r)} |`);
}
console.log(out.join("\n"));
