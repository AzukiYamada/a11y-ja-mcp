import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { closeBrowser, gotoUrl, newPage } from "../browser.js";
import { checkDisclosure, checkModal, type Check } from "../components.js";

// dist/test/ から見た examples/components.html
const fixture = pathToFileURL(fileURLToPath(new URL("../../examples/components.html", import.meta.url))).href;

const find = (checks: Check[], label: string) => {
  const c = checks.find((x) => x.label.startsWith(label));
  assert.ok(c, `検査項目が見つかりません: ${label}`);
  return c.ok;
};

async function open() {
  const page = await newPage();
  await gotoUrl(page, fixture);
  return page;
}

after(closeBrowser);

test("良いモーダルはすべて合格する", async () => {
  const page = await open();
  const r = await checkModal(page, { trigger: "#open-good" });
  assert.equal(r.dialog, "#good-modal");
  assert.equal(r.openedBy, "keyboard");
  assert.deepEqual(
    r.checks.filter((c) => c.ok !== true).map((c) => c.label),
    [],
  );
  await page.close();
});

test("フォーカス管理のないモーダルを検出する", async () => {
  const page = await open();
  const r = await checkModal(page, { trigger: "#open-bad" });
  assert.equal(find(r.checks, "開いたときにフォーカスがモーダルの中へ移る"), false);
  assert.equal(find(r.checks, "Escape キーで閉じられる"), false);
  assert.equal(find(r.checks, "閉じたあと、フォーカスが開くボタンに戻る"), false);
  assert.equal(find(r.checks, "モーダルに役割"), false);
  await page.close();
});

test("div で作ったモーダルは、キーボードで開けないことを検出する", async () => {
  const page = await open();
  const r = await checkModal(page, { trigger: "#open-div" });
  assert.equal(r.dialog, null);
  assert.equal(find(r.checks, "開くボタンにキーボードでフォーカスでき"), false);
  await page.close();
});

test("良い開閉 UI はすべて合格する", async () => {
  const page = await open();
  const r = await checkDisclosure(page, { trigger: "#acc-good" });
  assert.deepEqual(
    r.checks.filter((c) => c.ok !== true).map((c) => c.label),
    [],
  );
  await page.close();
});

test("div で作った開閉 UI の問題を検出する", async () => {
  const page = await open();
  const r = await checkDisclosure(page, { trigger: "#acc-bad", content: "#acc-bad-panel" });
  assert.equal(find(r.checks, "ボタンとして伝わる役割と名前がある"), false);
  assert.equal(find(r.checks, "開閉の状態が aria-expanded で伝わる"), false);
  assert.equal(find(r.checks, "キーボード（Enter / Space）で開閉できる"), false);
  await page.close();
});
