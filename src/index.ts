#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { auditUrls, batchToJson, batchToMarkdown } from "./audit.js";
import { LEVELS, type AuditLevel, type Impact } from "./axe.js";
import { closeBrowser } from "./browser.js";
import { createServer } from "./server.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

const HELP = `a11y-ja-mcp ${pkg.version}

使い方:
  a11y-ja-mcp                         MCP サーバーとして起動（stdio）
  a11y-ja-mcp audit <url...> [options] URL を一括検査してレポートを出力（CI 向け）

audit のオプション:
  --level <level>     ${LEVELS.join(" | ")}（既定: wcag22aa）
  --format <format>   markdown | json（既定: markdown）
  --out <path>        レポートをファイルに保存（省略時は標準出力）
  --fail-on <impact>  critical | serious | moderate | minor | none（既定: serious）
                      この深刻度以上の違反があると終了コード 1
  --urls-file <path>  URL を 1 行 1 つで書いたファイル
  --best-practices    WCAG 外のベストプラクティスも含める
  --lang <lang>       ja | en（既定: ja）

環境変数:
  A11Y_CHROME_PATH    Chrome の実行ファイルのパス（自動検出できない場合）
  A11Y_HEADLESS=false ブラウザ画面を表示する
`;

async function runCli(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      level: { type: "string", default: "wcag22aa" },
      format: { type: "string", default: "markdown" },
      out: { type: "string" },
      "fail-on": { type: "string", default: "serious" },
      "urls-file": { type: "string" },
      "best-practices": { type: "boolean", default: false },
      lang: { type: "string", default: "ja" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }

  const urls = [...positionals];
  if (values["urls-file"]) {
    urls.push(
      ...readFileSync(values["urls-file"], "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#")),
    );
  }
  if (!urls.length) {
    console.error("URL を 1 つ以上指定してください。\n\n" + HELP);
    return 2;
  }
  const level = values.level as AuditLevel;
  if (!LEVELS.includes(level)) {
    console.error(`--level は ${LEVELS.join(" / ")} のいずれかです`);
    return 2;
  }
  const failOn = values["fail-on"];
  const validFail = ["critical", "serious", "moderate", "minor", "none"];
  if (!validFail.includes(failOn)) {
    console.error(`--fail-on は ${validFail.join(" / ")} のいずれかです`);
    return 2;
  }

  console.error(`${urls.length} ページを検査します（${level}）…`);
  const b = await auditUrls(urls, {
    level,
    bestPractices: values["best-practices"],
    lang: values.lang === "en" ? "en" : "ja",
    failOn: failOn === "none" ? "critical" : (failOn as Impact),
  });
  const body = values.format === "json" ? batchToJson(b) : batchToMarkdown(b);
  if (values.out) {
    await writeFile(resolve(values.out), body, "utf8");
    console.error(`レポートを保存しました: ${resolve(values.out)}`);
  } else {
    console.log(body);
  }

  if (b.errors.length) console.error(`⚠️ 取得に失敗したページ: ${b.errors.length}`);
  if (failOn !== "none" && b.failedUrls.length) {
    console.error(`❌ ${failOn} 以上の違反があるページ: ${b.failedUrls.length}`);
    for (const u of b.failedUrls) console.error(`  - ${u}`);
    return 1;
  }
  if (b.errors.length) return 1;
  console.error("✅ 基準を満たしました");
  return 0;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "audit") {
    let code = 1;
    try {
      code = await runCli(rest);
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
    } finally {
      await closeBrowser();
    }
    process.exit(code);
  }
  if (cmd === "--help" || cmd === "-h") {
    console.log(HELP);
    return;
  }
  if (cmd === "--version" || cmd === "-v") {
    console.log(pkg.version);
    return;
  }

  const server = createServer(pkg.version);
  await server.connect(new StdioServerTransport());
  const shutdown = async () => {
    await closeBrowser();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.stdin.on("close", shutdown);
}

main().catch(async (e) => {
  console.error(e);
  await closeBrowser();
  process.exit(1);
});
