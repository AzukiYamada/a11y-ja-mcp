import type { Page } from "puppeteer-core";

/**
 * ブラウザ側に注入する共通ヘルパー。window.__a11yja に生やす。
 * TypeScript からは文字列として渡すので、ここは素の JavaScript で書く。
 */
const HELPERS = String.raw`
(() => {
  if (window.__a11yja) return;

  function cssPath(el) {
    if (!(el instanceof Element)) return "";
    if (el.id && document.querySelectorAll("#" + CSS.escape(el.id)).length === 1) return "#" + CSS.escape(el.id);
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      let part = cur.localName;
      if (cur.id && document.querySelectorAll("#" + CSS.escape(cur.id)).length === 1) {
        parts.unshift("#" + CSS.escape(cur.id));
        break;
      }
      const parent = cur.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.localName === cur.localName);
        if (same.length > 1) part += ":nth-of-type(" + (same.indexOf(cur) + 1) + ")";
      }
      parts.unshift(part);
      cur = parent;
    }
    return parts.join(" > ");
  }

  function textOf(el) {
    return (el.innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
  }

  /** アクセシブルネームの簡易推定（完全な accname 実装ではない） */
  function accName(el) {
    const labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      const t = labelledby.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map(textOf).join(" ").trim();
      if (t) return t;
    }
    const aria = el.getAttribute("aria-label");
    if (aria && aria.trim()) return aria.trim();
    if (el.localName === "img" || (el.localName === "input" && el.type === "image")) {
      const alt = el.getAttribute("alt");
      if (alt !== null) return alt.trim();
    }
    if (el.labels && el.labels.length) {
      const t = [...el.labels].map(textOf).join(" ").trim();
      if (t) return t;
    }
    if (el.localName === "input" && ["submit", "button", "reset"].includes(el.type)) return el.value || "";
    const svgTitle = el.querySelector && el.querySelector(":scope > title");
    if (el.localName === "svg" && svgTitle) return textOf(svgTitle);
    const t = textOf(el);
    if (t) return t.slice(0, 120);
    const imgAlt = el.querySelector && [...el.querySelectorAll("img[alt]")].map((i) => i.alt).join(" ").trim();
    if (imgAlt) return imgAlt;
    const title = el.getAttribute("title");
    if (title) return title.trim();
    if (el.placeholder) return el.placeholder;
    return "";
  }

  function role(el) {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit.split(/\s+/)[0];
    const n = el.localName;
    const map = {
      a: el.hasAttribute("href") ? "link" : "", button: "button", nav: "navigation", main: "main",
      aside: "complementary", form: "form", select: "combobox", textarea: "textbox", img: "img",
      h1: "heading", h2: "heading", h3: "heading", h4: "heading", h5: "heading", h6: "heading",
      summary: "button", dialog: "dialog", details: "group",
    };
    if (n === "input") {
      const t = el.type;
      if (["button", "submit", "reset", "image"].includes(t)) return "button";
      if (t === "checkbox") return "checkbox";
      if (t === "radio") return "radio";
      if (t === "range") return "slider";
      return "textbox";
    }
    if (n === "header") return el.closest("main,article,aside,nav,section") ? "" : "banner";
    if (n === "footer") return el.closest("main,article,aside,nav,section") ? "" : "contentinfo";
    if (n === "section") return (el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby")) ? "region" : "";
    return map[n] ?? "";
  }

  function isVisible(el) {
    if (!el.isConnected) return false;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function isOffscreen(el) {
    const r = el.getBoundingClientRect();
    const sx = window.scrollX, sy = window.scrollY;
    return r.right + sx <= 0 || r.bottom + sy <= 0 || r.width <= 1 || r.height <= 1;
  }

  function isAriaHidden(el) {
    return !!el.closest('[aria-hidden="true"]');
  }

  window.__a11yja = { cssPath, accName, role, isVisible, isOffscreen, isAriaHidden, textOf };
})();
`;

export async function ensureHelpers(page: Page): Promise<void> {
  await page.evaluate(HELPERS);
}
