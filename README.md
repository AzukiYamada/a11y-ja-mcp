# a11y-ja-mcp

**English** | [日本語](https://github.com/AzukiYamada/a11y-ja-mcp/blob/main/README.ja.md)

**An MCP server that lets AI agents operate pages and test their accessibility**

It gives agents such as Claude Code and Cursor tools to drive a local Chrome.
Instead of checking only the HTML right after the page loads, it tests **the page as it is actually used**: after pressing Tab, after opening a modal or a menu, and so on.
Every finding is annotated with its WCAG success criterion and whether it falls under JIS X 8341-3 (Japan's web accessibility standard).

For example, a modal with broken focus handling scores 100 in Lighthouse and passes axe-core with no issues, but a11y-ja-mcp detects it ([detection comparison](#detection-comparison)).

> **Language note:** Reports and tool descriptions are in Japanese. axe-core messages can be switched to English with `lang: "en"` (`axe_scan`) or `--lang en` (CLI). The JSON output (`format: "json"`) is structured data, so it is easy to use regardless of language.

## Features

- **Tests by operating the page**: presses Tab for real and records focus order, focus visibility, and keyboard traps
- **Tests stateful UI**: operates modals and disclosure widgets (accordions, menu buttons, etc.) with the keyboard and checks focus movement and closing behavior against the WAI-ARIA APG patterns
- **JIS X 8341-3 support**: marks each finding as JIS-applicable or not, and can test against criteria equivalent to JIS X 8341-3:2016 AA
- **CI support**: runs the same checks from a CLI and returns a report and an exit code
- **Other checks**: automated axe-core scans, image alt text, contrast, headings and landmarks

## Setup

Requires Node.js 20+ and Google Chrome (or Chromium / Microsoft Edge).

### Claude Code

```sh
claude mcp add a11y-ja -- npx -y a11y-ja-mcp
```

### Other MCP clients (Cursor / Claude Desktop, etc.)

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

## Usage

Just ask your agent.

> Audit http://localhost:3000 for accessibility. The target is WCAG 2.2 AA.

> Check that the modal opened by the "Book" button can be opened and closed with the keyboard only.

> Submit the contact form empty and check the error messages using only the keyboard.

The audit procedure and a report template are available as the MCP prompt `a11y_audit` (arguments: `url`, `level`). In Claude Code, you can also use it as a skill by copying `skills/a11y-audit/SKILL.md` to `~/.claude/skills/a11y-audit/`.

## Tools

### Operating the page

| Tool | Description |
| --- | --- |
| `navigate` | Open a URL (`http://localhost` and `file://` also work) |
| `click` / `type_text` / `set_checked` / `select_option` | Click, type, check, select |
| `press_key` | Press a key (`Tab`, `Shift+Tab`, `Enter`, `Escape`, `ArrowDown`, etc.) and return where focus moved |
| `screenshot` | Take a screenshot |

### Testing stateful UI

| Tool | Description |
| --- | --- |
| `check_modal` | Opens a modal with Enter and checks that focus moves into it, Tab does not escape to the background, Escape closes it, and focus returns to the trigger after closing. Also runs axe-core while the modal is open |
| `check_disclosure` | For disclosure widgets such as accordions and menu buttons, checks that Enter / Space toggle them and that `aria-expanded` updates correctly |

Results separate problems related to WCAG success criteria (❌) from items that WCAG does not require but the WAI-ARIA APG recommends (⚠️, e.g. closing with Escape).

### Testing the page

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

## Detection comparison

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

## CLI (for CI)

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

## Limitations

- Automated testing finds only some WCAG issues. Screen reader output, video captions, and whether alt text is appropriate still need human review
- `tab_order` judges focus visibility by whether styles such as outline change before and after focus
- `contrast_scan` cannot accurately judge text on background images, gradients, or overlapping elements (it reports them as "needs visual check")
- `check_modal` detects as a modal any `role="dialog"` / `role="alertdialog"` / `dialog` element / `aria-modal="true"` element that becomes visible after opening. If none is found, pass the modal's selector in the `dialog` argument
- For `check_disclosure` to verify that the content is shown, the button needs `aria-controls`, or you need to pass the content's selector in the `content` argument
- "JIS-applicable" refers to the level A / AA success criteria of JIS X 8341-3:2016 (identical in content to WCAG 2.0)

## Development

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

## License

MIT
