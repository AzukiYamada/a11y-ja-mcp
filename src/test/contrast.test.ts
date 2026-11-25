import assert from "node:assert/strict";
import { test } from "node:test";
import { contrastRatio, isLargeText, judge, parseColor } from "../contrast.js";
import { describeCriterion, tagToCriterionId } from "../wcag-ja.js";

test("黒と白は 21:1", () => {
  assert.equal(contrastRatio(parseColor("#000"), parseColor("#fff")).toFixed(2), "21.00");
});

test("#767676 on #fff は 4.54:1 で AA 合格", () => {
  const j = judge(contrastRatio(parseColor("#767676"), parseColor("#ffffff")));
  assert.equal(j.ratio, 4.54);
  assert.equal(j.normal.AA, true);
  assert.equal(j.normal.AAA, false);
});

test("#777 on #fff は 4.48:1 で通常文字は不合格、大きな文字は合格", () => {
  const j = judge(contrastRatio(parseColor("#777"), parseColor("#fff")));
  assert.equal(j.normal.AA, false);
  assert.equal(j.large.AA, true);
});

test("半透明の前景は背景と合成して計算する", () => {
  const r = contrastRatio(parseColor("rgba(0, 0, 0, 0.5)"), parseColor("#fff"));
  assert.ok(r > 3.9 && r < 4.1, String(r));
});

test("rgb() の空白区切り記法", () => {
  assert.deepEqual(parseColor("rgb(10 20 30 / 50%)"), { r: 10, g: 20, b: 30, a: 0.5 });
});

test("不正な色はエラー", () => {
  assert.throws(() => parseColor("hsl(0 0% 0%)"));
});

test("大きな文字の判定", () => {
  assert.equal(isLargeText(24, 400), true);
  assert.equal(isLargeText(19, 700), true);
  assert.equal(isLargeText(19, 400), false);
  assert.equal(isLargeText(16, 700), false);
});

test("axe タグを達成基準に変換", () => {
  assert.equal(tagToCriterionId("wcag111"), "1.1.1");
  assert.equal(tagToCriterionId("wcag1412"), "1.4.12");
  assert.equal(tagToCriterionId("wcag2411"), "2.4.11");
  assert.equal(tagToCriterionId("wcag2aa"), undefined);
  assert.equal(describeCriterion("1.4.3"), "1.4.3 コントラスト（最低限）（AA・JIS対象）");
  assert.equal(describeCriterion("2.5.8"), "2.5.8 ターゲットのサイズ（最低限）（AA）");
});
