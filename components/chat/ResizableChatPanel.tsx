'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'session-chat-panel-bounds';

const MIN_W = 280;
const MIN_H = 240;

/** During drag, allow height past the viewport so the page can scroll — not limited to one screen. */
const DRAG_MAX_HEIGHT_PX = 16000;

function maxChatWidthPx(): number {
  if (typeof window === 'undefined') return 1600;
  return Math.min(window.innerWidth - 32, 1600);
}

/** When the window shrinks, keep the panel from extending past the visible viewport. */
function maxHeightForCurrentWindow(): number {
  if (typeof window === 'undefined') return DRAG_MAX_HEIGHT_PX;
  const v = window.visualViewport?.height ?? window.innerHeight;
  return Math.max(MIN_H, v - 48);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function readStoredBounds(): { w: number; h: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== 'object') return null;
    const w = (p as { w?: unknown }).w;
    const h = (p as { h?: unknown }).h;
    if (typeof w !== 'number' || typeof h !== 'number') return null;
    return { w, h };
  } catch {
    return null;
  }
}

function defaultBounds(): { w: number; h: number } {
  if (typeof window === 'undefined') return { w: 520, h: 620 };
  const maxH = Math.min(DRAG_MAX_HEIGHT_PX, maxHeightForCurrentWindow());
  return {
    w: 520,
    h: clamp(Math.round(window.innerHeight * 0.72), MIN_H, maxH),
  };
}

type Corner = 'nw' | 'ne' | 'sw' | 'se' | 's';

type ResizableChatPanelProps = {
  children: React.ReactNode;
  /** When false (narrow layout), width follows the column; height stays resizable. */
  wideLayout: boolean;
};

type DragState = {
  corner: Corner;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  maxW: number;
  maxH: number;
};

/**
 * Session chat column: explicit size with four corner resize handles so the main sheet area stays fluid.
 * Resize uses window-level pointer listeners (same pattern as PopoutCharacterSheet) so drags track reliably.
 */
export function ResizableChatPanel({ children, wideLayout }: ResizableChatPanelProps) {
  const [bounds, setBounds] = useState(() => ({ w: 520, h: 620 }));
  const dragRef = useRef<DragState | null>(null);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  useEffect(() => {
    const stored = readStoredBounds();
    const maxW = maxChatWidthPx();
    if (stored) {
      setBounds({
        w: clamp(stored.w, MIN_W, maxW),
        h: clamp(stored.h, MIN_H, DRAG_MAX_HEIGHT_PX),
      });
    } else {
      const d = defaultBounds();
      setBounds({
        w: clamp(d.w, MIN_W, maxW),
        h: clamp(d.h, MIN_H, DRAG_MAX_HEIGHT_PX),
      });
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bounds));
    } catch {
      /* ignore quota */
    }
  }, [bounds]);

  useEffect(() => {
    const onResize = () => {
      setBounds((b) => {
        const maxW = maxChatWidthPx();
        return {
          w: clamp(b.w, MIN_W, maxW),
          h: b.h,
        };
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const applyDrag = useCallback((d: DragState, dx: number, dy: number) => {
    if (d.corner === 's') {
      const nh = d.startH + dy;
      setBounds((b) => ({
        w: b.w,
        h: clamp(nh, MIN_H, d.maxH),
      }));
      return;
    }
    let nw = d.startW;
    let nh = d.startH;
    switch (d.corner) {
      case 'se':
        nw = d.startW + dx;
        nh = d.startH + dy;
        break;
      case 'sw':
        nw = d.startW - dx;
        nh = d.startH + dy;
        break;
      case 'ne':
        nw = d.startW + dx;
        nh = d.startH - dy;
        break;
      case 'nw':
        nw = d.startW - dx;
        nh = d.startH - dy;
        break;
      default:
        break;
    }
    setBounds({
      w: clamp(nw, MIN_W, d.maxW),
      h: clamp(nh, MIN_H, d.maxH),
    });
  }, []);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent, corner: Corner) => {
      e.preventDefault();
      e.stopPropagation();
      const b = boundsRef.current;
      const maxW = maxChatWidthPx();
      const maxH = DRAG_MAX_HEIGHT_PX;

      dragRef.current = {
        corner,
        startX: e.clientX,
        startY: e.clientY,
        startW: b.w,
        startH: b.h,
        maxW,
        maxH,
      };

      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        const dx = ev.clientX - d.startX;
        const dy = ev.clientY - d.startY;
        applyDrag(d, dx, dy);
      };

      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [applyDrag],
  );

  const hit = 'absolute z-10 w-5 h-5 touch-none select-none';

  return (
    <div
      className="relative flex flex-col min-h-0 shrink-0 max-w-full"
      style={
        wideLayout
          ? { width: bounds.w, height: bounds.h }
          : { width: '100%', height: bounds.h }
      }
    >
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>

      {wideLayout && (
        <>
          <div
            role="separator"
            aria-orientation="horizontal"
            title="Resize"
            className={`${hit} -top-1 -left-1 cursor-nwse-resize`}
            onPointerDown={(e) => onResizePointerDown(e, 'nw')}
          />
          <div
            role="separator"
            aria-orientation="horizontal"
            title="Resize"
            className={`${hit} -top-1 -right-1 cursor-nesw-resize`}
            onPointerDown={(e) => onResizePointerDown(e, 'ne')}
          />
          <div
            role="separator"
            aria-orientation="horizontal"
            title="Resize"
            className={`${hit} -bottom-1 -left-1 cursor-nesw-resize`}
            onPointerDown={(e) => onResizePointerDown(e, 'sw')}
          />
          <div
            role="separator"
            aria-orientation="horizontal"
            title="Resize"
            className={`${hit} -bottom-1 -right-1 cursor-nwse-resize`}
            onPointerDown={(e) => onResizePointerDown(e, 'se')}
          />
        </>
      )}
      {!wideLayout && (
        <div
          role="separator"
          aria-orientation="horizontal"
          title="Resize height"
          className={`${hit} -bottom-1 left-1/2 -translate-x-1/2 cursor-ns-resize w-12 h-3`}
          onPointerDown={(e) => onResizePointerDown(e, 's')}
        />
      )}
    </div>
  );
}
