import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

/**
 * Chrome の実行ファイルを探す。
 * 優先順位: 環境変数 A11Y_CHROME_PATH → OS ごとの標準インストール先
 */
function findChrome(): string | undefined {
  const fromEnv = process.env.A11Y_CHROME_PATH ?? process.env.CHROME_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const candidates: string[] = [];
  if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      join(homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    );
  } else if (process.platform === "win32") {
    const pf = [process.env["PROGRAMFILES"], process.env["PROGRAMFILES(X86)"], process.env["LOCALAPPDATA"]];
    for (const base of pf) {
      if (!base) continue;
      candidates.push(
        join(base, "Google/Chrome/Application/chrome.exe"),
        join(base, "Microsoft/Edge/Application/msedge.exe"),
      );
    }
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium",
    );
  }
  return candidates.find((p) => existsSync(p));
}

let browser: Browser | undefined;
let page: Page | undefined;

export async function getBrowser(): Promise<Browser> {
  if (browser?.connected) return browser;
  const executablePath = findChrome();
  if (!executablePath) {
    throw new Error(
      "Chrome が見つかりませんでした。Google Chrome をインストールするか、環境変数 A11Y_CHROME_PATH に実行ファイルのパスを設定してください。",
    );
  }
  const headless = process.env.A11Y_HEADLESS !== "false";
  browser = await puppeteer.launch({
    executablePath,
    headless,
    defaultViewport: { width: 1280, height: 800 },
    args: process.env.CI ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
  });
  browser.on("disconnected", () => {
    browser = undefined;
    page = undefined;
  });
  return browser;
}

/** 対話用に使い回す 1 枚のページ */
export async function getPage(): Promise<Page> {
  if (page && !page.isClosed()) return page;
  const b = await getBrowser();
  page = await b.newPage();
  return page;
}

/** バッチ検査用に新しいページを作る（呼び出し側で close する） */
export async function newPage(): Promise<Page> {
  const b = await getBrowser();
  return b.newPage();
}

export async function closeBrowser(): Promise<void> {
  await browser?.close().catch(() => {});
  browser = undefined;
  page = undefined;
}

export async function gotoUrl(p: Page, url: string, timeoutMs = 30000): Promise<void> {
  await p.goto(url, { waitUntil: "networkidle2", timeout: timeoutMs });
}

/** 現在のページが空（about:blank）なら案内付きでエラーにする */
export function assertNavigated(p: Page): void {
  if (p.url() === "about:blank") {
    throw new Error("まだページを開いていません。先に navigate ツールで URL を開くか、url 引数を指定してください。");
  }
}
