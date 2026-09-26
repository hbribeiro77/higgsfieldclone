export const GALLERY_TEXT_FONT = "32px sans-serif";
export const GALLERY_TEXT_LINE_HEIGHT = 40;
export const GALLERY_TEXT_MIN_WIDTH = 48;
export const GALLERY_MARK_HIT_SLOP = 16;
const DEFAULT_TEXT_WIDTH = 280;

export type Point = { x: number; y: number };

export type GalleryDrawMark =
  | { kind: "rabisco"; color: string; points: Point[] }
  | { kind: "seta"; color: string; from: Point; to: Point }
  | { kind: "texto"; color: string; x: number; y: number; width: number; text: string };

export type GalleryMarkBounds = { x: number; y: number; width: number; height: number };

export function wrapGalleryText(text: string, maxWidth: number, measure: (line: string) => number): string[] {
  const width = Math.max(1, maxWidth);
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(" ")) {
      if (word.length === 0) continue;
      for (const piece of measure(word) <= width ? [word] : breakWord(word, width, measure)) {
        const candidate = current.length === 0 ? piece : `${current} ${piece}`;
        if (current.length === 0 || measure(candidate) <= width) current = candidate;
        else {
          lines.push(current);
          current = piece;
        }
      }
    }
    lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}

export function textBoxHeight(lineCount: number): number {
  return Math.max(1, lineCount) * GALLERY_TEXT_LINE_HEIGHT;
}

export function initialTextBox(point: Point, imageWidth: number): { x: number; y: number; width: number } {
  const available = Math.max(1, imageWidth);
  let width = Math.min(DEFAULT_TEXT_WIDTH, Math.max(GALLERY_TEXT_MIN_WIDTH, available - point.x));
  width = Math.min(width, available);
  let x = point.x;
  if (x + width > available) x = Math.max(0, available - width);
  return { x, y: point.y, width };
}

export function textWidthFromDrag(startWidth: number, dx: number): number {
  return Math.max(GALLERY_TEXT_MIN_WIDTH, startWidth + dx);
}

export function translateGalleryMark(mark: GalleryDrawMark, dx: number, dy: number): GalleryDrawMark {
  if (mark.kind === "rabisco") {
    return { ...mark, points: mark.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
  }
  if (mark.kind === "seta") {
    return {
      ...mark,
      from: { x: mark.from.x + dx, y: mark.from.y + dy },
      to: { x: mark.to.x + dx, y: mark.to.y + dy },
    };
  }
  return { ...mark, x: mark.x + dx, y: mark.y + dy };
}

export function galleryMarkBounds(mark: GalleryDrawMark, measure: (line: string) => number): GalleryMarkBounds {
  if (mark.kind === "texto") {
    return {
      x: mark.x,
      y: mark.y,
      width: mark.width,
      height: textBoxHeight(wrapGalleryText(mark.text, mark.width, measure).length),
    };
  }
  const points = mark.kind === "rabisco" ? mark.points : [mark.from, mark.to];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const padding = 8;
  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(...xs) - minX + padding * 2,
    height: Math.max(...ys) - minY + padding * 2,
  };
}

export function textResizeHandleHit(
  mark: Extract<GalleryDrawMark, { kind: "texto" }>,
  point: Point,
  measure: (line: string) => number,
  hitSlop = GALLERY_MARK_HIT_SLOP,
): boolean {
  const bounds = galleryMarkBounds(mark, measure);
  const edge = bounds.x + bounds.width;
  return point.x >= edge - hitSlop && point.x <= edge + hitSlop && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
}

export function topGalleryMarkIndex(
  marks: GalleryDrawMark[],
  point: Point,
  measure: (line: string) => number,
  hitSlop = GALLERY_MARK_HIT_SLOP,
): number | null {
  for (let index = marks.length - 1; index >= 0; index -= 1) {
    if (markHits(marks[index], point, measure, hitSlop)) return index;
  }
  return null;
}

function markHits(mark: GalleryDrawMark, point: Point, measure: (line: string) => number, hitSlop: number): boolean {
  if (mark.kind === "texto") {
    const bounds = galleryMarkBounds(mark, measure);
    return point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
  }
  const points = mark.kind === "rabisco" ? mark.points : [mark.from, mark.to];
  if (points.length === 0) return false;
  if (points.length === 1) return Math.hypot(point.x - points[0].x, point.y - points[0].y) <= hitSlop;
  for (let index = 1; index < points.length; index += 1) {
    if (distanceToSegment(point, points[index - 1], points[index]) <= hitSlop) return true;
  }
  return false;
}

function breakWord(word: string, maxWidth: number, measure: (line: string) => number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const char of word) {
    const candidate = current + char;
    if (current.length > 0 && measure(candidate) > maxWidth) {
      parts.push(current);
      current = char;
    } else current = candidate;
  }
  if (current.length > 0) parts.push(current);
  return parts.length > 0 ? parts : [word];
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}
