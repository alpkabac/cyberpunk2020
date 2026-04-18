'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type PopoutSceneImageProps = {
  title: string;
  imageUrl: string;
  /** Cache-bust / remount when GM replaces the asset */
  imageKey: string;
  onClose: () => void;
};

const MIN_W = 360;
const MIN_H = 280;

/**
 * Floating handout image — same chrome as PopoutCharacterSheet (session room).
 */
export function PopoutSceneImage({ title, imageUrl, imageKey, onClose }: PopoutSceneImageProps) {
  const [pos, setPos] = useState({ x: 80, y: 64 });
  const [size, setSize] = useState({ w: 720, h: 520 });
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; ow: number; oh: number } | null>(null);

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: pos.x, oy: pos.y };

    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setPos({
        x: Math.max(8, d.ox + (ev.clientX - d.startX)),
        y: Math.max(8, d.oy + (ev.clientY - d.startY)),
      });
    };

    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, ow: size.w, oh: size.h };

    const onMove = (ev: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      setSize({
        w: Math.max(MIN_W, r.ow + (ev.clientX - r.startX)),
        h: Math.max(MIN_H, r.oh + (ev.clientY - r.startY)),
      });
    };

    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  if (typeof document === 'undefined') return null;

  const node = (
    <div
      className="fixed z-40 flex flex-col rounded-lg border-2 border-cyan-800/50 bg-zinc-950 shadow-[0_0_40px_rgba(0,0,0,0.6)] overflow-hidden"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
    >
      <div
        className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-700 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onHeaderMouseDown}
      >
        <span className="text-xs font-bold uppercase tracking-wide text-cyan-400/90 truncate min-w-0">{title}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] uppercase font-bold px-2 py-1 rounded border border-zinc-600 text-zinc-200 hover:bg-zinc-800 cursor-pointer shrink-0"
        >
          Close
        </button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-2 bg-black/50 relative overflow-hidden">
        <img
          key={imageKey}
          src={imageUrl}
          alt={title}
          className="max-w-full max-h-full w-auto h-auto object-contain rounded"
        />
      </div>
      <button
        type="button"
        aria-label="Resize"
        className="absolute bottom-1 right-1 w-5 h-5 cursor-se-resize bg-zinc-700/80 border border-zinc-500 rounded-sm hover:bg-zinc-600"
        onMouseDown={onResizeMouseDown}
      />
    </div>
  );

  return createPortal(node, document.body);
}
