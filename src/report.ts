import { IMPACT_JA, IMPACT_ORDER, LEVEL_LABEL, type AxeResult, type Impact, type Issue } from "./axe.js";
import { describeCriterion } from "./wcag-ja.js";

export interface MarkdownOptions {
  /** 1 つの問題につき表示する要素数の上限 */
  maxNodes?: number;
  /** 「要確認」項目も出力するか */
  includeIncomplete?: boolean;
}

export function countByImpact(issues: Issue[]): Record<Impact | "unknown", number> {
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 };
  for (const i of issues) counts[i.impact ?? "unknown"] += i.nodes.length;
  return counts;
}

/** failOn 以上の深刻度の違反があるか */
export function hasFailures(result: AxeResult, failOn: Impact): boolean {
  const threshold = IMPACT_ORDER.indexOf(failOn);
  return result.violations.some((v) => v.impact && IMPACT_ORDER.indexOf(v.impact) <= threshold);
}

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

function issueToMarkdown(issue: Issue, maxNodes: number): string {
  const impact = issue.impact ? `【${IMPACT_JA[issue.impact]}】` : "";
  const lines: string[] = [];
  lines.push(`#### ${impact}${issue.help}（${issue.nodes.length} 件）`);
  lines.push("");
  lines.push(`- ルール: \`${issue.ruleId}\`${issue.bestPractice ? "（ベストプラクティス）" : ""}`);
  if (issue.criteria.length) lines.push(`- 達成基準: ${issue.criteria.map(describeCriterion).join("、")}`);
  lines.push(`- 説明: ${issue.description}`);
  lines.push(`- 参考: ${issue.helpUrl}`);
  lines.push("");
  for (const n of issue.nodes.slice(0, maxNodes)) {
    lines.push(`- \`${n.selector}\``);
    lines.push(`  - HTML: \`${n.html.replace(/`/g, "'").replace(/\s+/g, " ")}\``);
    if (n.summary) lines.push(`  - ${n.summary.replace(/:\s*\n\s*/g, ": ").replace(/\s*\n\s*/g, " / ")}`);
  }
  if (issue.nodes.length > maxNodes) lines.push(`- …ほか ${issue.nodes.length - maxNodes} 件`);
  lines.push("");
  return lines.join("\n");
}

export function resultToMarkdown(r: AxeResult, opts: MarkdownOptions = {}): string {
  const maxNodes = opts.maxNodes ?? 10;
  const c = countByImpact(r.violations);
  const total = r.violations.reduce((s, v) => s + v.nodes.length, 0);
  const out: string[] = [];
  out.push(`### ${esc(r.title || "(タイトルなし)")}`);
  out.push("");
  out.push(`- URL: ${r.url}`);
  out.push(`- 基準: ${LEVEL_LABEL[r.level]}`);
  out.push(`- 実施日時: ${r.timestamp}`);
  out.push(
    `- 結果: 違反 ${r.violations.length} ルール / ${total} 箇所（致命的 ${c.critical}・重大 ${c.serious}・中程度 ${c.moderate}・軽微 ${c.minor}）、要確認 ${r.incomplete.length} ルール、合格 ${r.passCount} ルール`,
  );
  out.push("");
  if (r.violations.length === 0) {
    out.push("自動検査で検出された違反はありません。※自動検査で見つかるのは問題の一部です。手動での確認も行ってください。");
    out.push("");
  } else {
    out.push("#### 違反");
    out.push("");
    for (const v of r.violations) out.push(issueToMarkdown(v, maxNodes));
  }
  if (opts.includeIncomplete !== false && r.incomplete.length) {
    out.push("#### 要確認（自動判定できなかった項目）");
    out.push("");
    for (const v of r.incomplete) out.push(issueToMarkdown(v, Math.min(maxNodes, 5)));
  }
  return out.join("\n");
}

export function resultsToMarkdown(results: AxeResult[], errors: { url: string; error: string }[] = [], opts: MarkdownOptions = {}): string {
  const out: string[] = ["# アクセシビリティ検査レポート", ""];
  out.push("| ページ | 致命的 | 重大 | 中程度 | 軽微 | 要確認 |");
  out.push("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const r of results) {
    const c = countByImpact(r.violations);
    out.push(`| [${esc(r.title || r.url)}](${r.url}) | ${c.critical} | ${c.serious} | ${c.moderate} | ${c.minor} | ${r.incomplete.length} |`);
  }
  for (const e of errors) out.push(`| ${e.url} | ⚠️ 取得失敗 | | | | |`);
  out.push("");
  out.push("> 自動検査（axe-core）で検出できるのは WCAG の問題の一部です。キーボード操作・スクリーンリーダーでの確認など、手動検査と組み合わせてください。");
  out.push("");
  if (errors.length) {
    out.push("## 取得に失敗したページ", "");
    for (const e of errors) out.push(`- ${e.url}: ${e.error}`);
    out.push("");
  }
  out.push("## ページごとの詳細", "");
  for (const r of results) out.push(resultToMarkdown(r, opts));
  return out.join("\n");
}
