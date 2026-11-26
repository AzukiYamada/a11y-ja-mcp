/**
 * WCAG 達成基準の日本語名（WAIC の翻訳に準拠）。
 * since: その基準が追加された WCAG のバージョン。
 * JIS X 8341-3:2016 は WCAG 2.0 と同一内容なので、since === "2.0" の A / AA が JIS の対象になる。
 */
export type Level = "A" | "AA" | "AAA";
export interface SuccessCriterion {
  id: string;
  name: string;
  level: Level;
  since: "2.0" | "2.1" | "2.2";
  /** WCAG 2.2 で廃止された基準 */
  obsolete?: boolean;
}

const list: SuccessCriterion[] = [
  { id: "1.1.1", name: "非テキストコンテンツ", level: "A", since: "2.0" },
  { id: "1.2.1", name: "音声のみ及び映像のみ（収録済）", level: "A", since: "2.0" },
  { id: "1.2.2", name: "キャプション（収録済）", level: "A", since: "2.0" },
  { id: "1.2.3", name: "音声解説、又はメディアに対する代替（収録済）", level: "A", since: "2.0" },
  { id: "1.2.4", name: "キャプション（ライブ）", level: "AA", since: "2.0" },
  { id: "1.2.5", name: "音声解説（収録済）", level: "AA", since: "2.0" },
  { id: "1.3.1", name: "情報及び関係性", level: "A", since: "2.0" },
  { id: "1.3.2", name: "意味のある順序", level: "A", since: "2.0" },
  { id: "1.3.3", name: "感覚的な特徴", level: "A", since: "2.0" },
  { id: "1.3.4", name: "表示の向き", level: "AA", since: "2.1" },
  { id: "1.3.5", name: "入力目的の特定", level: "AA", since: "2.1" },
  { id: "1.4.1", name: "色の使用", level: "A", since: "2.0" },
  { id: "1.4.2", name: "音声の制御", level: "A", since: "2.0" },
  { id: "1.4.3", name: "コントラスト（最低限）", level: "AA", since: "2.0" },
  { id: "1.4.4", name: "テキストのサイズ変更", level: "AA", since: "2.0" },
  { id: "1.4.5", name: "文字画像", level: "AA", since: "2.0" },
  { id: "1.4.6", name: "コントラスト（高度）", level: "AAA", since: "2.0" },
  { id: "1.4.10", name: "リフロー", level: "AA", since: "2.1" },
  { id: "1.4.11", name: "非テキストのコントラスト", level: "AA", since: "2.1" },
  { id: "1.4.12", name: "テキストの間隔", level: "AA", since: "2.1" },
  { id: "1.4.13", name: "ホバー又はフォーカスで表示されるコンテンツ", level: "AA", since: "2.1" },
  { id: "2.1.1", name: "キーボード", level: "A", since: "2.0" },
  { id: "2.1.2", name: "キーボードトラップなし", level: "A", since: "2.0" },
  { id: "2.1.4", name: "文字キーのショートカット", level: "A", since: "2.1" },
  { id: "2.2.1", name: "タイミング調整可能", level: "A", since: "2.0" },
  { id: "2.2.2", name: "一時停止、停止、非表示", level: "A", since: "2.0" },
  { id: "2.3.1", name: "3 回の閃光、又は閾値以下", level: "A", since: "2.0" },
  { id: "2.4.1", name: "ブロックスキップ", level: "A", since: "2.0" },
  { id: "2.4.2", name: "ページタイトル", level: "A", since: "2.0" },
  { id: "2.4.3", name: "フォーカス順序", level: "A", since: "2.0" },
  { id: "2.4.4", name: "リンクの目的（コンテキスト内）", level: "A", since: "2.0" },
  { id: "2.4.5", name: "複数の手段", level: "AA", since: "2.0" },
  { id: "2.4.6", name: "見出し及びラベル", level: "AA", since: "2.0" },
  { id: "2.4.7", name: "フォーカスの可視化", level: "AA", since: "2.0" },
  { id: "2.4.11", name: "フォーカスの非隠蔽（最低限）", level: "AA", since: "2.2" },
  { id: "2.5.1", name: "ポインタのジェスチャ", level: "A", since: "2.1" },
  { id: "2.5.2", name: "ポインタのキャンセル", level: "A", since: "2.1" },
  { id: "2.5.3", name: "ラベルを含む名前 (name)", level: "A", since: "2.1" },
  { id: "2.5.4", name: "動きによる起動", level: "A", since: "2.1" },
  { id: "2.5.7", name: "ドラッグ動作", level: "AA", since: "2.2" },
  { id: "2.5.8", name: "ターゲットのサイズ（最低限）", level: "AA", since: "2.2" },
  { id: "3.1.1", name: "ページの言語", level: "A", since: "2.0" },
  { id: "3.1.2", name: "一部分の言語", level: "AA", since: "2.0" },
  { id: "3.2.1", name: "フォーカス時", level: "A", since: "2.0" },
  { id: "3.2.2", name: "入力時", level: "A", since: "2.0" },
  { id: "3.2.3", name: "一貫したナビゲーション", level: "AA", since: "2.0" },
  { id: "3.2.4", name: "一貫した識別性", level: "AA", since: "2.0" },
  { id: "3.2.6", name: "一貫したヘルプ", level: "A", since: "2.2" },
  { id: "3.3.1", name: "エラーの特定", level: "A", since: "2.0" },
  { id: "3.3.2", name: "ラベル又は説明", level: "A", since: "2.0" },
  { id: "3.3.3", name: "エラー修正の提案", level: "AA", since: "2.0" },
  { id: "3.3.4", name: "エラー回避（法的、金融、データ）", level: "AA", since: "2.0" },
  { id: "3.3.7", name: "冗長な入力", level: "A", since: "2.2" },
  { id: "3.3.8", name: "アクセシブルな認証（最低限）", level: "AA", since: "2.2" },
  { id: "4.1.1", name: "構文解析", level: "A", since: "2.0", obsolete: true },
  { id: "4.1.2", name: "名前 (name)・役割 (role) 及び値 (value)", level: "A", since: "2.0" },
  { id: "4.1.3", name: "ステータスメッセージ", level: "AA", since: "2.1" },
];

export const CRITERIA: ReadonlyMap<string, SuccessCriterion> = new Map(list.map((c) => [c.id, c]));

/** axe のタグ（例: "wcag1412"）を達成基準番号（"1.4.12"）に変換する。該当しなければ undefined */
export function tagToCriterionId(tag: string): string | undefined {
  const m = /^wcag(\d)(\d)(\d{1,2})$/.exec(tag);
  if (!m) return undefined;
  return `${m[1]}.${m[2]}.${m[3]}`;
}

/** 達成基準が JIS X 8341-3:2016（= WCAG 2.0）の対象かどうか */
export function isJisTarget(c: SuccessCriterion): boolean {
  return c.since === "2.0" && c.level !== "AAA";
}

export function describeCriterion(id: string): string {
  const c = CRITERIA.get(id);
  if (!c) return id;
  const jis = isJisTarget(c) ? "・JIS対象" : "";
  return `${c.id} ${c.name}（${c.level}${jis}）`;
}
