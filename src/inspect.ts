import type { Page } from "puppeteer-core";
import { contrastRatio, isLargeText, judge, parseColor, toHex, blend, type RGBA } from "./contrast.js";
import { ensureHelpers } from "./page-helpers.js";

type H = {
  cssPath(el: Element): string;
  accName(el: Element): string;
  role(el: Element): string;
  isVisible(el: Element): boolean;
  isOffscreen(el: Element): boolean;
  isAriaHidden(el: Element): boolean;
  textOf(el: Element): string;
};
declare global {
  interface Window {
    __a11yja: H;
  }
}

const FOCUSABLE =
  'a[href], area[href], button, input:not([type="hidden"]), select, textarea, iframe, summary, [tabindex], [contenteditable=""], [contenteditable="true"], audio[controls], video[controls]';

// ---------------------------------------------------------------------------
// ページ構造（見出し・ランドマーク・言語・タイトル など）
// ---------------------------------------------------------------------------

export interface StructureResult {
  title: string;
  lang: string | null;
  headings: { level: number; text: string; selector: string; visible: boolean }[];
  landmarks: { role: string; name: string; selector: string }[];
  skipLink: { text: string; href: string; targetExists: boolean } | null;
  iframes: { selector: string; title: string | null; src: string }[];
  unlabeledControls: { selector: string; html: string }[];
  warnings: string[];
}

export async function getStructure(page: Page): Promise<StructureResult> {
  await ensureHelpers(page);
  return page.evaluate((FOCUSABLE) => {
    const h = window.__a11yja;
    const warnings: string[] = [];

    const headingEls = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')];
    const headings = headingEls
      .filter((el) => !h.isAriaHidden(el))
      .map((el) => {
        const level = el.getAttribute("role") === "heading" ? Number(el.getAttribute("aria-level") ?? 2) : Number(el.localName[1]);
        return { level, text: h.accName(el), selector: h.cssPath(el), visible: h.isVisible(el) };
      });

    const h1s = headings.filter((x) => x.level === 1);
    if (headings.length === 0) warnings.push("見出しが 1 つもありません（1.3.1 / 2.4.6）");
    else if (h1s.length === 0) warnings.push("h1 がありません");
    else if (h1s.length > 1) warnings.push(`h1 が ${h1s.length} 個あります（禁止ではありませんが、ページの主題が伝わるか確認してください）`);
    let prev = 0;
    for (const hd of headings) {
      if (prev && hd.level > prev + 1) warnings.push(`見出しレベルが h${prev} から h${hd.level} に飛んでいます: 「${hd.text}」`);
      if (!hd.text) warnings.push(`空の見出しがあります: ${hd.selector}`);
      prev = hd.level;
    }

    const LANDMARKS = ["banner", "navigation", "main", "complementary", "contentinfo", "search", "form", "region"];
    const landmarks = [...document.querySelectorAll("header,nav,main,aside,footer,form,section,search,[role]")]
      .filter((el) => !h.isAriaHidden(el))
      .map((el) => ({ el, role: el.localName === "search" && !el.getAttribute("role") ? "search" : h.role(el) }))
      .filter(({ el, role }) => LANDMARKS.includes(role) && (role !== "form" || el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby")))
      .map(({ el, role }) => ({
        role,
        name: el.getAttribute("aria-label") ?? (el.getAttribute("aria-labelledby") ? h.accName(el) : ""),
        selector: h.cssPath(el),
      }));
    const mains = landmarks.filter((l) => l.role === "main");
    if (mains.length === 0) warnings.push("main ランドマークがありません（2.4.1 の手段の 1 つ）");
    if (mains.length > 1) warnings.push(`main ランドマークが ${mains.length} 個あります`);
    for (const role of ["navigation", "complementary", "region"]) {
      const same = landmarks.filter((l) => l.role === role);
      if (same.length > 1 && same.some((l) => !l.name)) warnings.push(`${role} ランドマークが複数あるのに、名前（aria-label）がないものがあります`);
    }

    const lang = document.documentElement.getAttribute("lang");
    if (!lang) warnings.push("html 要素に lang 属性がありません（3.1.1）");
    if (!document.title.trim()) warnings.push("ページタイトル（title 要素）が空です（2.4.2）");

    // スキップリンク: 最初の数個のフォーカス可能要素に、ページ内リンクがあるか
    let skipLink: StructureResult["skipLink"] = null;
    const firstFocusables = [...document.querySelectorAll(FOCUSABLE)].slice(0, 5);
    for (const el of firstFocusables) {
      const href = el.getAttribute("href");
      if (el.localName === "a" && href && href.startsWith("#") && href.length > 1) {
        const id = decodeURIComponent(href.slice(1));
        skipLink = { text: h.accName(el), href, targetExists: !!document.getElementById(id) || !!document.getElementsByName(id).length };
        break;
      }
    }
    if (!skipLink) warnings.push("ページ先頭付近にスキップリンクが見つかりません（ランドマークや見出しで代替していれば必須ではありません）");
    else if (!skipLink.targetExists) warnings.push(`スキップリンクの移動先 ${skipLink.href} が存在しません`);

    const iframes = [...document.querySelectorAll("iframe")]
      .filter((el) => !h.isAriaHidden(el))
      .map((el) => ({ selector: h.cssPath(el), title: el.getAttribute("title"), src: el.getAttribute("src") ?? "" }));
    for (const f of iframes) if (!f.title?.trim()) warnings.push(`iframe に title がありません: ${f.selector}`);

    const unlabeledControls = [...document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]),select,textarea')]
      .filter((el) => h.isVisible(el) && !h.isAriaHidden(el))
      .filter((el) => {
        const name = h.accName(el);
        // placeholder だけのラベルは不十分なので未ラベル扱い
        return !name || name === el.getAttribute("placeholder");
      })
      .map((el) => ({ selector: h.cssPath(el), html: el.outerHTML.slice(0, 200) }));
    if (unlabeledControls.length) warnings.push(`ラベルのないフォーム部品が ${unlabeledControls.length} 個あります（3.3.2 / 4.1.2）`);

    return { title: document.title, lang, headings, landmarks, skipLink, iframes, unlabeledControls, warnings };
  }, FOCUSABLE);
}

export function structureToMarkdown(s: StructureResult): string {
  const out: string[] = [];
  out.push(`## ページ構造`, "", `- タイトル: ${s.title || "（なし）"}`, `- lang: ${s.lang ?? "（なし）"}`);
  out.push(`- スキップリンク: ${s.skipLink ? `「${s.skipLink.text}」→ ${s.skipLink.href}${s.skipLink.targetExists ? "" : "（移動先なし）"}` : "なし"}`, "");
  out.push("### 見出しのアウトライン", "");
  if (!s.headings.length) out.push("（見出しなし）");
  for (const h of s.headings) out.push(`${"  ".repeat(Math.max(0, h.level - 1))}- h${h.level}: ${h.text || "（空）"}${h.visible ? "" : "（非表示）"}`);
  out.push("", "### ランドマーク", "");
  if (!s.landmarks.length) out.push("（ランドマークなし）");
  for (const l of s.landmarks) out.push(`- ${l.role}${l.name ? `「${l.name}」` : ""}: \`${l.selector}\``);
  if (s.iframes.length) {
    out.push("", "### iframe", "");
    for (const f of s.iframes) out.push(`- \`${f.selector}\` title=${f.title ? `「${f.title}」` : "なし"}`);
  }
  if (s.unlabeledControls.length) {
    out.push("", "### ラベルのないフォーム部品", "");
    for (const c of s.unlabeledControls) out.push(`- \`${c.selector}\`: \`${c.html}\``);
  }
  out.push("", "### 指摘", "");
  out.push(...(s.warnings.length ? s.warnings.map((w) => `- ⚠️ ${w}`) : ["- 構造上の明らかな問題は見つかりませんでした"]));
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Tab 順序（実際に Tab キーを押して記録する）
// ---------------------------------------------------------------------------

export interface TabStop {
  index: number;
  selector: string;
  role: string;
  name: string;
  tabindex: string | null;
  visible: boolean;
  focusIndicatorChanged: boolean | null;
  warnings: string[];
}

export interface TabOrderResult {
  stops: TabStop[];
  cycled: boolean;
  trapSuspected: string | null;
  warnings: string[];
}

export async function getTabOrder(page: Page, max = 100): Promise<TabOrderResult> {
  await ensureHelpers(page);

  // フォーカスしていない状態のスタイルを記録しておき、フォーカス時と比較する
  await page.evaluate((FOCUSABLE) => {
    const h = window.__a11yja;
    (document.activeElement as HTMLElement | null)?.blur?.();
    const sig = (el: Element) => {
      const s = getComputedStyle(el);
      return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.backgroundColor, s.borderColor, s.color, s.textDecorationLine].join("|");
    };
    const map: Record<string, string> = {};
    for (const el of document.querySelectorAll(FOCUSABLE)) map[h.cssPath(el)] = sig(el);
    (window as unknown as { __a11yjaBaseline: Record<string, string> }).__a11yjaBaseline = map;
    window.scrollTo(0, 0);
    // 文書の先頭から Tab を始めるため、一時的に body にフォーカスする
    const body = document.body;
    const had = body.hasAttribute("tabindex");
    if (!had) body.setAttribute("tabindex", "-1");
    body.focus();
    if (!had) body.removeAttribute("tabindex");
  }, FOCUSABLE);

  // ヘッドレス Chrome では、末尾から先頭に戻るときに body を経由したりしなかったりする。
  // そのため body では止まらず、「最初に記録した要素にもう一度来たら一周」と判定し、
  // 最後に仕様上の先頭（正の tabindex の小さい順 → DOM 順）から始まるように並べ替える。
  const stops: (TabStop & { sortKey: [number, number] })[] = [];
  let cycled = false;
  let trapSuspected: string | null = null;
  let sameCount = 0;
  let bodyStreak = 0;

  for (let i = 0; i < max + 5; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const h = window.__a11yja;
      let el = document.activeElement;
      // Shadow DOM の内側までたどる
      while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      const s = getComputedStyle(el);
      const now = [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.backgroundColor, s.borderColor, s.color, s.textDecorationLine].join("|");
      const selector = h.cssPath(el);
      const base = (window as unknown as { __a11yjaBaseline?: Record<string, string> }).__a11yjaBaseline?.[selector];
      const r = el.getBoundingClientRect();
      const inViewport = r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
      return {
        selector,
        role: h.role(el),
        name: h.accName(el),
        tabindex: el.getAttribute("tabindex"),
        visible: h.isVisible(el) && !h.isOffscreen(el),
        inViewport,
        ariaHidden: h.isAriaHidden(el),
        isIframe: el.localName === "iframe",
        focusIndicatorChanged: base === undefined ? null : base !== now,
        domIndex: [...document.querySelectorAll("*")].indexOf(el),
      };
    });

    if (!info) {
      // body（文書の外）に出た。要素が 1 つもないページで無限に押し続けないよう回数で打ち切る
      if (++bodyStreak >= 3) break;
      continue;
    }
    bodyStreak = 0;
    if (stops.length && stops[0].selector === info.selector) {
      cycled = true;
      break;
    }
    const last = stops[stops.length - 1];
    if (last && last.selector === info.selector) {
      sameCount++;
      if (sameCount >= 2) {
        trapSuspected = info.selector;
        break;
      }
      continue;
    }
    sameCount = 0;

    const w: string[] = [];
    if (info.tabindex && Number(info.tabindex) > 0) w.push(`tabindex="${info.tabindex}"（正の値）は順序を崩しやすい`);
    if (!info.visible) w.push("フォーカスされたのに見えない（2.4.7 / 2.4.11）");
    else if (!info.inViewport) w.push("フォーカス時に画面外にある（2.4.11）");
    if (info.ariaHidden) w.push("aria-hidden の中なのにフォーカスできる（4.1.2）");
    if (!info.name && !info.isIframe) w.push("アクセシブルネームがない（4.1.2）");
    if (info.isIframe) w.push("iframe 内に入りました（中の要素は個別に確認してください）");
    if (info.focusIndicatorChanged === false) w.push("フォーカスしても見た目が変わらない可能性（2.4.7、目視で確認）");

    stops.push({
      index: stops.length + 1,
      selector: info.selector,
      role: info.role,
      name: info.name,
      tabindex: info.tabindex,
      visible: info.visible,
      focusIndicatorChanged: info.focusIndicatorChanged,
      warnings: w,
      sortKey: [
        info.tabindex && Number(info.tabindex) > 0 ? Number(info.tabindex) : Number.MAX_SAFE_INTEGER,
        info.domIndex < 0 ? Number.MAX_SAFE_INTEGER : info.domIndex,
      ],
    });
    if (stops.length >= max) break;
  }

  // 一周分を記録できたときだけ、先頭の要素から始まるように回転させる
  let ordered: TabStop[] = stops;
  if (cycled && stops.length > 1) {
    let start = 0;
    stops.forEach((s, i) => {
      const [a0, a1] = s.sortKey;
      const [b0, b1] = stops[start].sortKey;
      if (a0 < b0 || (a0 === b0 && a1 < b1)) start = i;
    });
    ordered = [...stops.slice(start), ...stops.slice(0, start)];
  }
  ordered = ordered.map(({ sortKey: _sortKey, ...s }: TabStop & { sortKey?: unknown }, i) => ({ ...s, index: i + 1 }));

  const warnings: string[] = [];
  if (trapSuspected) warnings.push(`キーボードトラップの可能性: \`${trapSuspected}\` から Tab で抜けられません（2.1.2）`);
  if (!cycled && !trapSuspected) warnings.push(`上限の ${max} 回まで Tab を押しました。続きがある可能性があります`);
  if (stops.length === 0) warnings.push("Tab で移動できる要素が 1 つもありません（2.1.1）");
  if (stops.some((s) => s.tabindex && Number(s.tabindex) > 0)) warnings.push("正の tabindex が使われています（2.4.3）");
  return { stops: ordered, cycled, trapSuspected, warnings };
}

export function tabOrderToMarkdown(r: TabOrderResult): string {
  const out = ["## Tab 順序", "", "| # | 役割 | 名前 | セレクタ | 指摘 |", "| ---: | --- | --- | --- | --- |"];
  const cell = (s: string) => s.replace(/\|/g, "\\|").slice(0, 80);
  for (const s of r.stops) {
    out.push(`| ${s.index} | ${s.role || "-"} | ${cell(s.name) || "（なし）"} | \`${cell(s.selector)}\` | ${s.warnings.map(cell).join("<br>")} |`);
  }
  out.push("", `- 一周したか: ${r.cycled ? "はい" : "いいえ"}`);
  for (const w of r.warnings) out.push(`- ⚠️ ${w}`);
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// 画像と代替テキスト
// ---------------------------------------------------------------------------

export type ImageStatus = "代替テキストあり" | "装飾" | "alt属性なし" | "名前なし";

export interface ImageInfo {
  selector: string;
  kind: string;
  src: string;
  alt: string | null;
  status: ImageStatus;
  inLink: boolean;
  warnings: string[];
}

export async function getImages(page: Page): Promise<ImageInfo[]> {
  await ensureHelpers(page);
  return page.evaluate(() => {
    const h = window.__a11yja;
    const GENERIC = ["画像", "写真", "イメージ", "アイコン", "image", "img", "photo", "picture", "icon", "graphic", "spacer", "blank"];
    const els = [...document.querySelectorAll('img, svg, [role="img"], input[type="image"], area')];
    return els
      .filter((el) => !(el.localName === "svg" && el.parentElement?.closest("svg")))
      // 読み込みに失敗した画像は 0×0 になるので、サイズではなく CSS 上の表示状態で判定する
      .filter((el) => el.localName === "area" || el.checkVisibility({ visibilityProperty: true } as CheckVisibilityOptions))
      .map((el) => {
        const warnings: string[] = [];
        const role = el.getAttribute("role");
        const ariaHidden = h.isAriaHidden(el);
        const presentational = role === "presentation" || role === "none";
        const altAttr = el.getAttribute("alt");
        const name = h.accName(el);
        const link = el.closest("a[href], button");
        const inLink = !!link;
        let status: ImageStatus;

        if (ariaHidden || presentational) status = "装飾";
        else if (el.localName === "img" || el.localName === "area" || el.localName === "input") {
          const hasOtherName = el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby");
          if (altAttr === null && !hasOtherName) status = "alt属性なし";
          else if (altAttr === "" && !hasOtherName) status = "装飾";
          else status = "代替テキストあり";
        } else {
          status = name ? "代替テキストあり" : "名前なし";
        }

        if (status === "alt属性なし") warnings.push("alt 属性がありません（1.1.1）");
        if (status === "名前なし" && el.localName === "svg") warnings.push("SVG に名前も aria-hidden もありません。意味があれば role=\"img\" と aria-label、装飾なら aria-hidden=\"true\" を付けてください");
        if (status === "名前なし" && role === "img") warnings.push("role=\"img\" なのに名前がありません（1.1.1）");
        if (status === "代替テキストあり") {
          const n = name.trim();
          if (/\.(png|jpe?g|gif|svg|webp|avif)$/i.test(n)) warnings.push(`代替テキストがファイル名のようです:「${n}」`);
          if (GENERIC.includes(n.toLowerCase())) warnings.push(`代替テキストが「${n}」だけで、内容を説明していません`);
          if (/^(画像|写真|image of|picture of)/i.test(n) && n.length > 4) warnings.push("「画像：」のような前置きは読み上げで冗長になります");
          if (n.length > 150) warnings.push(`代替テキストが長すぎます（${n.length} 文字）。長い説明は本文や aria-describedby で`);
        }
        if (inLink && status !== "代替テキストあり" && link && !h.accName(link)) {
          warnings.push("リンク／ボタンの中身がこの画像だけなのに名前がありません。リンク先が伝わりません（2.4.4 / 4.1.2）");
        }
        if (inLink && status === "代替テキストあり" && link) {
          const linkText = h.textOf(link);
          if (linkText && name && linkText.includes(name) && linkText !== name) warnings.push("隣のリンクテキストと同じ代替テキストで、読み上げが重複します（alt=\"\" を検討）");
        }

        const src = el.getAttribute("src") ?? el.querySelector?.("use")?.getAttribute("href") ?? "";
        return {
          selector: h.cssPath(el),
          kind: el.localName === "input" ? "input[type=image]" : role === "img" && el.localName !== "img" ? `${el.localName}[role=img]` : el.localName,
          src: src.slice(0, 150),
          alt: el.localName === "img" || el.localName === "area" || el.localName === "input" ? altAttr : name || null,
          status,
          inLink,
          warnings,
        };
      });
  });
}

export function imagesToMarkdown(images: ImageInfo[]): string {
  const count = (s: ImageStatus) => images.filter((i) => i.status === s).length;
  const out = [
    "## 画像と代替テキスト",
    "",
    `合計 ${images.length} 件（代替テキストあり ${count("代替テキストあり")}・装飾 ${count("装飾")}・alt属性なし ${count("alt属性なし")}・名前なし ${count("名前なし")}）`,
    "",
    "| 状態 | 種類 | 代替テキスト | src / セレクタ | 指摘 |",
    "| --- | --- | --- | --- | --- |",
  ];
  const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const icon = (s: ImageStatus) => (s === "代替テキストあり" ? "🟢" : s === "装飾" ? "⚪" : "🔴");
  for (const i of images) {
    out.push(
      `| ${icon(i.status)} ${i.status} | ${i.kind}${i.inLink ? "（リンク内）" : ""} | ${i.alt === null ? "-" : `「${cell(i.alt.slice(0, 80))}」`} | ${cell(i.src || "")}<br>\`${cell(i.selector.slice(0, 80))}\` | ${i.warnings.map(cell).join("<br>")} |`,
    );
  }
  out.push("", "> 代替テキストが「適切か」は文脈次第なので、自動では判定できません。🟢 の内容も目で確認してください。");
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// ページ全体のコントラスト検査
// ---------------------------------------------------------------------------

export interface ContrastItem {
  selector: string;
  text: string;
  fg: string;
  bg: string;
  ratio: number;
  fontSizePx: number;
  fontWeight: number;
  large: boolean;
  passAA: boolean;
  passAAA: boolean;
  /** 背景画像やグラデーションがあり、正確に判定できない */
  needsReview: string | null;
}

export async function scanContrast(page: Page, opts: { selector?: string; limit?: number } = {}): Promise<ContrastItem[]> {
  await ensureHelpers(page);
  const raw = await page.evaluate(
    (rootSel, limit) => {
      const h = window.__a11yja;
      const root = rootSel ? document.querySelector(rootSel) : document.body;
      if (!root) throw new Error(`セレクタに一致する要素がありません: ${rootSel}`);
      const seen = new Set<Element>();
      const out: {
        selector: string; text: string; color: string; bgLayers: string[]; fontSize: number; fontWeight: number; review: string | null;
      }[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode() && out.length < limit) {
        const node = walker.currentNode;
        const el = node.parentElement;
        if (!el || seen.has(el) || !node.textContent?.trim()) continue;
        seen.add(el);
        if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(el.tagName)) continue;
        if (!h.isVisible(el) || h.isOffscreen(el)) continue;
        // 無効化された部品のテキストは 1.4.3 の対象外
        if (el.closest(":disabled, [aria-disabled='true']")) continue;
        const s = getComputedStyle(el);
        let review: string | null = null;
        const bgLayers: string[] = [];
        let cur: Element | null = el;
        while (cur) {
          const cs = getComputedStyle(cur);
          if (cs.backgroundImage && cs.backgroundImage !== "none") {
            review = cs.backgroundImage.includes("gradient") ? "背景にグラデーションがあります" : "背景画像があります";
            break;
          }
          bgLayers.push(cs.backgroundColor);
          if (/^rgb\(/.test(cs.backgroundColor)) break; // 不透明の背景に到達
          cur = cur.parentElement;
        }
        if (s.textShadow && s.textShadow !== "none") review ??= "text-shadow があります";
        out.push({
          selector: h.cssPath(el),
          text: node.textContent.trim().replace(/\s+/g, " ").slice(0, 60),
          color: s.color,
          bgLayers,
          fontSize: parseFloat(s.fontSize),
          fontWeight: Number(s.fontWeight) || 400,
          review,
        });
      }
      return out;
    },
    opts.selector ?? null,
    opts.limit ?? 1000,
  );

  return raw.map((r) => {
    // 背景色を下から順に重ねる（最後はページの既定の白）
    let bg: RGBA = { r: 255, g: 255, b: 255, a: 1 };
    for (const layer of [...r.bgLayers].reverse()) {
      try {
        bg = blend(parseColor(layer), bg);
      } catch {
        /* color() など未対応の書式は無視 */
      }
    }
    let fg: RGBA;
    try {
      fg = parseColor(r.color);
    } catch {
      fg = { r: 0, g: 0, b: 0, a: 1 };
    }
    const ratio = contrastRatio(fg, bg);
    const j = judge(ratio);
    const large = isLargeText(r.fontSize, r.fontWeight);
    return {
      selector: r.selector,
      text: r.text,
      fg: toHex(fg.a < 1 ? blend(fg, bg) : fg),
      bg: toHex(bg),
      ratio: j.ratio,
      fontSizePx: r.fontSize,
      fontWeight: r.fontWeight,
      large,
      passAA: large ? j.large.AA : j.normal.AA,
      passAAA: large ? j.large.AAA : j.normal.AAA,
      needsReview: r.review,
    };
  });
}

export function contrastScanToMarkdown(items: ContrastItem[], level: "AA" | "AAA"): string {
  const fails = items.filter((i) => !i.needsReview && !(level === "AA" ? i.passAA : i.passAAA));
  const reviews = items.filter((i) => i.needsReview);
  const out = [
    `## コントラスト検査（${level}）`,
    "",
    `テキスト要素 ${items.length} 件を検査: 不合格 ${fails.length} 件、要目視確認 ${reviews.length} 件`,
    "",
  ];
  const cell = (s: string) => s.replace(/\|/g, "\\|");
  if (fails.length) {
    out.push("### 不合格", "", "| テキスト | 前景 / 背景 | 比 | 文字 | 必要な比 | セレクタ |", "| --- | --- | ---: | --- | ---: | --- |");
    for (const f of fails.slice(0, 100)) {
      const need = level === "AA" ? (f.large ? 3 : 4.5) : f.large ? 4.5 : 7;
      out.push(
        `| ${cell(f.text)} | ${f.fg} / ${f.bg} | ${f.ratio.toFixed(2)}:1 | ${f.fontSizePx}px ${f.fontWeight}${f.large ? "（大）" : ""} | ${need}:1 | \`${cell(f.selector.slice(0, 80))}\` |`,
      );
    }
    if (fails.length > 100) out.push(`| …ほか ${fails.length - 100} 件 | | | | | |`);
    out.push("");
  }
  if (reviews.length) {
    out.push("### 要目視確認（背景画像・グラデーション等）", "");
    for (const r of reviews.slice(0, 30)) out.push(`- 「${r.text}」 \`${r.selector.slice(0, 80)}\`: ${r.needsReview}`);
    out.push("");
  }
  out.push("> 大きな文字 = 24px 以上、または 18.66px 以上の太字（700 以上）。基準: AA は通常 4.5:1・大 3:1、AAA は通常 7:1・大 4.5:1（1.4.3 / 1.4.6）。");
  return out.join("\n");
}
