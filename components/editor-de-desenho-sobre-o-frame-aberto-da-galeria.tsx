"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  encodeCanvasAsGalleryJpeg,
  GALLERY_UNREADABLE_IMAGE_ERROR,
  loadScaledGalleryBitmap,
} from "@/components/conversao-de-arquivo-de-imagem-para-jpeg-da-galeria";

type Point = { x: number; y: number };

type GalleryDrawMark =
  | { kind: "rabisco"; color: string; points: Point[] }
  | { kind: "seta"; color: string; from: Point; to: Point }
  | { kind: "texto"; color: string; x: number; y: number; text: string };

type TextDraft = { x: number; y: number; value: string };
type LiveStroke = { kind: "rabisco"; points: Point[] } | { kind: "seta"; from: Point; to: Point };

const COLORS = [
  { value: "#ffffff", label: "Branco" },
  { value: "#000000", label: "Preto" },
  { value: "#d6ff3f", label: "Verde" },
] as const;

const TOOLS = [
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
  const [tool, setTool] = useState<DrawTool>("rabisco");
  const [color, setColor] = useState("#d6ff3f");
  const [marks, setMarks] = useState<GalleryDrawMark[]>([]);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [liveStroke, setLiveStroke] = useState<LiveStroke | null>(null);
  const [bitmapSize, setBitmapSize] = useState({ width: 0, height: 0 });
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    marksRef.current = marks;
    textDraftRef.current = textDraft;
    colorRef.current = color;
  }, [color, marks, textDraft]);

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
  const canSave = marks.length > 0 && !saving && bitmapSize.width > 0;

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
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawGalleryMarks(context, marks);
    if (liveStroke?.kind === "rabisco") drawScribble(context, liveStroke.points, color);
    if (liveStroke?.kind === "seta") drawArrow(context, liveStroke.from, liveStroke.to, color);
  }, [bitmapSize.width, color, display.width, liveStroke, marks]);

  function commitOpenText(): GalleryDrawMark[] {
    const draft = textDraftRef.current;
    const text = draft?.value.trim() ?? "";
    const extra: GalleryDrawMark[] =
      draft && text ? [{ kind: "texto", color: colorRef.current, x: draft.x, y: draft.y, text }] : [];
    const all = extra.length > 0 ? [...marksRef.current, ...extra] : marksRef.current;
    textDraftRef.current = null;
    marksRef.current = all;
    setTextDraft(null);
    if (extra.length > 0) setMarks(all);
    return all;
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
    drawGalleryMarks(context, all);
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

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (saving || bitmapSize.width === 0) return;
    const point = pointerPoint(event);
    if (tool === "texto") {
      commitOpenText();
      const draft = { x: point.x, y: point.y, value: "" };
      textDraftRef.current = draft;
      setTextDraft(draft);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setLiveStroke(tool === "seta" ? { kind: "seta", from: point, to: point } : { kind: "rabisco", points: [point] });
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!liveStroke) return;
    const point = pointerPoint(event);
    setLiveStroke((current) => {
      if (!current) return current;
      if (current.kind === "seta") return { ...current, to: point };
      return { ...current, points: [...current.points, point] };
    });
  }

  function onPointerUp(event: PointerEvent<HTMLCanvasElement>) {
    if (!liveStroke) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const finished = liveStroke;
    setLiveStroke(null);
    if (finished.kind === "rabisco" && pathLength(finished.points) === 0) return;
    if (finished.kind === "seta" && Math.hypot(finished.to.x - finished.from.x, finished.to.y - finished.from.y) < 8) return;
    const mark: GalleryDrawMark =
      finished.kind === "rabisco"
        ? { kind: "rabisco", color, points: finished.points }
        : { kind: "seta", color, from: finished.from, to: finished.to };
    setMarks((current) => {
      const all = [...current, mark];
      marksRef.current = all;
      return all;
    });
  }

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
              <input
                autoFocus
                value={textDraft.value}
                aria-label="Texto da anotação"
                className="absolute bg-transparent outline-none"
                style={{
                  left: textDraft.x * displayScale,
                  top: textDraft.y * displayScale,
                  color,
                  fontSize: 32 * displayScale,
                  fontFamily: "sans-serif",
                  lineHeight: 1,
                }}
                onChange={(event) => {
                  const next = { ...textDraft, value: event.target.value };
                  textDraftRef.current = next;
                  setTextDraft(next);
                }}
                onBlur={() => {
                  if (textDraftRef.current === textDraft) commitOpenText();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitOpenText();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    textDraftRef.current = null;
                    setTextDraft(null);
                  }
                }}
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
            onClick={() => setTool(item.id)}
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
            className={`h-8 w-8 rounded-full border ${color === item.value ? "border-white" : "border-white/20"}`}
            style={{ backgroundColor: item.value }}
            onClick={() => setColor(item.value)}
            disabled={saving}
          />
        ))}
        <button
          type="button"
          className="rounded-full bg-white/10 px-4 py-2 text-sm disabled:opacity-40"
          disabled={saving || marks.length === 0}
          onClick={() => {
            setMarks((current) => {
              const all = current.slice(0, -1);
              marksRef.current = all;
              return all;
            });
          }}
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

function drawGalleryMarks(context: CanvasRenderingContext2D, marks: GalleryDrawMark[]) {
  for (const mark of marks) {
    if (mark.kind === "rabisco") drawScribble(context, mark.points, mark.color);
    if (mark.kind === "seta") drawArrow(context, mark.from, mark.to, mark.color);
    if (mark.kind === "texto") drawText(context, mark);
  }
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
  context.fillStyle = mark.color;
  context.font = "32px sans-serif";
  context.textBaseline = "top";
  context.fillText(mark.text, mark.x, mark.y);
}
