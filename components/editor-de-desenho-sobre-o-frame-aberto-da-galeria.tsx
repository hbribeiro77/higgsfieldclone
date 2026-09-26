"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  encodeCanvasAsGalleryJpeg,
  GALLERY_UNREADABLE_IMAGE_ERROR,
  loadScaledGalleryBitmap,
} from "@/components/conversao-de-arquivo-de-imagem-para-jpeg-da-galeria";
import {
  GALLERY_MARK_HIT_SLOP,
  GALLERY_TEXT_FONT,
  GALLERY_TEXT_LINE_HEIGHT,
  GALLERY_TEXT_MIN_WIDTH,
  galleryMarkBounds,
  initialTextBox,
  textBoxHeight,
  textResizeHandleHit,
  textWidthFromDrag,
  topGalleryMarkIndex,
  translateGalleryMark,
  wrapGalleryText,
  type GalleryDrawMark,
  type Point,
} from "@/lib/marcas-do-editor-de-desenho-da-galeria";

type TextDraft = { index: number | null; x: number; y: number; width: number; value: string };
type LiveStroke = { kind: "rabisco"; points: Point[] } | { kind: "seta"; from: Point; to: Point };
type SelectGesture =
  | { kind: "move"; index: number; origin: Point; snapshot: GalleryDrawMark[] }
  | { kind: "resize"; index: number; originX: number; startWidth: number; snapshot: GalleryDrawMark[] };

const COLORS = [
  { value: "#ffffff", label: "Branco" },
  { value: "#000000", label: "Preto" },
  { value: "#d6ff3f", label: "Verde" },
] as const;

const TOOLS = [
  { id: "selecionar", label: "Selecionar" },
  { id: "rabisco", label: "Rabisco" },
  { id: "seta", label: "Seta" },
  { id: "texto", label: "Texto" },
] as const;

type DrawTool = (typeof TOOLS)[number]["id"];

export function EditorDeDesenhoSobreOFrameAbertoDaGaleria({
  imageUrl,
  saving,
  onCancel,
  onSave,
  onError,
}: {
  imageUrl: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (jpeg: Blob) => Promise<void>;
  onError: (message: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<HTMLCanvasElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const marksRef = useRef<GalleryDrawMark[]>([]);
  const textDraftRef = useRef<TextDraft | null>(null);
  const colorRef = useRef("#d6ff3f");
  const liveRef = useRef<LiveStroke | null>(null);
  const gestureRef = useRef<SelectGesture | null>(null);
  const previewRef = useRef<GalleryDrawMark[] | null>(null);
  const selectedIndexRef = useRef<number | null>(null);
  const toolRef = useRef<DrawTool>("rabisco");
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const widthDragRef = useRef<{ originClientX: number; startWidth: number; x: number; index: number | null; scale: number } | null>(null);
  const [tool, setTool] = useState<DrawTool>("rabisco");
  const [color, setColor] = useState("#d6ff3f");
  const [marks, setMarks] = useState<GalleryDrawMark[]>([]);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [bitmapSize, setBitmapSize] = useState({ width: 0, height: 0 });
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    marksRef.current = marks;
    textDraftRef.current = textDraft;
    colorRef.current = color;
    selectedIndexRef.current = selectedIndex;
    toolRef.current = tool;
  }, [color, marks, selectedIndex, textDraft, tool]);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setFrameSize({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    setFrameSize({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, []);

  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;
    void loadScaledGalleryBitmap(imageUrl)
      .then((bitmap) => {
        if (cancelled) {
          bitmap.close();
          return;
        }
        bitmapRef.current?.close();
        bitmapRef.current = bitmap;
        setBitmapSize({ width: bitmap.width, height: bitmap.height });
      })
      .catch(() => {
        if (!cancelled) onErrorRef.current(GALLERY_UNREADABLE_IMAGE_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const display = containedSize(frameSize.width, frameSize.height, bitmapSize.width, bitmapSize.height);
  const displayScale = bitmapSize.width > 0 ? display.width / bitmapSize.width : 1;
  const canSave =
    (marks.length > 0 || (textDraft?.value.trim().length ?? 0) > 0) && !saving && bitmapSize.width > 0;

  useEffect(() => {
    const bitmap = bitmapRef.current;
    const canvas = baseRef.current;
    const overlay = drawRef.current;
    if (!bitmap || !canvas || !overlay) return;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    overlay.width = bitmap.width;
    overlay.height = bitmap.height;
  }, [bitmapSize.height, bitmapSize.width, display.width]);

  useEffect(() => {
    return () => {
      bitmapRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const canvas = drawRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || bitmapSize.width === 0) return;
    paintOverlay(context, canvas, marks, liveRef.current, color, selectedIndex, textDraft?.index ?? null);
  }, [bitmapSize.width, color, display.width, marks, selectedIndex, textDraft]);

  function measureLine(line: string): number {
    const context = drawRef.current?.getContext("2d");
    if (!context) return line.length * 16;
    context.font = GALLERY_TEXT_FONT;
    return context.measureText(line).width;
  }

  function hitSlop(): number {
    return Math.max(GALLERY_MARK_HIT_SLOP, displayScale > 0 ? 22 / displayScale : GALLERY_MARK_HIT_SLOP);
  }

  function commitOpenText(): GalleryDrawMark[] {
    const draft = textDraftRef.current;
    if (!draft) return marksRef.current;
    const blank = draft.value.trim().length === 0;
    let all = marksRef.current;
    if (draft.index == null) {
      if (!blank) {
        all = [...all, { kind: "texto", color: colorRef.current, x: draft.x, y: draft.y, width: draft.width, text: draft.value }];
      }
    } else if (blank) {
      all = all.filter((_, index) => index !== draft.index);
    } else {
      all = all.map((mark, index) =>
        index === draft.index && mark.kind === "texto"
          ? { ...mark, text: draft.value, width: draft.width, color: colorRef.current }
          : mark,
      );
    }
    textDraftRef.current = null;
    marksRef.current = all;
    setTextDraft(null);
    setMarks(all);
    if (draft.index != null && blank) {
      selectedIndexRef.current = null;
      setSelectedIndex(null);
    }
    return all;
  }

  function beginTextEdit(index: number) {
    const mark = marksRef.current[index];
    if (!mark || mark.kind !== "texto") return;
    const draft = { index, x: mark.x, y: mark.y, width: mark.width, value: mark.text };
    textDraftRef.current = draft;
    selectedIndexRef.current = index;
    setTextDraft(draft);
    setSelectedIndex(index);
  }

  function replaceMarks(next: GalleryDrawMark[]) {
    marksRef.current = next;
    setMarks(next);
  }

  function chooseSelection(index: number | null) {
    selectedIndexRef.current = index;
    setSelectedIndex(index);
  }

  async function save() {
    if (saving || bitmapSize.width === 0) return;
    const all = commitOpenText();
    const bitmap = bitmapRef.current;
    if (all.length === 0 || !bitmap) return;
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) {
      onError("Não foi possível salvar a imagem.");
      return;
    }
    context.drawImage(bitmap, 0, 0);
    drawGalleryMarks(context, all, null);
    try {
      await onSave(await encodeCanvasAsGalleryJpeg(canvas));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Não foi possível salvar a imagem.");
    }
  }

  function pointerPoint(event: PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * event.currentTarget.width,
      y: ((event.clientY - rect.top) / rect.height) * event.currentTarget.height,
    };
  }

  function paintCurrentOverlay() {
    const canvas = drawRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    paintOverlay(
      context,
      canvas,
      previewRef.current ?? marksRef.current,
      liveRef.current,
      colorRef.current,
      gestureRef.current?.index ?? selectedIndexRef.current,
      textDraftRef.current?.index ?? null,
    );
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (saving || bitmapSize.width === 0) return;
    const point = pointerPoint(event);
    const activeTool = toolRef.current;
    if (activeTool === "texto") {
      event.preventDefault();
      commitOpenText();
      const box = initialTextBox(point, bitmapSize.width);
      const draft = { index: null, ...box, value: "" };
      textDraftRef.current = draft;
      setTextDraft(draft);
      chooseSelection(null);
      return;
    }
    if (activeTool === "selecionar") {
      commitOpenText();
      event.currentTarget.setPointerCapture(event.pointerId);
      const marksNow = marksRef.current;
      const slop = hitSlop();
      const resizeIndex = marksNow.findLastIndex(
        (mark) => mark.kind === "texto" && textResizeHandleHit(mark, point, measureLine, slop),
      );
      if (resizeIndex >= 0) {
        const mark = marksNow[resizeIndex];
        if (mark.kind !== "texto") return;
        gestureRef.current = { kind: "resize", index: resizeIndex, originX: point.x, startWidth: mark.width, snapshot: marksNow };
        chooseSelection(resizeIndex);
        return;
      }
      const index = topGalleryMarkIndex(marksNow, point, measureLine, slop);
      if (index == null) {
        chooseSelection(null);
        return;
      }
      gestureRef.current = { kind: "move", index, origin: point, snapshot: marksNow };
      return;
    }
    chooseSelection(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    liveRef.current = activeTool === "seta" ? { kind: "seta", from: point, to: point } : { kind: "rabisco", points: [point] };
    paintCurrentOverlay();
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const point = pointerPoint(event);
    const gesture = gestureRef.current;
    if (gesture?.kind === "resize") {
      previewRef.current = gesture.snapshot.map((mark, index) =>
        index === gesture.index && mark.kind === "texto"
          ? { ...mark, width: textWidthFromDrag(gesture.startWidth, point.x - gesture.originX) }
          : mark,
      );
      paintCurrentOverlay();
      return;
    }
    if (gesture?.kind === "move") {
      previewRef.current = gesture.snapshot.map((mark, index) =>
        index === gesture.index
          ? translateGalleryMark(mark, point.x - gesture.origin.x, point.y - gesture.origin.y)
          : mark,
      );
      paintCurrentOverlay();
      return;
    }
    const live = liveRef.current;
    if (!live) return;
    liveRef.current = live.kind === "seta" ? { ...live, to: point } : { ...live, points: [...live.points, point] };
    paintCurrentOverlay();
  }

  function onPointerUp(event: PointerEvent<HTMLCanvasElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const gesture = gestureRef.current;
    if (gesture) {
      const point = pointerPoint(event);
      const next = previewRef.current ?? gesture.snapshot;
      gestureRef.current = null;
      previewRef.current = null;
      if (gesture.kind === "resize") {
        replaceMarks(next);
        paintCurrentOverlay();
        return;
      }
      const distance = Math.hypot(point.x - gesture.origin.x, point.y - gesture.origin.y);
      if (distance < 8) {
        replaceMarks(gesture.snapshot);
        const mark = gesture.snapshot[gesture.index];
        if (mark?.kind === "texto" && selectedIndexRef.current === gesture.index) beginTextEdit(gesture.index);
        else chooseSelection(gesture.index);
        return;
      }
      replaceMarks(next);
      chooseSelection(gesture.index);
      return;
    }
    const finished = liveRef.current;
    if (!finished) return;
    liveRef.current = null;
    if (finished.kind === "rabisco" && pathLength(finished.points) === 0) {
      paintCurrentOverlay();
      return;
    }
    if (finished.kind === "seta" && Math.hypot(finished.to.x - finished.from.x, finished.to.y - finished.from.y) < 8) {
      paintCurrentOverlay();
      return;
    }
    const mark: GalleryDrawMark =
      finished.kind === "rabisco"
        ? { kind: "rabisco", color: colorRef.current, points: finished.points }
        : { kind: "seta", color: colorRef.current, from: finished.from, to: finished.to };
    replaceMarks([...marksRef.current, mark]);
  }

  function applyColor(next: string) {
    colorRef.current = next;
    setColor(next);
    const index = selectedIndexRef.current;
    if (index == null) return;
    replaceMarks(marksRef.current.map((mark, markIndex) => (markIndex === index ? { ...mark, color: next } : mark)));
  }

  function deleteSelected() {
    const draft = textDraftRef.current;
    if (draft && draft.index == null) {
      textDraftRef.current = null;
      setTextDraft(null);
      return;
    }
    const index = selectedIndexRef.current;
    if (index == null) return;
    if (draft?.index === index) {
      textDraftRef.current = null;
      setTextDraft(null);
    }
    replaceMarks(marksRef.current.filter((_, markIndex) => markIndex !== index));
    chooseSelection(null);
  }

  function onWidthHandleDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const draft = textDraftRef.current;
    const index = draft ? draft.index : selectedIndexRef.current;
    const mark = index == null ? null : marksRef.current[index];
    const width = draft?.width ?? (mark?.kind === "texto" ? mark.width : null);
    const x = draft?.x ?? (mark?.kind === "texto" ? mark.x : null);
    if (width == null || x == null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    widthDragRef.current = { originClientX: event.clientX, startWidth: width, x, index, scale: displayScale || 1 };
  }

  function onWidthHandleMove(event: PointerEvent<HTMLDivElement>) {
    const drag = widthDragRef.current;
    if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const dx = (event.clientX - drag.originClientX) / drag.scale;
    const maxWidth = Math.max(GALLERY_TEXT_MIN_WIDTH, bitmapSize.width - drag.x);
    const width = Math.min(textWidthFromDrag(drag.startWidth, dx), maxWidth);
    const draft = textDraftRef.current;
    if (draft && draft.index === drag.index) {
      const next = { ...draft, width };
      textDraftRef.current = next;
      setTextDraft(next);
    }
    if (drag.index == null) return;
    replaceMarks(
      marksRef.current.map((mark, markIndex) => (markIndex === drag.index && mark.kind === "texto" ? { ...mark, width } : mark)),
    );
  }

  function onWidthHandleUp(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    widthDragRef.current = null;
  }

  function undo() {
    const all = marksRef.current.slice(0, -1);
    replaceMarks(all);
    if (selectedIndexRef.current != null && selectedIndexRef.current >= all.length) chooseSelection(null);
    const draft = textDraftRef.current;
    if (draft?.index != null && draft.index >= all.length) {
      textDraftRef.current = null;
      setTextDraft(null);
    }
  }

  const textSession = textDraft ? `${textDraft.index ?? "novo"}:${textDraft.x}:${textDraft.y}` : "";

  useEffect(() => {
    if (!textSession) return;
    textAreaRef.current?.focus();
  }, [textSession]);

  const draftHeight = textDraft
    ? textBoxHeight(wrapGalleryText(textDraft.value, textDraft.width, measureEditorLine).length) * displayScale
    : 0;
  const selectedMark = selectedIndex == null ? null : marks[selectedIndex];
  const widthBox = textDraft
    ? {
        x: textDraft.x,
        y: textDraft.y,
        width: textDraft.width,
        height: Math.max(GALLERY_TEXT_LINE_HEIGHT, draftHeight / (displayScale || 1)),
      }
    : selectedMark?.kind === "texto"
      ? {
          x: selectedMark.x,
          y: selectedMark.y,
          width: selectedMark.width,
          height: textBoxHeight(wrapGalleryText(selectedMark.text, selectedMark.width, measureEditorLine).length),
        }
      : null;

  return (
    <div className="flex w-full max-w-4xl flex-col items-center gap-3">
      <div ref={frameRef} className="flex h-[72vh] w-full items-center justify-center">
        {display.width > 0 ? (
          <div className="relative" style={{ width: display.width, height: display.height }}>
            <canvas ref={baseRef} className="absolute inset-0 h-full w-full rounded-2xl" />
            <canvas
              ref={drawRef}
              className="absolute inset-0 h-full w-full touch-none rounded-2xl"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
            {textDraft ? (
              <textarea
                ref={textAreaRef}
                autoFocus
                value={textDraft.value}
                aria-label="Texto da anotação"
                className="absolute resize-none overflow-hidden border border-[#d6ff3f] bg-black/30 outline-none"
                style={{
                  left: textDraft.x * displayScale,
                  top: textDraft.y * displayScale,
                  width: Math.max(1, textDraft.width * displayScale),
                  height: Math.max(GALLERY_TEXT_LINE_HEIGHT * displayScale, draftHeight),
                  color,
                  fontSize: 32 * displayScale,
                  fontFamily: "sans-serif",
                  lineHeight: `${GALLERY_TEXT_LINE_HEIGHT * displayScale}px`,
                }}
                onChange={(event) => {
                  const next = { ...textDraft, value: event.target.value };
                  textDraftRef.current = next;
                  setTextDraft(next);
                }}
                onBlur={(event) => {
                  const nextFocus = event.relatedTarget;
                  if (nextFocus instanceof Element && nextFocus.dataset.alcaLargura === "true") return;
                  const current = textDraftRef.current;
                  if (current !== textDraft) return;
                  if (current.index == null && current.value.length === 0) return;
                  commitOpenText();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    textDraftRef.current = null;
                    setTextDraft(null);
                  }
                }}
              />
            ) : null}
            {widthBox ? (
              <div
                role="slider"
                aria-label="Largura do texto"
                aria-orientation="horizontal"
                aria-valuemin={GALLERY_TEXT_MIN_WIDTH}
                aria-valuenow={Math.round(widthBox.width)}
                data-alca-largura="true"
                className="absolute z-20 touch-none cursor-ew-resize rounded-sm bg-[#d6ff3f]"
                style={{
                  left: widthBox.x * displayScale + widthBox.width * displayScale - 9,
                  top: widthBox.y * displayScale + (widthBox.height * displayScale) / 2 - 18,
                  width: 18,
                  height: 36,
                }}
                onPointerDown={onWidthHandleDown}
                onPointerMove={onWidthHandleMove}
                onPointerUp={onWidthHandleUp}
                onPointerCancel={onWidthHandleUp}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {TOOLS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rounded-full px-4 py-2 text-sm ${tool === item.id ? "bg-[#d6ff3f] font-semibold text-black" : "bg-white/10"}`}
            onClick={() => {
              if (toolRef.current === "texto") commitOpenText();
              toolRef.current = item.id;
              if (item.id !== "selecionar") chooseSelection(null);
              setTool(item.id);
            }}
            disabled={saving}
          >
            {item.label}
          </button>
        ))}
        {COLORS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-label={item.label}
            aria-pressed={color === item.value}
            className={`h-8 w-8 rounded-full border-2 ${color === item.value ? "border-white" : "border-white/60"}`}
            onClick={() => applyColor(item.value)}
            disabled={saving}
            style={{ backgroundColor: item.value }}
          />
        ))}
        <button
          type="button"
          className="rounded-full bg-white/10 px-4 py-2 text-sm disabled:opacity-40"
          disabled={saving || (selectedIndex == null && textDraft == null)}
          onClick={deleteSelected}
        >
          Apagar
        </button>
        <button
          type="button"
          className="rounded-full bg-white/10 px-4 py-2 text-sm disabled:opacity-40"
          disabled={saving || marks.length === 0}
          onClick={undo}
        >
          Desfazer
        </button>
        <button
          type="button"
          className="rounded-full bg-[#d6ff3f] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
          disabled={!canSave}
          onClick={() => {
            void save();
          }}
        >
          Salvar
        </button>
        <button
          type="button"
          className="rounded-full bg-white/10 px-4 py-2 text-sm disabled:opacity-40"
          disabled={saving}
          onClick={onCancel}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

let editorMeasureCanvas: HTMLCanvasElement | null = null;

function measureEditorLine(line: string): number {
  if (typeof document === "undefined") return line.length * 16;
  editorMeasureCanvas ??= document.createElement("canvas");
  const context = editorMeasureCanvas.getContext("2d");
  if (!context) return line.length * 16;
  context.font = GALLERY_TEXT_FONT;
  return context.measureText(line).width;
}

function paintOverlay(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  marks: GalleryDrawMark[],
  live: LiveStroke | null,
  color: string,
  selectedIndex: number | null,
  hiddenTextIndex: number | null,
) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawGalleryMarks(context, marks, hiddenTextIndex);
  if (live?.kind === "rabisco") drawScribble(context, live.points, color);
  if (live?.kind === "seta") drawArrow(context, live.from, live.to, color);
  const selected = selectedIndex == null ? null : marks[selectedIndex];
  if (selected) drawSelection(context, selected);
}

function containedSize(containerWidth: number, containerHeight: number, imageWidth: number, imageHeight: number) {
  if (containerWidth <= 0 || containerHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
  return {
    width: Math.max(1, Math.floor(imageWidth * scale)),
    height: Math.max(1, Math.floor(imageHeight * scale)),
  };
}

function pathLength(points: Point[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return length;
}

function drawGalleryMarks(context: CanvasRenderingContext2D, marks: GalleryDrawMark[], hiddenTextIndex: number | null) {
  marks.forEach((mark, index) => {
    if (mark.kind === "rabisco") drawScribble(context, mark.points, mark.color);
    if (mark.kind === "seta") drawArrow(context, mark.from, mark.to, mark.color);
    if (mark.kind === "texto" && index !== hiddenTextIndex) drawText(context, mark);
  });
}

function drawScribble(context: CanvasRenderingContext2D, points: Point[], color: string) {
  if (points.length === 0) return;
  context.strokeStyle = color;
  context.lineWidth = 4;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  context.stroke();
}

function drawArrow(context: CanvasRenderingContext2D, from: Point, to: Point, color: string) {
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 4;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = 16;
  context.beginPath();
  context.moveTo(to.x, to.y);
  context.lineTo(to.x - head * Math.cos(angle - Math.PI / 6), to.y - head * Math.sin(angle - Math.PI / 6));
  context.lineTo(to.x - head * Math.cos(angle + Math.PI / 6), to.y - head * Math.sin(angle + Math.PI / 6));
  context.closePath();
  context.fill();
}

function drawText(context: CanvasRenderingContext2D, mark: Extract<GalleryDrawMark, { kind: "texto" }>) {
  context.font = GALLERY_TEXT_FONT;
  context.fillStyle = mark.color;
  context.textBaseline = "top";
  const lines = wrapGalleryText(mark.text, mark.width, (line) => {
    context.font = GALLERY_TEXT_FONT;
    return context.measureText(line).width;
  });
  lines.forEach((line, index) => {
    context.fillText(line, mark.x, mark.y + index * GALLERY_TEXT_LINE_HEIGHT);
  });
}

function drawSelection(context: CanvasRenderingContext2D, mark: GalleryDrawMark) {
  const bounds = galleryMarkBounds(mark, (line) => {
    context.font = GALLERY_TEXT_FONT;
    return context.measureText(line).width;
  });
  context.save();
  context.strokeStyle = "#d6ff3f";
  context.lineWidth = 2;
  context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.restore();
}
