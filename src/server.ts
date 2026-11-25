import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { auditUrls, batchToJson, batchToMarkdown } from "./audit.js";
import { LEVELS, runAxe } from "./axe.js";
import { assertNavigated, getPage, gotoUrl } from "./browser.js";
import { contrastRatio, isLargeText, judge, mark, parseColor, toHex } from "./contrast.js";
import {
  contrastScanToMarkdown,
  getImages,
  getStructure,
  getTabOrder,
  imagesToMarkdown,
  scanContrast,
  structureToMarkdown,
  tabOrderToMarkdown,
} from "./inspect.js";
import { AUDIT_TEMPLATE } from "./prompts.js";
import { resultToMarkdown } from "./report.js";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: `エラー: ${e instanceof Error ? e.message : String(e)}` }],
});

/** url が指定されていれば開き、なければ現在のページを使う */
async function pageFor(url?: string) {
  const page = await getPage();
  if (url) await gotoUrl(page, url);
  else assertNavigated(page);
  return page;
}

const urlArg = z.string().url().optional().describe("検査する URL。省略すると現在開いているページを検査");
const selectorArg = z.string().describe("対象要素の CSS セレクタ");

export function createServer(version: string): McpServer {
  const server = new McpServer({ name: "a11y-ja-mcp", version });

  // ---------------------------------------------------------------- 操作系
  server.registerTool(
    "navigate",
    {
      title: "ページを開く",
      description: "ブラウザで URL を開く。開いたページは他のツールで続けて検査できる",
      inputSchema: { url: z.string().url().describe("開く URL（http://localhost も可）") },
    },
    async ({ url }) => {
      try {
        const page = await getPage();
        await gotoUrl(page, url);
        return text(`開きました: ${await page.title()}（${page.url()}）`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "click",
    { title: "クリック", description: "要素をクリックする", inputSchema: { selector: selectorArg } },
    async ({ selector }) => {
      try {
        const page = await pageFor();
        await page.click(selector);
        await page.waitForNetworkIdle({ idleTime: 300, timeout: 5000 }).catch(() => {});
        return text(`クリックしました: ${selector}（現在の URL: ${page.url()}）`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "type_text",
    {
      title: "文字を入力",
      description: "入力欄に文字を入力する",
      inputSchema: {
        selector: selectorArg,
        text: z.string().describe("入力する文字列"),
        clear: z.boolean().default(true).describe("入力前に既存の値を消すか"),
      },
    },
    async ({ selector, text: value, clear }) => {
      try {
        const page = await pageFor();
        if (clear) await page.$eval(selector, (el) => ((el as HTMLInputElement).value = ""));
        await page.type(selector, value);
        return text(`入力しました: ${selector}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "set_checked",
    {
      title: "チェックを切り替え",
      description: "チェックボックスやラジオボタンを指定した状態にする",
      inputSchema: { selector: selectorArg, checked: z.boolean().default(true) },
    },
    async ({ selector, checked }) => {
      try {
        const page = await pageFor();
        const current = await page.$eval(selector, (el) => (el as HTMLInputElement).checked);
        if (current !== checked) await page.click(selector);
        return text(`${selector} を ${checked ? "オン" : "オフ"} にしました`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "select_option",
    {
      title: "選択肢を選ぶ",
      description: "select 要素の選択肢を value で選ぶ",
      inputSchema: { selector: selectorArg, value: z.string() },
    },
    async ({ selector, value }) => {
      try {
        const page = await pageFor();
        await page.select(selector, value);
        return text(`${selector} で ${value} を選びました`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "press_key",
    {
      title: "キーを押す",
      description: "キーボードのキーを押す（例: Tab, Shift+Tab, Enter, Escape, ArrowDown, Space）",
      inputSchema: { key: z.string().describe("キー名。修飾キーは + でつなぐ（例: Shift+Tab）") },
    },
    async ({ key }) => {
      try {
        const page = await pageFor();
        const parts = key.split("+").map((k) => (k === "Space" ? " " : k));
        const main = parts.pop()!;
        for (const m of parts) await page.keyboard.down(m as never);
        await page.keyboard.press(main as never);
        for (const m of parts.reverse()) await page.keyboard.up(m as never);
        const focused = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return "（body）";
          const id = el.id ? `#${el.id}` : "";
          const name = el.getAttribute("aria-label") ?? (el as HTMLElement).innerText?.trim().slice(0, 50) ?? "";
          return `<${el.localName}${id}> ${name}`;
        });
        return text(`${key} を押しました。現在のフォーカス: ${focused}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "screenshot",
    {
      title: "スクリーンショット",
      description: "現在のページのスクリーンショットを撮る",
      inputSchema: { full_page: z.boolean().default(false).describe("ページ全体を撮るか") },
    },
    async ({ full_page }) => {
      try {
        const page = await pageFor();
        const data = await page.screenshot({ fullPage: full_page, encoding: "base64", type: "png" });
        return { content: [{ type: "image" as const, data: data as string, mimeType: "image/png" }] };
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ---------------------------------------------------------------- 検査系
  server.registerTool(
    "axe_scan",
    {
      title: "axe-core で自動検査",
      description:
        "axe-core でページを自動検査し、違反を日本語で返す。WCAG の達成基準番号・日本語名・JIS X 8341-3 の対象かどうかも付ける",
      inputSchema: {
        url: urlArg,
        level: z.enum(LEVELS).default("wcag22aa").describe("基準。wcag2aa は JIS X 8341-3:2016 AA 相当"),
        best_practices: z.boolean().default(false).describe("WCAG 外のベストプラクティスも含めるか"),
        include: z.string().optional().describe("検査範囲を絞る CSS セレクタ（例: main, #modal）"),
        lang: z.enum(["ja", "en"]).default("ja").describe("メッセージの言語"),
        max_nodes: z.number().int().min(1).max(100).default(10).describe("1 ルールあたり表示する要素数"),
      },
    },
    async ({ url, level, best_practices, include, lang, max_nodes }) => {
      try {
        const page = await pageFor(url);
        const r = await runAxe(page, { level, bestPractices: best_practices, include, lang });
        return text(resultToMarkdown(r, { maxNodes: max_nodes }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "page_structure",
    {
      title: "ページ構造",
      description: "見出しのアウトライン、ランドマーク、lang、タイトル、スキップリンク、iframe、ラベルのないフォーム部品を調べる",
      inputSchema: { url: urlArg },
    },
    async ({ url }) => {
      try {
        return text(structureToMarkdown(await getStructure(await pageFor(url))));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "tab_order",
    {
      title: "Tab 順序",
      description:
        "実際に Tab キーを押してフォーカスの移動順を記録する。見えない要素へのフォーカス、名前のない要素、フォーカス表示の有無、正の tabindex、キーボードトラップを指摘する",
      inputSchema: { url: urlArg, max: z.number().int().min(1).max(500).default(100).describe("Tab を押す最大回数") },
    },
    async ({ url, max }) => {
      try {
        return text(tabOrderToMarkdown(await getTabOrder(await pageFor(url), max)));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "images",
    {
      title: "画像と代替テキスト",
      description:
        "img / svg / role=img / input[type=image] / area を一覧にし、代替テキストあり・装飾（alt=\"\"）・alt 属性なし・名前なしに分類する。ファイル名や「画像」だけの alt、リンク画像の名前抜けなども指摘する",
      inputSchema: { url: urlArg },
    },
    async ({ url }) => {
      try {
        return text(imagesToMarkdown(await getImages(await pageFor(url))));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "contrast_ratio",
    {
      title: "コントラスト比を計算",
      description:
        "2 色のコントラスト比を計算し、WCAG 2.x の AA / AAA について通常の文字・大きな文字・UI 部品（非テキスト）ごとの合否を返す。ブラウザは使わない",
      inputSchema: {
        foreground: z.string().describe("文字色（#hex / rgb() / rgba()）"),
        background: z.string().describe("背景色（#hex / rgb() / rgba()）"),
        font_size_px: z.number().positive().optional().describe("文字サイズ（px）。指定すると該当する判定を強調"),
        bold: z.boolean().default(false).describe("太字（700 以上）か"),
      },
    },
    async ({ foreground, background, font_size_px, bold }) => {
      try {
        const fg = parseColor(foreground);
        const bg = parseColor(background);
        const j = judge(contrastRatio(fg, bg));
        const lines = [
          `## コントラスト比 ${j.ratio.toFixed(2)}:1`,
          "",
          `前景 ${toHex(fg)} / 背景 ${toHex(bg)}`,
          "",
          "| 対象 | AA | AAA |",
          "| --- | --- | --- |",
          `| 通常の文字（4.5:1 / 7:1） | ${mark(j.normal.AA)} | ${mark(j.normal.AAA)} |`,
          `| 大きな文字（3:1 / 4.5:1） | ${mark(j.large.AA)} | ${mark(j.large.AAA)} |`,
          `| UI 部品・グラフィック（3:1, 1.4.11） | ${mark(j.nonText)} | - |`,
        ];
        if (font_size_px) {
          const large = isLargeText(font_size_px, bold ? 700 : 400);
          const t = large ? j.large : j.normal;
          lines.push("", `${font_size_px}px${bold ? " 太字" : ""} は「${large ? "大きな文字" : "通常の文字"}」なので → AA ${mark(t.AA)}、AAA ${mark(t.AAA)}`);
        }
        return text(lines.join("\n"));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "contrast_scan",
    {
      title: "ページのコントラスト検査",
      description:
        "ページ内の表示されているテキストの文字色と背景色を調べ、文字サイズに応じた基準でコントラスト不足の箇所を一覧にする。背景画像やグラデーションの上の文字は「要目視確認」として分ける",
      inputSchema: {
        url: urlArg,
        level: z.enum(["AA", "AAA"]).default("AA"),
        selector: z.string().optional().describe("検査範囲を絞る CSS セレクタ"),
      },
    },
    async ({ url, level, selector }) => {
      try {
        const items = await scanContrast(await pageFor(url), { selector });
        return text(contrastScanToMarkdown(items, level));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "audit_urls",
    {
      title: "複数ページを一括検査",
      description:
        "複数の URL を axe-core で一括検査し、Markdown か JSON のレポートを返す（ファイルにも保存できる）。CI やサイト全体の確認向け",
      inputSchema: {
        urls: z.array(z.string().url()).min(1).max(200),
        level: z.enum(LEVELS).default("wcag22aa"),
        format: z.enum(["markdown", "json"]).default("markdown"),
        output_path: z.string().optional().describe("レポートを保存するファイルパス（省略時は保存しない）"),
        fail_on: z.enum(["critical", "serious", "moderate", "minor"]).default("serious").describe("この深刻度以上を「不合格」とする"),
      },
    },
    async ({ urls, level, format, output_path, fail_on }) => {
      try {
        const b = await auditUrls(urls, { level, failOn: fail_on });
        const body = format === "json" ? batchToJson(b) : batchToMarkdown(b);
        let saved = "";
        if (output_path) {
          const p = resolve(output_path);
          await writeFile(p, body, "utf8");
          saved = `\n\nレポートを保存しました: ${p}`;
        }
        const head = `${b.results.length} ページを検査しました。不合格（${fail_on} 以上）: ${b.failedUrls.length} ページ、取得失敗: ${b.errors.length} ページ${saved}\n\n`;
        // JSON をファイルに保存した場合は本文を返さない（長くなるため）
        return text(head + (format === "json" && output_path ? "" : body));
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ---------------------------------------------------------------- プロンプト（監査テンプレート）
  server.registerPrompt(
    "a11y_audit",
    {
      title: "アクセシビリティ監査",
      description: "ツールを組み合わせて、WCAG / JIS X 8341-3 に沿った監査レポートを作る手順とテンプレート",
      argsSchema: {
        url: z.string().describe("監査する URL"),
        level: z.string().optional().describe("目標とする基準（例: WCAG 2.2 AA、JIS X 8341-3:2016 AA）"),
      },
    },
    ({ url, level }) => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: AUDIT_TEMPLATE.replaceAll("{{url}}", url).replaceAll("{{level}}", level ?? "WCAG 2.2 AA") },
        },
      ],
    }),
  );

  return server;
}
