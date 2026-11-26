# a11y-ja-mcp

**AI エージェントにページを操作させて、アクセシビリティを検査する MCP サーバー**

Claude Code や Cursor などのエージェントに、ローカルの Chrome を操作して検査する道具を渡します。
ページを開いた直後だけでなく、Tab を押したり、メニューやモーダルを開いたりしたあとの状態も検査できます。
各指摘には WCAG の達成基準と、JIS X 8341-3 の対象かどうかが付きます。同じ検査を CLI から実行できるので、CI にも組み込めます。

```
#### 【重大】要素は色のコントラスト比（最低限）の閾値を満たしていなければなりません（1 件）

- ルール: `color-contrast`
- 達成基準: 1.4.3 コントラスト（最低限）（AA・JIS対象）
- `p`
  - 次のいずれかを修正します: 要素のコントラスト比が不十分です 2.84（前景色: #999999、背景色: #ffffff …）
```

## 特徴

- 🧭 **操作して確かめる**: 実際に Tab キーを押してフォーカスの順番・見え方・キーボードトラップを記録。クリックやキー操作でメニューやモーダルを開いた状態でも、axe-core などの検査をかけられる
- 📏 **JIS X 8341-3 対応**: 各指摘に「JIS対象」かどうかを表示。`level: "wcag2aa"` で JIS X 8341-3:2016 AA 相当の基準で検査
- 🤖 **CI 対応**: `npx a11y-ja-mcp audit <url...>` で複数ページを検査し、Markdown / JSON のレポートと終了コードを返す
- 🔍 **そのほかの検査**: axe-core による自動検査、画像の代替テキスト、コントラスト、見出し・ランドマーク
- 📝 **監査テンプレート**: MCP プロンプト `a11y_audit` と Claude Code 用スキルで、監査の手順とレポートの雛形を提供

## 必要なもの

- Node.js 20 以上
- Google Chrome（または Chromium / Microsoft Edge）
  - 自動で見つからない場合は環境変数 `A11Y_CHROME_PATH` に実行ファイルのパスを指定してください

## セットアップ

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

ブラウザの画面を見ながら使いたい場合は `"env": { "A11Y_HEADLESS": "false" }` を追加してください。

## ツール一覧

| ツール | 内容 |
| --- | --- |
| `navigate` | URL を開く（`http://localhost` や `file://` も可） |
| `click` / `type_text` / `set_checked` / `select_option` | クリック・入力・チェック・選択 |
| `press_key` | キーを押す（`Tab`, `Shift+Tab`, `Enter`, `Escape`, `ArrowDown` など）。押した後のフォーカス先を返す |
| `screenshot` | スクリーンショット |
| `axe_scan` | axe-core で自動検査。基準（WCAG 2.0 AA = JIS 相当 / 2.1 AA / 2.2 AA / 2.2 AAA）と範囲（CSS セレクタ）を指定可 |
| `page_structure` | 見出しのアウトライン、ランドマーク、lang、タイトル、スキップリンク、iframe の title、ラベルのないフォーム部品 |
| `tab_order` | 実際に Tab を押してフォーカス順を記録。見えない要素へのフォーカス、名前のない要素、フォーカス表示の変化なし、正の tabindex、キーボードトラップを指摘 |
| `images` | 画像を「代替テキストあり / 装飾（alt=""）/ alt 属性なし / 名前なし」に分類。ファイル名だけの alt、リンク画像の名前抜けなども指摘 |
| `contrast_ratio` | 2 色のコントラスト比と、AA / AAA・通常の文字 / 大きな文字 / UI 部品ごとの合否 |
| `contrast_scan` | ページ内のテキストのコントラストを一括検査。背景画像・グラデーション上の文字は「要目視確認」に分類 |
| `check_modal` | モーダルを Enter で開き、フォーカスがモーダル内へ移るか・Tab で背面へ抜けないか・Escape で閉じられるか・閉じたあと開くボタンへフォーカスが戻るかを検査。開いた状態で axe-core もかける |
| `check_disclosure` | アコーディオンやメニューボタンなどの開閉 UI を検査。Enter / Space で開閉できるか、`aria-expanded` が正しく切り替わるか |
| `audit_urls` | 複数ページを一括検査して Markdown / JSON のレポートを作成（ファイル保存可） |

**出力形式**: `axe_scan` / `page_structure` / `tab_order` / `images` / `contrast_scan` は `format` 引数で出力を選べます。

- `markdown`（既定）: 人が読む日本語のレポート
- `json`: 達成基準・JIS 対象かどうか・該当要素（セレクタ・HTML）などを含む構造化データ。エージェントが結果を解釈してそのまま修正したいとき向け
- `raw`（`axe_scan` のみ）: `json` に axe-core の `axe.run()` の生の結果を加えたもの

**プロンプト**: `a11y_audit`（引数: `url`, `level`）… 上のツールを使った監査手順とレポートのテンプレート

### 使い方の例

> http://localhost:3000 をアクセシビリティ監査して。JIS X 8341-3 の AA が目標です

> お問い合わせフォームを空のまま送信したときのエラー表示を、キーボードだけで確認して

> このボタンの色 #6c757d と白の組み合わせは AA を満たす？

## CLI（CI 向け）

```sh
npx a11y-ja-mcp audit https://example.com https://example.com/about \
  --level wcag22aa --fail-on serious --out a11y-report.md
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

GitHub Actions の例は [examples/github-actions/a11y.yml](examples/github-actions/a11y.yml) を参照してください。レポートをジョブのサマリーに表示できます。

## Claude Code のスキルとして使う

`skills/a11y-audit/SKILL.md` を `~/.claude/skills/a11y-audit/SKILL.md`（またはプロジェクトの `.claude/skills/`）にコピーすると、
「アクセシビリティ監査して」と頼むだけで手順に沿った監査が始まります。

## 制限事項

- 自動検査で見つかるのは WCAG の問題の**一部**です。スクリーンリーダーでの読み上げ、動画のキャプション、意味的に適切な代替テキストかどうかなどは人の確認が必要です。
- `tab_order` のフォーカス表示の判定は「フォーカス前後で outline などのスタイルが変わったか」で推定しています。最終的にはスクリーンショットで確認してください。
- `contrast_scan` は背景画像・グラデーション・重なった要素の上の文字を正確に判定できません（要目視確認として出力します）。
- JIS X 8341-3:2016 は WCAG 2.0 と同じ内容です。「JIS対象」は WCAG 2.0 の A / AA の達成基準を指します。

## 開発

```sh
npm install
npm test            # ビルド + 単体テスト
node dist/index.js audit "file://$PWD/examples/bad.html" --fail-on none
```

## ライセンス

MIT

---

## English

`a11y-ja-mcp` is an MCP server that gives AI coding agents accessibility testing tools on a local Chrome: axe-core scans, tab order recording, page structure, image alt checks, and WCAG contrast checks. Output is in Japanese by default (`lang: "en"` is available for axe messages), annotated with WCAG success criteria and JIS X 8341-3 applicability. A CLI (`npx a11y-ja-mcp audit <urls...>`) runs batch audits for CI with Markdown/JSON reports and exit codes.
