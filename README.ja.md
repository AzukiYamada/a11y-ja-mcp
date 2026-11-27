# a11y-ja-mcp

[English](README.md) | **日本語**

**AI エージェントがブラウザを操作しながら、アクセシビリティを検査する MCP サーバー**

Claude Code などのコーディングエージェントに UI を実装してもらった流れで、「アクセシビリティも確認して、問題があれば修正して」と頼めるようにするための MCP サーバーです。
実装した画面をブラウザで開き、axe-core で検査するだけでなく、モーダルやメニューを開いてキーボードで操作し、フォーカスの挙動まで確かめます。
検査結果は日本語で返し、WCAG の達成基準と、JIS X 8341-3 の対象かどうかを付けます。

## ブラウザを操作しながら検査する

Puppeteer で Chrome を起動し、エージェントからブラウザを操作できるようにしています。
メニューやモーダルを開いた状態で axe-core を実行できるほか、キーボード操作を検査する専用のツールがあります。

- `tab_order`: Tab キーでのフォーカスの移動順序や、フォーカス表示を確認します
- `check_modal`: モーダルの開閉時のフォーカスやキーボード操作を確認します
- `check_disclosure`: アコーディオンなどの開閉操作や、ARIA の状態を確認します

`check_modal` では、実際に Tab キーや Escape キーを押して、フォーカスがモーダルの外に出ないか、閉じたあとに元の要素へフォーカスが戻るかなどを確かめます。
モーダルや開閉 UI の検査は、[WAI-ARIA Authoring Practices Guide（APG）](https://www.w3.org/WAI/ARIA/apg/) の操作パターンを参考にしています。

フォーカスの扱いだけを壊したモーダルは、Lighthouse と axe-core では 100 点・指摘なしになりますが、`check_modal` では検出できます（[検出の比較](#検出の比較)）。

## 日本語の検査結果と JIS 対応

検査結果は日本語で返し、WCAG の達成基準番号と、WAIC による日本語訳を付けます。
また、JIS X 8341-3:2016 の適合レベル AA までに対応する WCAG 2.0 の達成基準には「JIS対象」と表示します。JIS X 8341-3:2016 AA 相当の基準で検査することもできます。

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

> http://localhost:3000 のアクセシビリティを検査してください。JIS X 8341-3 の適合レベル AA を目標にしています。

> 予約フォームのモーダルをキーボードで操作して、フォーカスの挙動に問題がないか確認してください。

> お問い合わせフォームを空のまま送信したときのエラー表示を、キーボードだけで確認してください。

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
| `audit_urls` | 複数ページを axe-core で一括検査して Markdown / JSON のレポートを作成（ファイル保存可） |

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

MCP とは別に CLI もあります。複数の URL に対して axe-core による一括検査を実行できるので、CI に組み込めます。
`tab_order`・`check_modal`・`check_disclosure` などの操作を伴う検査は、MCP からのみ使えます。

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

GitHub Actions の例は [examples/github-actions/a11y.yml](examples/github-actions/a11y.yml) にあります。`$GITHUB_STEP_SUMMARY` にレポートを書き込むと、ジョブのサマリーで検査結果を確認できます。

## 制限事項

この MCP は、検査を通過すれば WCAG や JIS に適合していると言えるものではありません。機械的に確認できることをエージェントに任せ、人が考えるべきところに時間を使うための道具です。

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

## フィードバック

「この観点がほしい」などの意見があれば、Issue や PR をいただけるとうれしいです。

## ライセンス

MIT
