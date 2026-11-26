/**
 * 操作によって状態が変わる UI（モーダル、開閉 UI）を、キーボードで実際に操作して検査する。
 * WAI-ARIA Authoring Practices Guide（APG）のキーボード操作パターンを基準にしている。
 */
import type { ElementHandle, Page } from "puppeteer-core";
import { runAxe, type Issue } from "./axe.js";
import { ensureHelpers } from "./page-helpers.js";
import { describeCriterion } from "./wcag-ja.js";

export interface Check {
  /** 何を確かめたか */
  label: string;
  /** true: 合格 / false: 不合格 / null: 確認できなかった（前の手順が失敗した等） */
  ok: boolean | null;
  /** 関連する達成基準（例: "2.4.3"）。空なら WCAG の必須要件ではなく WAI-ARIA APG の推奨 */
  criteria: string[];
  detail?: string;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getTrigger(page: Page, selector: string): Promise<ElementHandle<Element>> {
  const el = await page.$(selector);
  if (!el) throw new Error(`セレクタに一致する要素がありません: ${selector}`);
  return el;
}

/** 要素がキーボードでフォーカスできるか（focus() したあと実際に activeElement になるか） */
async function focusTrigger(el: ElementHandle<Element>): Promise<boolean> {
  return el.evaluate((e) => {
    (e as HTMLElement).focus();
    const tabbable = (e as HTMLElement).tabIndex >= 0;
    return document.activeElement === e && tabbable;
  });
}

// ---------------------------------------------------------------------------
// モーダル（ダイアログ）
// ---------------------------------------------------------------------------

export interface ModalResult {
  trigger: string;
  dialog: string | null;
  openedBy: "keyboard" | "click" | null;
  checks: Check[];
  /** モーダルを開いた状態で axe-core にかけた結果（違反のみ） */
  axeViolations: Issue[];
}

/** 表示されているダイアログらしき要素のセレクタ一覧 */
async function visibleDialogs(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const h = window.__a11yja;
    return [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open], [aria-modal="true"]')]
      .filter((el) => h.isVisible(el))
      .map((el) => h.cssPath(el));
  });
}

export async function checkModal(
  page: Page,
  opts: { trigger: string; dialog?: string; maxTabs?: number },
): Promise<ModalResult> {
  await ensureHelpers(page);
  const checks: Check[] = [];
  const result: ModalResult = { trigger: opts.trigger, dialog: null, openedBy: null, checks, axeViolations: [] };

  const trigger = await getTrigger(page, opts.trigger);
  const before = new Set(await visibleDialogs(page));

  const findDialog = async (): Promise<string | null> => {
    if (opts.dialog) {
      const visible = await page.$eval(opts.dialog, (el) => window.__a11yja.isVisible(el)).catch(() => false);
      return visible ? opts.dialog : null;
    }
    const after = await visibleDialogs(page);
    return after.find((s) => !before.has(s)) ?? null;
  };

  // 1. キーボードで開けるか
  const focusable = await focusTrigger(trigger);
  if (focusable) {
    await page.keyboard.press("Enter");
    await wait(400);
    result.dialog = await findDialog();
    if (result.dialog) result.openedBy = "keyboard";
  }
  checks.push({
    label: "開くボタンにキーボードでフォーカスでき、Enter で開ける",
    ok: !!result.dialog,
    criteria: ["2.1.1"],
    detail: !focusable
      ? "開くボタンに Tab でフォーカスできません（button 要素を使うか、tabindex=\"0\" とキー操作の処理が必要です）"
      : result.dialog
        ? undefined
        : "Enter を押してもモーダルが開きませんでした",
  });

  // キーボードで開けなかった場合でも、残りを検査するためにクリックで開いてみる
  if (!result.dialog) {
    await trigger.click().catch(() => {});
    await wait(400);
    result.dialog = await findDialog();
    if (result.dialog) result.openedBy = "click";
  }
  if (!result.dialog) {
    checks.push({
      label: "モーダルを検出できる",
      ok: false,
      criteria: ["4.1.2"],
      detail:
        'クリックしても role="dialog" / dialog 要素 / aria-modal="true" を持つ要素が現れませんでした。見た目はモーダルでも、支援技術にはモーダルとして伝わっていない可能性があります（dialog 引数でモーダルのセレクタを指定すると、その要素で検査します）',
    });
    return result;
  }
  const dialogSel = result.dialog;

  // 2. モーダルの名前と役割
  const info = await page.$eval(dialogSel, (el) => {
    const h = window.__a11yja;
    const role = el.getAttribute("role") ?? (el.localName === "dialog" ? "dialog" : "");
    const modal = el.getAttribute("aria-modal") === "true" || (el.localName === "dialog" && (el as HTMLDialogElement).matches(":modal"));
    const name = el.getAttribute("aria-label") || (el.getAttribute("aria-labelledby") ? h.accName(el) : "");
    return { role, modal, name };
  });
  checks.push({
    label: "モーダルに役割（role=\"dialog\" など）と名前がある",
    ok: !!info.role && !!info.name,
    criteria: ["4.1.2"],
    detail: !info.role ? "役割がありません" : !info.name ? "aria-labelledby か aria-label で名前（見出しなど）を付けてください" : `「${info.name}」`,
  });
  checks.push({
    label: "モーダルであることが伝わる（aria-modal=\"true\" または showModal()）",
    ok: info.modal,
    criteria: [],
    detail: info.modal ? undefined : "背面の内容がスクリーンリーダーで読めてしまう可能性があります",
  });

  // 3. 開いたときにフォーカスがモーダル内へ移るか
  const inside = () =>
    page.$eval(dialogSel, (d) => {
      let a = document.activeElement;
      while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
      return !!a && d.contains(a);
    });
  const movedIn = await inside();
  checks.push({
    label: "開いたときにフォーカスがモーダルの中へ移る",
    ok: movedIn,
    criteria: ["2.4.3"],
    detail: movedIn ? undefined : "フォーカスが開くボタンなど背面に残ったままです",
  });

  // 4. Tab / Shift+Tab で背面へ抜けないか
  const focusableCount = await page.$eval(dialogSel, (d) =>
    [...d.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
      (e) => window.__a11yja.isVisible(e) && !(e as HTMLButtonElement).disabled,
    ).length,
  );
  const tabs = Math.min(Math.max(focusableCount + 2, 3), opts.maxTabs ?? 30);
  let escaped: string | null = null;
  for (let i = 0; i < tabs && !escaped; i++) {
    await page.keyboard.press("Tab");
    if (!(await inside())) escaped = await page.evaluate(() => window.__a11yja.cssPath(document.activeElement ?? document.body));
  }
  if (!escaped) {
    for (let i = 0; i < 2 && !escaped; i++) {
      await page.keyboard.down("Shift");
      await page.keyboard.press("Tab");
      await page.keyboard.up("Shift");
      if (!(await inside())) escaped = await page.evaluate(() => window.__a11yja.cssPath(document.activeElement ?? document.body));
    }
  }
  checks.push({
    label: "Tab / Shift+Tab でフォーカスがモーダルの外（背面）へ出ない",
    ok: movedIn ? !escaped : null,
    criteria: ["2.4.3"],
    detail: !movedIn
      ? "フォーカスがモーダル内に入らないため確認できません"
      : escaped
        ? `背面の要素 \`${escaped}\` にフォーカスが移りました`
        : focusableCount === 0
          ? "モーダル内にフォーカスできる要素がありません（閉じるボタンなどを置いてください）"
          : undefined,
  });

  // 5. 開いた状態で axe-core
  try {
    const axe = await runAxe(page, { include: dialogSel });
    result.axeViolations = axe.violations;
  } catch {
    /* axe が失敗しても他の結果は返す */
  }

  // 6. Escape で閉じられるか
  if (!movedIn) {
    // フォーカスがモーダル外だと Escape を受け取れない実装が多いので、中へ移してから試す
    await page.$eval(dialogSel, (d) => {
      const first = d.querySelector<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      (first ?? (d as HTMLElement)).focus();
    });
  }
  await page.keyboard.press("Escape");
  await wait(400);
  const stillOpen = await page.$eval(dialogSel, (el) => window.__a11yja.isVisible(el)).catch(() => false);
  checks.push({
    label: "Escape キーで閉じられる",
    ok: !stillOpen,
    criteria: [],
    detail: stillOpen ? "Escape を押しても閉じませんでした（APG のダイアログパターンでは Escape で閉じるのが基本です）" : undefined,
  });

  // Escape で閉じなければ、モーダル内の「閉じる」系のボタンをキーボードで押して閉じる
  let closedBy = stillOpen ? "" : "Escape";
  if (stillOpen) {
    const closeLabel = await page.$eval(dialogSel, (d) => {
      const h = window.__a11yja;
      const btn = [...d.querySelectorAll<HTMLElement>("button, [role='button'], a[href]")].find((b) =>
        /閉じる|キャンセル|close|cancel|^×$|^✕$/i.test(h.accName(b).trim()),
      );
      if (!btn) return null;
      btn.focus();
      return h.accName(btn).trim();
    });
    if (closeLabel) {
      await page.keyboard.press("Enter");
      await wait(400);
      const open = await page.$eval(dialogSel, (el) => window.__a11yja.isVisible(el)).catch(() => false);
      if (!open) closedBy = `「${closeLabel}」ボタン`;
    }
  }

  // 7. 閉じたあとフォーカスが開くボタンに戻るか
  if (closedBy) {
    const returned = await trigger.evaluate((e) => document.activeElement === e);
    const where = returned ? "" : await page.evaluate(() => window.__a11yja.cssPath(document.activeElement ?? document.body) || "body");
    checks.push({
      label: "閉じたあと、フォーカスが開くボタンに戻る",
      ok: returned,
      criteria: ["2.4.3"],
      detail: `${closedBy}で閉じて確認。${returned ? "" : `フォーカスは \`${where}\` にあります。キーボード利用者は操作していた場所を見失います`}`,
    });
  } else {
    checks.push({
      label: "閉じたあと、フォーカスが開くボタンに戻る",
      ok: null,
      criteria: ["2.4.3"],
      detail: "Escape でも、閉じるボタンでも閉じられなかったため確認できません",
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// 開閉 UI（アコーディオン、メニューボタン、ドロップダウンなど）
// ---------------------------------------------------------------------------

export interface DisclosureResult {
  trigger: string;
  controls: string | null;
  checks: Check[];
}

export async function checkDisclosure(page: Page, opts: { trigger: string; content?: string }): Promise<DisclosureResult> {
  await ensureHelpers(page);
  const checks: Check[] = [];
  const trigger = await getTrigger(page, opts.trigger);

  const state = () =>
    trigger.evaluate((e, contentSel) => {
      const h = window.__a11yja;
      const expanded = e.getAttribute("aria-expanded");
      const controlsId = e.getAttribute("aria-controls");
      const target = (contentSel ? document.querySelector(contentSel) : null) ?? (controlsId ? document.getElementById(controlsId) : null);
      return {
        expanded,
        controls: target ? h.cssPath(target) : null,
        visible: target ? h.isVisible(target) : null,
        role: h.role(e),
        name: h.accName(e),
      };
    }, opts.content ?? null);

  const s0 = await state();
  const focusable = await focusTrigger(trigger);

  checks.push({
    label: "ボタンとして伝わる役割と名前がある",
    ok: s0.role === "button" && !!s0.name,
    criteria: ["4.1.2"],
    detail: s0.role !== "button" ? `役割が「${s0.role || "なし"}」です（button 要素を使ってください）` : !s0.name ? "名前がありません" : `「${s0.name}」`,
  });
  checks.push({
    label: "開閉の状態が aria-expanded で伝わる",
    ok: s0.expanded === "true" || s0.expanded === "false",
    criteria: ["4.1.2"],
    detail: s0.expanded === null ? "aria-expanded がありません。開いているか閉じているかがスクリーンリーダーに伝わりません" : undefined,
  });

  let toggledByKeyboard = false;
  const results: string[] = [];
  if (focusable) {
    for (const key of ["Enter", " "] as const) {
      const before = await state();
      await page.keyboard.press(key === " " ? "Space" : key);
      await wait(300);
      const after = await state();
      const changed = after.expanded !== before.expanded || after.visible !== before.visible;
      results.push(`${key === " " ? "Space" : "Enter"}: ${changed ? "切り替わった" : "変化なし"}`);
      if (changed) toggledByKeyboard = true;
      // 状態の整合性
      if (changed && after.expanded !== null && after.visible !== null) {
        const consistent = (after.expanded === "true") === after.visible;
        if (!consistent) {
          checks.push({
            label: "aria-expanded と実際の表示が一致している",
            ok: false,
            criteria: ["4.1.2"],
            detail: `aria-expanded="${after.expanded}" なのに、中身は${after.visible ? "表示" : "非表示"}されています`,
          });
        }
      }
    }
  }
  checks.push({
    label: "キーボード（Enter / Space）で開閉できる",
    ok: toggledByKeyboard,
    criteria: ["2.1.1"],
    detail: !focusable ? "Tab でフォーカスできません" : results.join("、"),
  });
  if (!checks.some((c) => c.label === "aria-expanded と実際の表示が一致している") && s0.controls) {
    const s = await state();
    if (s.expanded !== null && s.visible !== null) {
      checks.push({
        label: "aria-expanded と実際の表示が一致している",
        ok: (s.expanded === "true") === s.visible,
        criteria: ["4.1.2"],
      });
    }
  }
  if (!s0.controls) {
    checks.push({
      label: "開閉する中身を特定できる",
      ok: null,
      criteria: ["1.3.1"],
      detail: "aria-controls がなく、content 引数も指定されていないため、中身の表示は確認していません",
    });
  }
  return { trigger: opts.trigger, controls: s0.controls, checks };
}

// ---------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------

const icon = (c: Check) => (c.ok === true ? "✅" : c.ok === null ? "⚪" : c.criteria.length ? "❌" : "⚠️");

function checksToMarkdown(checks: Check[]): string[] {
  const out: string[] = [];
  for (const c of checks) {
    const crit = c.criteria.length ? c.criteria.map(describeCriterion).join("、") : "WCAG の必須要件ではなく、WAI-ARIA APG の推奨";
    out.push(`- ${icon(c)} ${c.label}（${crit}）`);
    if (c.detail) out.push(`  - ${c.detail}`);
  }
  return out;
}

function summary(checks: Check[]): string {
  const fail = checks.filter((c) => c.ok === false && c.criteria.length).length;
  const apg = checks.filter((c) => c.ok === false && !c.criteria.length).length;
  const unknown = checks.filter((c) => c.ok === null).length;
  const parts = [];
  if (fail) parts.push(`❌ WCAG に関わる問題 ${fail} 件`);
  if (apg) parts.push(`⚠️ APG の推奨を満たさない項目 ${apg} 件`);
  if (!parts.length) parts.push("✅ 問題は見つかりませんでした");
  if (unknown) parts.push(`確認できなかった項目 ${unknown} 件`);
  return parts.join("、");
}

export function modalToMarkdown(r: ModalResult): string {
  const out = [
    "## モーダルの検査",
    "",
    `- 開くボタン: \`${r.trigger}\``,
    `- モーダル: ${r.dialog ? `\`${r.dialog}\`` : "検出できず"}${r.openedBy === "click" ? "（キーボードでは開けなかったため、クリックで開いて検査）" : ""}`,
    `- 結果: ${summary(r.checks)}`,
    "",
    ...checksToMarkdown(r.checks),
  ];
  if (r.dialog) {
    out.push("", "### 開いた状態での axe-core の検査", "");
    if (!r.axeViolations.length) out.push("- 違反は見つかりませんでした");
    for (const v of r.axeViolations) {
      out.push(`- ${v.help}（${v.nodes.length} 件）: ${v.criteria.map(describeCriterion).join("、") || v.ruleId}`);
    }
  }
  return out.join("\n");
}

export function disclosureToMarkdown(r: DisclosureResult): string {
  return [
    "## 開閉 UI の検査",
    "",
    `- ボタン: \`${r.trigger}\``,
    `- 開閉する中身: ${r.controls ? `\`${r.controls}\`` : "特定できず"}`,
    `- 結果: ${summary(r.checks)}`,
    "",
    ...checksToMarkdown(r.checks),
  ].join("\n");
}
