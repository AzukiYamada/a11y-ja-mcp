import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Page } from "puppeteer-core";
import { CRITERIA, isJisTarget, tagToCriterionId } from "./wcag-ja.js";

const require = createRequire(import.meta.url);
let axeSource: string | undefined;
const locales: Record<string, unknown> = {};

function loadAxe(): string {
  axeSource ??= readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  return axeSource;
}

function loadLocale(lang: "ja" | "en"): unknown | undefined {
  if (lang === "en") return undefined;
  locales[lang] ??= JSON.parse(readFileSync(require.resolve(`axe-core/locales/${lang}.json`), "utf8"));
  return locales[lang];
}

export const LEVELS = ["wcag2aa", "wcag21aa", "wcag22aa", "wcag22aaa"] as const;
export type AuditLevel = (typeof LEVELS)[number];

export const LEVEL_LABEL: Record<AuditLevel, string> = {
  wcag2aa: "WCAG 2.0 AA（JIS X 8341-3:2016 AA 相当）",
  wcag21aa: "WCAG 2.1 AA",
  wcag22aa: "WCAG 2.2 AA",
  wcag22aaa: "WCAG 2.2 AAA",
};

function tagsFor(level: AuditLevel, bestPractices: boolean): string[] {
  const tags = ["wcag2a", "wcag2aa"];
  if (level !== "wcag2aa") tags.push("wcag21a", "wcag21aa");
  if (level === "wcag22aa" || level === "wcag22aaa") tags.push("wcag22aa");
  if (level === "wcag22aaa") tags.push("wcag2aaa", "wcag21aaa", "wcag22aaa");
  if (bestPractices) tags.push("best-practice");
  return tags;
}

export type Impact = "critical" | "serious" | "moderate" | "minor";
export const IMPACT_ORDER: Impact[] = ["critical", "serious", "moderate", "minor"];
export const IMPACT_JA: Record<Impact, string> = {
  critical: "致命的",
  serious: "重大",
  moderate: "中程度",
  minor: "軽微",
};

export interface IssueNode {
  selector: string;
  html: string;
  summary: string;
}

export interface Issue {
  ruleId: string;
  impact: Impact | null;
  help: string;
  description: string;
  helpUrl: string;
  /** 関連する達成基準（例: "1.4.3"） */
  criteria: string[];
  /** JIS X 8341-3:2016 の対象基準を含むか */
  jis: boolean;
  bestPractice: boolean;
  nodes: IssueNode[];
}

export interface AxeResult {
  url: string;
  title: string;
  level: AuditLevel;
  timestamp: string;
  violations: Issue[];
  /** 自動判定できず、人の確認が必要なもの */
  incomplete: Issue[];
  passCount: number;
}

interface RawNode {
  target: unknown[];
  html: string;
  failureSummary?: string;
  any?: { message: string }[];
}
interface RawResult {
  id: string;
  impact?: Impact | null;
  help: string;
  description: string;
  helpUrl: string;
  tags: string[];
  nodes: RawNode[];
}

function normalize(r: RawResult): Issue {
  const criteria = r.tags.map(tagToCriterionId).filter((x): x is string => !!x);
  return {
    ruleId: r.id,
    impact: r.impact ?? null,
    help: r.help,
    description: r.description,
    helpUrl: r.helpUrl,
    criteria,
    jis: criteria.some((id) => {
      const c = CRITERIA.get(id);
      return c ? isJisTarget(c) : false;
    }),
    bestPractice: r.tags.includes("best-practice"),
    nodes: r.nodes.map((n) => ({
      selector: n.target.map((t) => (Array.isArray(t) ? t.join(" >>> ") : String(t))).join(" "),
      html: n.html.length > 300 ? n.html.slice(0, 300) + "…" : n.html,
      summary: (n.failureSummary ?? n.any?.map((a) => a.message).join(" / ") ?? "").trim(),
    })),
  };
}

function sortIssues(list: Issue[]): Issue[] {
  const rank = (i: Issue) => (i.impact ? IMPACT_ORDER.indexOf(i.impact) : 9);
  return list.sort((a, b) => rank(a) - rank(b) || b.nodes.length - a.nodes.length);
}

export interface RunAxeOptions {
  level?: AuditLevel;
  bestPractices?: boolean;
  /** 検査範囲を絞る CSS セレクタ */
  include?: string;
  lang?: "ja" | "en";
}

export async function runAxe(page: Page, opts: RunAxeOptions = {}): Promise<AxeResult> {
  const level = opts.level ?? "wcag22aa";
  const lang = opts.lang ?? "ja";
  const hasAxe = await page.evaluate(() => typeof (window as unknown as { axe?: unknown }).axe !== "undefined");
  if (!hasAxe) await page.evaluate(loadAxe());

  const raw = await page.evaluate(
    async (locale, tags, include) => {
      const axe = (window as unknown as { axe: any }).axe;
      axe.reset();
      if (locale) axe.configure({ locale });
      const context = include ? { include: [include] } : document;
      const res = await axe.run(context, {
        runOnly: { type: "tag", values: tags },
        resultTypes: ["violations", "incomplete"],
      });
      return {
        violations: res.violations,
        incomplete: res.incomplete,
        passCount: res.passes.length,
      };
    },
    loadLocale(lang) ?? null,
    tagsFor(level, opts.bestPractices ?? false),
    opts.include ?? null,
  );

  return {
    url: page.url(),
    title: await page.title(),
    level,
    timestamp: new Date().toISOString(),
    violations: sortIssues((raw.violations as RawResult[]).map(normalize)),
    incomplete: sortIssues((raw.incomplete as RawResult[]).map(normalize)),
    passCount: raw.passCount,
  };
}
