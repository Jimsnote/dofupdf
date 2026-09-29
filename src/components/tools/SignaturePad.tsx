'use client';

import { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

interface SignaturePadProps {
  /** Called after every stroke and on clear: trimmed PNG data URL, or null when empty. */
  onChange: (dataUrl: string | null) => void;
  clearLabel: string;
  hint: string;
}

const PEN_COLORS = ['#111827', '#1d4ed8'] as const;

/**
 * Hand-drawing canvas for signatures. Pointer-event based (mouse + touch +
 * pen), HiDPI-scaled, with transparent-margin auto-cropping on export so the
 * placement rect the user drags later matches the visible ink.
 */
export function SignaturePad({ onChange, clearLabel, hint }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Scale the backing store for crisp strokes on HiDPI displays.
    const ratio = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = canvas;
    canvas.width = clientWidth * ratio;
    canvas.height = clientHeight * ratio;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.5;
    }
  }, []);

  function pointFrom(event: React.PointerEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerDown(event: React.PointerEvent) {
    event.preventDefault();
    canvasRef.current?.setPointerCapture(event.pointerId);
    drawing.current = true;
    last.current = pointFrom(event);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!drawing.current || !last.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const point = pointFrom(event);
    ctx.strokeStyle = penColor;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    last.current = point;
    dirty.current = true;
  }

  function onPointerUp() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (dirty.current) onChange(exportTrimmed());
  }

  /** Crops the canvas to the bounding box of the drawn pixels. */
  function exportTrimmed(): string | null {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return null;
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    const pad = 4;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);
    const out = document.createElement('canvas');
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out.getContext('2d')!.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    dirty.current = false;
    onChange(null);
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-lg border border-slate-300 bg-white">
        <canvas
          ref={canvasRef}
          className="block h-44 w-full cursor-crosshair touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-300">
          {dirty.current ? '' : hint}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex gap-1.5">
          {PEN_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              onClick={() => setPenColor(color)}
              className={`h-6 w-6 rounded-full border-2 ${
                penColor === color ? 'border-brand-600' : 'border-slate-200'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          <Eraser className="h-3.5 w-3.5" aria-hidden />
          {clearLabel}
        </button>
      </div>
    </div>
  );
}
