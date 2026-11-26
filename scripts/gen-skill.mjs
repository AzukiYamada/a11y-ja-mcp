// dist/prompts.js の監査テンプレートから skills/a11y-audit/SKILL.md を生成する
import { mkdirSync, writeFileSync } from "node:fs";
import { AUDIT_TEMPLATE } from "../dist/prompts.js";

const body = AUDIT_TEMPLATE.replaceAll("{{url}}", "対象 URL").replaceAll("{{level}}", "WCAG 2.2 AA（ユーザーの指定があればそれに従う）");
const skill = `---
name: a11y-audit
description: a11y-ja-mcp のツールを使って Web ページのアクセシビリティ監査（WCAG 2.2 / JIS X 8341-3）を行い、日本語のレポートを作る。「アクセシビリティ監査して」「a11y チェックして」「WCAG に準拠しているか見て」等で使う。
---

<!-- このファイルは scripts/gen-skill.mjs で生成しています。編集は src/prompts.ts へ。 -->

${body}`;
mkdirSync("skills/a11y-audit", { recursive: true });
writeFileSync("skills/a11y-audit/SKILL.md", skill);
