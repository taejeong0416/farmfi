import fs from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFPage, rgb, RGB } from "pdf-lib";

// A4 (pt)
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 56;
const MARGIN_TOP = 64;
const MARGIN_BOTTOM = 64;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

// CLAUDE.md 팔레트를 PDF 좌표계(0~1)로 옮긴 값.
const INK = rgb(0x1a / 255, 0x1a / 255, 0x1a / 255);
const BODY = rgb(0x4a / 255, 0x4a / 255, 0x4a / 255);
const MUTED = rgb(0x8a / 255, 0x8a / 255, 0x8a / 255);
const LINE = rgb(0xe5 / 255, 0xe5 / 255, 0xe3 / 255);
const BRAND = rgb(0x14 / 255, 0x54 / 255, 0x2e / 255);

// 폰트는 요청마다 디스크를 때리지 않게 프로세스 단위로 잡아 둔다.
// public/ 아래에 두는 건 demo mock 이미지와 같은 이유다 — Vercel이 항상 배포한다.
let fontCache: { regular: Uint8Array; bold: Uint8Array } | null = null;

async function loadFontBytes() {
  if (fontCache) return fontCache;
  const dir = path.join(process.cwd(), "public", "fonts");
  const [regular, bold] = await Promise.all([
    fs.readFile(path.join(dir, "Pretendard-Regular.ttf")),
    fs.readFile(path.join(dir, "Pretendard-Bold.ttf")),
  ]);
  fontCache = { regular, bold };
  return fontCache;
}

export type Cell = { text: string; bold?: boolean; align?: "left" | "right" };

/**
 * A4 문서 한 편을 세로로 쌓아 그린다. pdf-lib은 줄바꿈을 해주지 않으므로
 * 폭 계산과 페이지 넘김을 여기서 전부 처리한다.
 */
export class DocBuilder {
  private doc!: PDFDocument;
  private page!: PDFPage;
  private regular!: PDFFont;
  private bold!: PDFFont;
  private y = 0;

  static async create() {
    const b = new DocBuilder();
    const bytes = await loadFontBytes();
    b.doc = await PDFDocument.create();
    b.doc.registerFontkit(fontkit);
    // subset: true — 쓴 글자만 넣어야 2.7MB 원본이 통째로 따라오지 않는다.
    b.regular = await b.doc.embedFont(bytes.regular, { subset: true });
    b.bold = await b.doc.embedFont(bytes.bold, { subset: true });
    b.newPage();
    return b;
  }

  private newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN_TOP;
  }

  private ensure(height: number) {
    if (this.y - height < MARGIN_BOTTOM) this.newPage();
  }

  private font(bold?: boolean) {
    return bold ? this.bold : this.regular;
  }

  /** 폭에 맞춰 줄을 나눈다. 한글은 공백 없이 이어지므로 글자 단위로도 끊는다. */
  private wrap(text: string, size: number, bold: boolean, width: number) {
    const font = this.font(bold);
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const ch of paragraph) {
        const next = line + ch;
        if (font.widthOfTextAtSize(next, size) > width && line) {
          lines.push(line);
          line = ch === " " ? "" : ch;
        } else {
          line = next;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  private write(
    text: string,
    opts: { size: number; bold?: boolean; color?: RGB; x?: number; width?: number },
  ) {
    const { size, bold = false, color = BODY } = opts;
    const x = opts.x ?? MARGIN_X;
    const width = opts.width ?? CONTENT_W;
    const leading = size * 1.55;
    for (const line of this.wrap(text, size, bold, width)) {
      this.ensure(leading);
      this.page.drawText(line, {
        x,
        y: this.y - size,
        size,
        font: this.font(bold),
        color,
      });
      this.y -= leading;
    }
  }

  title(text: string, subtitle?: string) {
    this.write(text, { size: 22, bold: true, color: INK });
    this.y -= 6;
    if (subtitle) this.write(subtitle, { size: 10.5, color: MUTED });
    this.y -= 10;
    this.rule(BRAND, 1.6);
    this.y -= 18;
    return this;
  }

  h2(text: string) {
    this.y -= 12;
    this.ensure(40);
    this.write(text, { size: 13.5, bold: true, color: INK });
    this.y -= 6;
    return this;
  }

  para(text: string) {
    this.write(text, { size: 10.5, color: BODY });
    this.y -= 6;
    return this;
  }

  note(text: string) {
    this.write(text, { size: 9.5, color: MUTED });
    this.y -= 4;
    return this;
  }

  bullets(items: string[]) {
    for (const item of items) {
      const indent = 12;
      this.ensure(18);
      this.page.drawText("·", {
        x: MARGIN_X,
        y: this.y - 10.5,
        size: 10.5,
        font: this.bold,
        color: BRAND,
      });
      this.write(item, { size: 10.5, x: MARGIN_X + indent, width: CONTENT_W - indent });
      this.y -= 2;
    }
    this.y -= 4;
    return this;
  }

  rule(color: RGB = LINE, thickness = 0.8) {
    this.ensure(thickness + 2);
    this.page.drawLine({
      start: { x: MARGIN_X, y: this.y },
      end: { x: PAGE_W - MARGIN_X, y: this.y },
      thickness,
      color,
    });
    this.y -= thickness;
    return this;
  }

  /** 라벨-값 두 칸 표. 값이 길면 오른쪽 칸 안에서 접힌다. */
  kv(rows: [string, string][]) {
    const labelW = 150;
    const valueW = CONTENT_W - labelW;
    for (const [label, value] of rows) {
      const size = 10.5;
      const valueLines = this.wrap(value, size, false, valueW);
      const height = Math.max(1, valueLines.length) * size * 1.55 + 10;
      this.ensure(height);
      const top = this.y;
      this.page.drawText(label, {
        x: MARGIN_X,
        y: top - size,
        size,
        font: this.regular,
        color: MUTED,
      });
      let vy = top;
      for (const line of valueLines) {
        this.page.drawText(line, {
          x: MARGIN_X + labelW,
          y: vy - size,
          size,
          font: this.regular,
          color: INK,
        });
        vy -= size * 1.55;
      }
      this.y = top - height + 4;
      this.rule();
      this.y -= 6;
    }
    this.y -= 4;
    return this;
  }

  /** 열 비율(합 1)로 나눈 표. 첫 행은 머리행으로 그린다. */
  table(head: string[], rows: Cell[][], ratios: number[]) {
    const size = 9.8;
    const widths = ratios.map((r) => CONTENT_W * r);
    const xs: number[] = [];
    let acc = MARGIN_X;
    for (const w of widths) {
      xs.push(acc);
      acc += w;
    }

    const drawRow = (cells: Cell[], bold: boolean, color: RGB) => {
      const heights = cells.map((c, i) =>
        this.wrap(c.text, size, bold || !!c.bold, widths[i] - 10).length,
      );
      const lineCount = Math.max(...heights, 1);
      const height = lineCount * size * 1.5 + 12;
      this.ensure(height);
      const top = this.y;
      cells.forEach((c, i) => {
        const cellBold = bold || !!c.bold;
        const lines = this.wrap(c.text, size, cellBold, widths[i] - 10);
        let cy = top;
        for (const line of lines) {
          const tw = this.font(cellBold).widthOfTextAtSize(line, size);
          const x =
            c.align === "right" ? xs[i] + widths[i] - 10 - tw : xs[i];
          this.page.drawText(line, {
            x,
            y: cy - size,
            size,
            font: this.font(cellBold),
            color,
          });
          cy -= size * 1.5;
        }
      });
      this.y = top - height + 4;
      this.rule();
      this.y -= 6;
    };

    drawRow(
      head.map((h) => ({ text: h })),
      true,
      MUTED,
    );
    for (const row of rows) drawRow(row, false, INK);
    this.y -= 4;
    return this;
  }

  /** 모든 페이지 아래에 같은 꼬리말을 남긴다. 마지막에 한 번만 부른다. */
  footer(text: string) {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      p.drawText(`${text}   ·   ${i + 1} / ${pages.length}`, {
        x: MARGIN_X,
        y: 36,
        size: 8.5,
        font: this.regular,
        color: MUTED,
      });
    });
    return this;
  }

  async save() {
    return this.doc.save();
  }
}
