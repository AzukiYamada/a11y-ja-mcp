/** WCAG のコントラスト比計算（ブラウザに依存しない純粋関数） */

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  yellow: "#ffff00",
  orange: "#ffa500",
  purple: "#800080",
  navy: "#000080",
  transparent: "#00000000",
};

/** "#rgb" "#rrggbb" "#rrggbbaa" "rgb()" "rgba()" と一部の色名を解釈する */
export function parseColor(input: string): RGBA {
  let s = input.trim().toLowerCase();
  if (NAMED[s]) s = NAMED[s];

  if (s.startsWith("#")) {
    let hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) throw new Error(`色を解釈できません: ${input}`);
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }

  const m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) throw new Error(`色を解釈できません: ${input}`);
    const ch = (v: string) => (v.endsWith("%") ? (parseFloat(v) / 100) * 255 : parseFloat(v));
    const alpha = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    return { r: ch(parts[0]), g: ch(parts[1]), b: ch(parts[2]), a: alpha };
  }

  throw new Error(`色を解釈できません: ${input}（#hex / rgb() / rgba() で指定してください）`);
}

/** 前景色 fg を背景 bg の上に重ねた色 */
export function blend(fg: RGBA, bg: RGBA): RGBA {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
    g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
    b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
    a,
  };
}

export function relativeLuminance({ r, g, b }: RGBA): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(fg: RGBA, bg: RGBA): number {
  const opaqueBg = bg.a < 1 ? blend(bg, { r: 255, g: 255, b: 255, a: 1 }) : bg;
  const opaqueFg = fg.a < 1 ? blend(fg, opaqueBg) : fg;
  const l1 = relativeLuminance(opaqueFg);
  const l2 = relativeLuminance(opaqueBg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG の「大きな文字」: 18pt(24px) 以上、または 14pt(約18.66px) 以上の太字 */
export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
}

export interface ContrastJudgement {
  ratio: number;
  /** 通常の文字としての判定 */
  normal: { AA: boolean; AAA: boolean };
  /** 大きな文字としての判定 */
  large: { AA: boolean; AAA: boolean };
  /** UI 部品・グラフィック（1.4.11、3:1） */
  nonText: boolean;
}

export function judge(ratio: number): ContrastJudgement {
  // WCAG は丸めずに判定する（4.499 は不合格）
  return {
    ratio: Math.floor(ratio * 100) / 100,
    normal: { AA: ratio >= 4.5, AAA: ratio >= 7 },
    large: { AA: ratio >= 3, AAA: ratio >= 4.5 },
    nonText: ratio >= 3,
  };
}

export function toHex({ r, g, b }: RGBA): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

export const mark = (ok: boolean) => (ok ? "✅ 合格" : "❌ 不合格");
