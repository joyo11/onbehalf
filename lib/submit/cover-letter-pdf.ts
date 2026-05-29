import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Render a cover letter into a single-page (or multi-page) PDF using the
 * built-in Times Roman font. No external assets, no native deps — works
 * in Vercel serverless functions.
 *
 * The text is already formatted by lib/tailor.ts with the formal letter
 * header (Name / Location / Email / Date / Hiring Manager / etc.). We
 * preserve linebreaks and paragraph spacing as-is.
 */
export async function renderCoverLetterPdf(text: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const fontSize = 11;
  const lineHeight = fontSize * 1.45;
  const marginX = 72; // 1 inch
  const marginY = 72;
  const pageWidth = 612;
  const pageHeight = 792;
  const usableWidth = pageWidth - marginX * 2;

  // Hard-wrap each line by word so we don't overflow horizontally.
  const wrapLine = (line: string): string[] => {
    if (line === "") return [""];
    const words = line.split(/\s+/);
    const out: string[] = [];
    let current = "";
    for (const w of words) {
      const test = current ? `${current} ${w}` : w;
      const width = font.widthOfTextAtSize(test, fontSize);
      if (width > usableWidth && current) {
        out.push(current);
        current = w;
      } else {
        current = test;
      }
    }
    if (current) out.push(current);
    return out;
  };

  const rawLines = text.split("\n");
  const lines: string[] = [];
  for (const l of rawLines) lines.push(...wrapLine(l));

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - marginY;
  const minY = marginY;

  for (const line of lines) {
    if (y - lineHeight < minY) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - marginY;
    }
    page.drawText(line, {
      x: marginX,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
    y -= lineHeight;
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
