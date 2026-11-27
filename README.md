# a11y-ja-mcp

**English** | [日本語](https://github.com/AzukiYamada/a11y-ja-mcp/blob/main/README.ja.md)

**An MCP server that lets AI agents test accessibility while operating a real browser**

When a coding agent such as Claude Code builds UI for you, this MCP server lets you follow up with "check the accessibility too, and fix any problems."
It opens the page in a browser and runs axe-core, and it also opens modals and menus, operates them with the keyboard, and checks how focus behaves.
Each finding comes with its WCAG success criterion and whether it falls under JIS X 8341-3 (Japan's web accessibility standard).

> **Language note:** Reports are in Japanese. axe-core messages can be switched to English with `lang: "en"` (`axe_scan`) or `--lang en` (CLI). The JSON output (`format: "json"`) is structured data, so agents can use it regardless of language.

## Testing while operating the browser

It launches Chrome with Puppeteer so the agent can operate the browser.
You can run axe-core with a menu or modal open, and there are dedicated tools for testing keyboard interaction.

- `tab_order`: checks the focus order when pressing Tab, and whether focus is visible
- `check_modal`: checks focus and keyboard interaction when a modal opens and closes
- `check_disclosure`: checks opening and closing of accordions and similar widgets, and their ARIA state

`check_modal` actually presses Tab and Escape to check that focus does not leave the modal and that it returns to the original element after closing.
The modal and disclosure checks follow the interaction patterns in the [WAI-ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/).

A modal with only its focus handling broken scores 100 in Lighthouse and passes axe-core with no issues, but `check_modal` detects it ([detection comparison](#detection-comparison)).

## WCAG and JIS X 8341-3

Each finding includes its WCAG success criterion number.
Success criteria of WCAG 2.0 that correspond to JIS X 8341-3:2016 up to conformance level AA are marked as "JIS-applicable". You can also test against criteria equivalent to JIS X 8341-3:2016 AA.

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

> Check the accessibility of http://localhost:3000. The target is WCAG 2.2 AA.

> Operate the booking form modal with the keyboard and check whether focus behaves correctly.

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
| `audit_urls` | Runs axe-core on multiple pages at once and creates a Markdown / JSON report (can be saved to a file) |

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

Separately from the MCP server, there is a CLI. It runs axe-core on multiple URLs in one go, so you can add it to CI.
Checks that involve operating the page, such as `tab_order`, `check_modal`, and `check_disclosure`, are available only through MCP.

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

A GitHub Actions example is in [examples/github-actions/a11y.yml](examples/github-actions/a11y.yml). Writing the report to `$GITHUB_STEP_SUMMARY` shows the results in the job summary.

## Limitations

Passing these checks does not mean a page conforms to WCAG or JIS. The goal is to hand the checks that can be done mechanically to the agent, so people can spend their time on what needs human judgment.

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

## Feedback

If there is a check you would like to see, Issues and PRs are welcome.

## License

MIT
