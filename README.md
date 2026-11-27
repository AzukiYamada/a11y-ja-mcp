# a11y-ja-mcp

日本語 | [English](#english)

**AI エージェントにページを操作させて、アクセシビリティを検査する MCP サーバー**

Claude Code や Cursor などのエージェントに、ローカルの Chrome を操作して検査する道具を渡します。
ページを開いた直後の HTML だけでなく、Tab を押したとき、モーダルやメニューを開いたときなど、**実際に使ったときの状態**を検査できます。
各指摘には WCAG の達成基準と、JIS X 8341-3 の対象かどうかが付きます。

たとえば、フォーカスの扱いだけを壊したモーダルは、Lighthouse と axe-core では 100 点・指摘なしになりますが、a11y-ja-mcp では検出できます（[検出の比較](#検出の比較)）。

## 特徴

- **操作して確かめる**: 実際に Tab キーを押して、フォーカスの順番・見え方・キーボードトラップを記録します
- **状態が変わる UI の検査**: モーダルや開閉 UI（アコーディオン、メニューボタンなど）をキーボードで操作し、フォーカスの移動や閉じ方を WAI-ARIA APG のパターンに沿って確かめます
- **JIS X 8341-3 対応**: 各指摘に「JIS対象」かどうかを表示します。JIS X 8341-3:2016 AA 相当の基準で検査することもできます
- **CI 対応**: 同じ検査を CLI から実行し、レポートと終了コードを返します
- **そのほかの検査**: axe-core による自動検査、画像の代替テキスト、コントラスト、見出し・ランドマーク

## セットアップ

Node.js 20 以上と Google Chrome（または Chromium / Microsoft Edge）が必要です。

### Claude Code

```sh
claude mcp add a11y-ja -- npx -y a11y-ja-mcp
```

### その他の MCP クライアント（Cursor / Claude Desktop など）

```json
{
  "mcpServers": {
    "a11y-ja": {
      "command": "npx",
      "args": ["-y", "a11y-ja-mcp"]
    }
  }
}
```

| 環境変数 | 内容 |
| --- | --- |
| `A11Y_CHROME_PATH` | Chrome の実行ファイルのパス（自動で見つからない場合） |
| `A11Y_HEADLESS=false` | ブラウザの画面を表示する |

## 使い方

エージェントに頼むだけです。

> http://localhost:3000 をアクセシビリティ監査して。JIS X 8341-3 の AA が目標です

> 「予約する」ボタンで開くモーダルを、キーボードだけで開いて閉じられるか確かめて

> お問い合わせフォームを空のまま送信したときのエラー表示を、キーボードだけで確認して

監査の手順とレポートの雛形は、MCP プロンプト `a11y_audit`（引数: `url`, `level`）で使えます。Claude Code なら、`skills/a11y-audit/SKILL.md` を `~/.claude/skills/a11y-audit/` にコピーすると、スキルとしても使えます。

## ツール一覧

### ページの操作

| ツール | 内容 |
| --- | --- |
| `navigate` | URL を開く（`http://localhost` や `file://` も可） |
| `click` / `type_text` / `set_checked` / `select_option` | クリック・入力・チェック・選択 |
| `press_key` | キーを押す（`Tab`, `Shift+Tab`, `Enter`, `Escape`, `ArrowDown` など）。押したあとのフォーカス先を返す |
| `screenshot` | スクリーンショット |

### 状態が変わる UI の検査

| ツール | 内容 |
| --- | --- |
| `check_modal` | モーダルを Enter で開き、フォーカスがモーダル内へ移るか・Tab で背面へ抜けないか・Escape で閉じられるか・閉じたあと開くボタンへフォーカスが戻るかを検査。開いた状態で axe-core もかける |
| `check_disclosure` | アコーディオンやメニューボタンなどの開閉 UI について、Enter / Space で開閉できるか、`aria-expanded` が正しく切り替わるかを検査 |

結果は、WCAG の達成基準に関わる問題（❌）と、WCAG の必須要件ではないが WAI-ARIA APG で推奨されている項目（⚠️、例: Escape で閉じられる）を分けて表示します。

### ページの検査

| ツール | 内容 |
| --- | --- |
| `tab_order` | 実際に Tab を押してフォーカス順を記録。見えない要素へのフォーカス、名前のない要素、フォーカス表示の変化なし、正の tabindex、キーボードトラップを指摘 |
| `axe_scan` | axe-core で自動検査。基準（WCAG 2.0 AA = JIS 相当 / 2.1 AA / 2.2 AA / 2.2 AAA）と範囲（CSS セレクタ）を指定可 |
| `page_structure` | 見出しのアウトライン、ランドマーク、lang、タイトル、スキップリンク、iframe の title、ラベルのないフォーム部品 |
| `images` | 画像を「代替テキストあり / 装飾（alt=""）/ alt 属性なし / 名前なし」に分類。ファイル名だけの alt、リンク画像の名前抜けなども指摘 |
| `contrast_ratio` | 2 色のコントラスト比と、AA / AAA・通常の文字 / 大きな文字 / UI 部品ごとの合否 |
| `contrast_scan` | ページ内のテキストのコントラストを一括検査。背景画像・グラデーション上の文字は「要目視確認」に分類 |
| `audit_urls` | 複数ページを一括検査して Markdown / JSON のレポートを作成（ファイル保存可） |

検査系のツールは `format` 引数で出力を選べます。

- `markdown`（既定）: 人が読むレポート
- `json`: 達成基準・JIS 対象かどうか・該当要素（セレクタと HTML）などを含む構造化データ。エージェントが結果を見てそのまま修正したいとき向け
- `raw`（`axe_scan` のみ）: `json` に axe-core の `axe.run()` の生の結果を加えたもの

## 検出の比較

正常なモーダルと、そこから 1 か所だけを壊したモーダル（[examples/modals/](examples/modals/)）を用意し、3 つのツールで検査しました。どのモーダルも、役割（`role="dialog"`）・名前・`aria-modal` は正しく付けてあり、違いはキーボード操作とフォーカスの扱いだけです。

| モーダル | Lighthouse 13.6.0（アクセシビリティ） | axe-core（ページを開いた状態） | axe-core（モーダルを開いた状態） | a11y-ja-mcp `check_modal` |
| --- | --- | --- | --- | --- |
| 正常なモーダル | ✅ 指摘なし（100 点） | ✅ 指摘なし | ✅ 指摘なし | ✅ 指摘なし |
| フォーカスが背面に残る | ❌ 見逃し（100 点） | ❌ 見逃し | ❌ 見逃し | ✅ 検出 |
| Tab で背面に抜ける | ❌ 見逃し（100 点） | ❌ 見逃し | ❌ 見逃し | ✅ 検出 |
| Escape で閉じられない | ❌ 見逃し（100 点） | ❌ 見逃し | ❌ 見逃し | ✅ 検出 |
| 閉じてもフォーカスが戻らない | ❌ 見逃し（100 点） | ❌ 見逃し | ❌ 見逃し | ✅ 検出 |

- Lighthouse と axe-core は HTML と見た目を調べるツールで、キーボードで操作したときの振る舞いは検査の対象外です。上の結果はツールの欠陥ではなく、検査している範囲の違いです
- axe-core は 4.14（WCAG 2.2 AA + ベストプラクティス）。a11y-ja-mcp は、狙った 1 項目以外に誤検出がないことも確かめています
- 再現するには `npm run build && node scripts/benchmark-modals.mjs` を実行してください

## CLI（CI 向け）

MCP と同じ検査を CLI から実行できます。

```sh
npx a11y-ja-mcp audit https://example.com https://example.com/about \
  --level wcag2aa --fail-on serious --out a11y-report.md
```

| オプション | 内容 |
| --- | --- |
| `--level` | `wcag2aa`（JIS 相当） / `wcag21aa` / `wcag22aa`（既定） / `wcag22aaa` |
| `--format` | `markdown`（既定） / `json` |
| `--out` | 保存先（省略時は標準出力） |
| `--fail-on` | この深刻度以上の違反があれば終了コード 1。`critical` / `serious`（既定） / `moderate` / `minor` / `none` |
| `--urls-file` | URL を 1 行 1 つで書いたファイル（`#` で始まる行は無視） |
| `--best-practices` | WCAG 外のベストプラクティスも含める |
| `--lang` | `ja`（既定） / `en` |

GitHub Actions の例は [examples/github-actions/a11y.yml](examples/github-actions/a11y.yml) にあります。レポートをジョブのサマリーに表示できます。

## 制限事項

- 自動検査で見つかるのは WCAG の問題の一部です。スクリーンリーダーでの読み上げ、動画のキャプション、代替テキストの内容が適切かどうかなどは、人の確認が必要です
- `tab_order` のフォーカス表示の判定は、フォーカスの前後で outline などのスタイルが変わったかで推定しています
- `contrast_scan` は、背景画像・グラデーション・重なった要素の上の文字を正確に判定できません（要目視確認として出力します）
- `check_modal` は、開いたあとに表示された `role="dialog"` / `role="alertdialog"` / `dialog` 要素 / `aria-modal="true"` の要素をモーダルとして検出します。見つからない場合は、`dialog` 引数でモーダルのセレクタを指定してください
- `check_disclosure` で中身の表示まで確かめるには、ボタンに `aria-controls` があるか、`content` 引数で中身のセレクタを指定する必要があります
- 「JIS対象」は、JIS X 8341-3:2016（WCAG 2.0 と同じ内容）の A / AA の達成基準を指します

## 開発

```sh
npm install
npm test     # ビルドとテスト（ブラウザを使うテストもあるので Chrome が必要）
```

`examples/` に検証用のページがあります。

| ファイル | 内容 |
| --- | --- |
| `bad.html` | 代替テキスト・コントラスト・Tab 順序などの問題を仕込んだページ |
| `trap.html` | キーボードトラップのあるページ |
| `components.html` | モーダルと開閉 UI の良い例・悪い例 |
| `modals/` | 正常なモーダルと、1 か所だけ壊したモーダル（検出の比較に使用） |

## ライセンス

MIT

---

## English

[日本語](#a11y-ja-mcp) | English

**An MCP server that lets AI agents operate pages and test their accessibility**

It gives agents such as Claude Code and Cursor tools to drive a local Chrome.
Instead of checking only the HTML right after the page loads, it tests **the page as it is actually used**: after pressing Tab, after opening a modal or a menu, and so on.
Every finding is annotated with its WCAG success criterion and whether it falls under JIS X 8341-3 (Japan's web accessibility standard).

For example, a modal with broken focus handling scores 100 in Lighthouse and passes axe-core with no issues, but a11y-ja-mcp detects it ([detection comparison](#detection-comparison)).

> **Language note:** Reports and tool descriptions are in Japanese. axe-core messages can be switched to English with `lang: "en"` (`axe_scan`) or `--lang en` (CLI). The JSON output (`format: "json"`) is structured data, so it is easy to use regardless of language.

### Features

- **Tests by operating the page**: presses Tab for real and records focus order, focus visibility, and keyboard traps
- **Tests stateful UI**: operates modals and disclosure widgets (accordions, menu buttons, etc.) with the keyboard and checks focus movement and closing behavior against the WAI-ARIA APG patterns
- **JIS X 8341-3 support**: marks each finding as JIS-applicable or not, and can test against criteria equivalent to JIS X 8341-3:2016 AA
- **CI support**: runs the same checks from a CLI and returns a report and an exit code
- **Other checks**: automated axe-core scans, image alt text, contrast, headings and landmarks

### Setup

Requires Node.js 20+ and Google Chrome (or Chromium / Microsoft Edge).

#### Claude Code

```sh
claude mcp add a11y-ja -- npx -y a11y-ja-mcp
```

#### Other MCP clients (Cursor / Claude Desktop, etc.)

```json
{
  "mcpServers": {
    "a11y-ja": {
      "command": "npx",
      "args": ["-y", "a11y-ja-mcp"]
    }
  }
}
```

| Environment variable | Description |
| --- | --- |
| `A11Y_CHROME_PATH` | Path to the Chrome executable (if it is not found automatically) |
| `A11Y_HEADLESS=false` | Show the browser window |

### Usage

Just ask your agent.

> Audit http://localhost:3000 for accessibility. The target is WCAG 2.2 AA.

> Check that the modal opened by the "Book" button can be opened and closed with the keyboard only.

> Submit the contact form empty and check the error messages using only the keyboard.

The audit procedure and a report template are available as the MCP prompt `a11y_audit` (arguments: `url`, `level`). In Claude Code, you can also use it as a skill by copying `skills/a11y-audit/SKILL.md` to `~/.claude/skills/a11y-audit/`.

### Tools

#### Operating the page

| Tool | Description |
| --- | --- |
| `navigate` | Open a URL (`http://localhost` and `file://` also work) |
| `click` / `type_text` / `set_checked` / `select_option` | Click, type, check, select |
| `press_key` | Press a key (`Tab`, `Shift+Tab`, `Enter`, `Escape`, `ArrowDown`, etc.) and return where focus moved |
| `screenshot` | Take a screenshot |

#### Testing stateful UI

| Tool | Description |
| --- | --- |
| `check_modal` | Opens a modal with Enter and checks that focus moves into it, Tab does not escape to the background, Escape closes it, and focus returns to the trigger after closing. Also runs axe-core while the modal is open |
| `check_disclosure` | For disclosure widgets such as accordions and menu buttons, checks that Enter / Space toggle them and that `aria-expanded` updates correctly |

Results separate problems related to WCAG success criteria (❌) from items that WCAG does not require but the WAI-ARIA APG recommends (⚠️, e.g. closing with Escape).

#### Testing the page

| Tool | Description |
| --- | --- |
| `tab_order` | Presses Tab for real and records the focus order. Reports focus on invisible elements, unnamed elements, no visible focus change, positive tabindex, and keyboard traps |
| `axe_scan` | Automated axe-core scan. You can choose the standard (WCAG 2.0 AA = JIS equivalent / 2.1 AA / 2.2 AA / 2.2 AAA) and the scope (CSS selector) |
| `page_structure` | Heading outline, landmarks, lang, title, skip links, iframe titles, unlabeled form controls |
| `images` | Classifies images as "has alt text / decorative (alt="") / missing alt attribute / no name". Also flags file names used as alt text and linked images without names |
| `contrast_ratio` | Contrast ratio of two colors, with pass/fail for AA / AAA, normal text / large text / UI components |
| `contrast_scan` | Checks the contrast of all text on the page. Text on background images or gradients is marked as "needs visual check" |
| `audit_urls` | Audits multiple pages at once and creates a Markdown / JSON report (can be saved to a file) |

Testing tools let you choose the output with the `format` argument.

- `markdown` (default): a human-readable report
- `json`: structured data including the success criterion, JIS applicability, and the affected elements (selector and HTML). Useful when the agent should read the results and fix the code directly
- `raw` (`axe_scan` only): `json` plus the raw result of axe-core's `axe.run()`

### Detection comparison

I prepared a correct modal and versions of it with exactly one thing broken ([examples/modals/](examples/modals/)), and tested them with three tools. Every modal has a correct role (`role="dialog"`), name, and `aria-modal`. The only differences are in keyboard operation and focus handling.

| Modal | Lighthouse 13.6.0 (Accessibility) | axe-core (page loaded) | axe-core (modal open) | a11y-ja-mcp `check_modal` |
| --- | --- | --- | --- | --- |
| Correct modal | ✅ No issues (100) | ✅ No issues | ✅ No issues | ✅ No issues |
| Focus stays in the background | ❌ Missed (100) | ❌ Missed | ❌ Missed | ✅ Detected |
| Tab escapes to the background | ❌ Missed (100) | ❌ Missed | ❌ Missed | ✅ Detected |
| Escape does not close it | ❌ Missed (100) | ❌ Missed | ❌ Missed | ✅ Detected |
| Focus does not return after closing | ❌ Missed (100) | ❌ Missed | ❌ Missed | ✅ Detected |

- Lighthouse and axe-core check HTML and appearance. Behavior during keyboard operation is outside their scope. These results reflect a difference in what each tool checks, not a defect in those tools
- axe-core 4.14 (WCAG 2.2 AA + best practices). a11y-ja-mcp was also confirmed to report nothing other than the one targeted item
- To reproduce, run `npm run build && node scripts/benchmark-modals.mjs`

### CLI (for CI)

The same checks as the MCP server can be run from the CLI.

```sh
npx a11y-ja-mcp audit https://example.com https://example.com/about \
  --level wcag2aa --fail-on serious --out a11y-report.md
```

| Option | Description |
| --- | --- |
| `--level` | `wcag2aa` (JIS equivalent) / `wcag21aa` / `wcag22aa` (default) / `wcag22aaa` |
| `--format` | `markdown` (default) / `json` |
| `--out` | Output file (stdout if omitted) |
| `--fail-on` | Exit with code 1 if there are violations at or above this severity. `critical` / `serious` (default) / `moderate` / `minor` / `none` |
| `--urls-file` | A file with one URL per line (lines starting with `#` are ignored) |
| `--best-practices` | Also include best practices outside WCAG |
| `--lang` | `ja` (default) / `en` |

A GitHub Actions example is in [examples/github-actions/a11y.yml](examples/github-actions/a11y.yml). The report can be shown in the job summary.

### Limitations

- Automated testing finds only some WCAG issues. Screen reader output, video captions, and whether alt text is appropriate still need human review
- `tab_order` judges focus visibility by whether styles such as outline change before and after focus
- `contrast_scan` cannot accurately judge text on background images, gradients, or overlapping elements (it reports them as "needs visual check")
- `check_modal` detects as a modal any `role="dialog"` / `role="alertdialog"` / `dialog` element / `aria-modal="true"` element that becomes visible after opening. If none is found, pass the modal's selector in the `dialog` argument
- For `check_disclosure` to verify that the content is shown, the button needs `aria-controls`, or you need to pass the content's selector in the `content` argument
- "JIS-applicable" refers to the level A / AA success criteria of JIS X 8341-3:2016 (identical in content to WCAG 2.0)

### Development

```sh
npm install
npm test     # build and test (some tests use a browser, so Chrome is required)
```

Test pages are in `examples/`.

| File | Description |
| --- | --- |
| `bad.html` | A page with planted issues in alt text, contrast, tab order, etc. |
| `trap.html` | A page with a keyboard trap |
| `components.html` | Good and bad examples of modals and disclosure widgets |
| `modals/` | A correct modal and versions with exactly one thing broken (used in the detection comparison) |

### License

MIT
