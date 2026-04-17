'use client';

import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useGameStore } from '@/lib/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import type { Token } from '@/lib/types';
import { canDragToken, tokenRoleLabel, type TokenDragContext } from '@/lib/map/token-drag-permissions';

const MAP_UPLOAD_MAX_BYTES = 1_800_000;

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 100) / 100));
}

export interface MapCanvasProps {
  sessionId: string;
  supabase: SupabaseClient;
  userId: string | undefined;
  isGm: boolean;
}

export function MapCanvas({ sessionId, supabase, userId, isGm }: MapCanvasProps) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ tokenId: string; startX: number; startY: number } | null>(null);

  const [mapError, setMapError] = useState<string | null>(null);
  const [mapBusy, setMapBusy] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');

  const backgroundUrl = useGameStore((s) => s.map.backgroundImageUrl);
  const tokens = useGameStore((s) => s.map.tokens);
  const allowPlayerTokenMovement = useGameStore((s) => s.session.settings.allowPlayerTokenMovement);
  const { byId: charsById, allIds: charIds } = useGameStore(
    useShallow((s) => ({ byId: s.characters.byId, allIds: s.characters.allIds })),
  );

  const characterOwnerById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const id of charIds) {
      const u = charsById[id]?.userId;
      if (u) m[id] = u;
    }
    return m;
  }, [charsById, charIds]);

  const dragCtx: TokenDragContext = useMemo(
    () => ({
      userId,
      isGm,
      allowPlayerTokenMovement,
      characterOwnerById,
    }),
    [userId, isGm, allowPlayerTokenMovement, characterOwnerById],
  );

  const applyBackgroundUrl = useCallback(
    async (url: string) => {
      setMapError(null);
      setMapBusy(true);
      try {
        useGameStore.getState().setMapBackground(url);
        const { error } = await supabase
          .from('sessions')
          .update({ map_background_url: url })
          .eq('id', sessionId);
        if (error) {
          setMapError(error.message);
        }
      } finally {
        setMapBusy(false);
      }
    },
    [sessionId, supabase],
  );

  const onPickMapFile = useCallback(
    (file: File | null) => {
      if (!file || !isGm) return;
      if (!file.type.startsWith('image/')) {
        setMapError('Choose an image file.');
        return;
      }
      if (file.size > MAP_UPLOAD_MAX_BYTES) {
        setMapError(`Image too large (max ~${Math.round(MAP_UPLOAD_MAX_BYTES / 1024)} KB for inline URL).`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        if (!dataUrl.startsWith('data:image/')) {
          setMapError('Could not read image.');
          return;
        }
        void applyBackgroundUrl(dataUrl);
      };
      reader.onerror = () => setMapError('Read failed.');
      reader.readAsDataURL(file);
    },
    [applyBackgroundUrl, isGm],
  );

  const commitTokenPosition = useCallback(
    async (tokenId: string, x: number, y: number, revert: { x: number; y: number }) => {
      setMapError(null);
      const { error } = await supabase
        .from('tokens')
        .update({ x, y })
        .eq('id', tokenId)
        .eq('session_id', sessionId);
      if (error) {
        useGameStore.getState().moveToken(tokenId, revert.x, revert.y);
        setMapError(error.message);
      }
    },
    [sessionId, supabase],
  );

  const pointerToPct = useCallback((clientX: number, clientY: number) => {
    const el = boardRef.current;
    if (!el) return { x: 50, y: 50 };
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return { x: 50, y: 50 };
    return {
      x: clampPct(((clientX - r.left) / r.width) * 100),
      y: clampPct(((clientY - r.top) / r.height) * 100),
    };
  }, []);

  const onBoardPointerDown = useCallback(() => {
    useGameStore.getState().selectToken(null);
  }, []);

  const makeTokenHandlers = (token: Token) => {
    const draggable = canDragToken(token, dragCtx);

    return {
      onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        useGameStore.getState().selectToken(token.id);
        if (!draggable) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        dragRef.current = { tokenId: token.id, startX: token.x, startY: token.y };
      },
      onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!dragRef.current || dragRef.current.tokenId !== token.id) return;
        const { x, y } = pointerToPct(e.clientX, e.clientY);
        useGameStore.getState().moveToken(token.id, x, y);
      },
      onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!dragRef.current || dragRef.current.tokenId !== token.id) return;
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
        const start = { x: dragRef.current.startX, y: dragRef.current.startY };
        dragRef.current = null;
        const t = useGameStore.getState().map.tokens.find((x) => x.id === token.id);
        if (t) void commitTokenPosition(token.id, t.x, t.y, start);
      },
      onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!dragRef.current || dragRef.current.tokenId !== token.id) return;
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* */
        }
        const start = { x: dragRef.current.startX, y: dragRef.current.startY };
        dragRef.current = null;
        useGameStore.getState().moveToken(token.id, start.x, start.y);
      },
    };
  };

  return (
    <section className="rounded border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-zinc-800/80">
        <h2 className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Map</h2>
        {isGm && (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <input
              type="text"
              placeholder="Background image URL"
              className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 w-48 sm:w-64 text-zinc-200"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
            />
            <button
              type="button"
              disabled={mapBusy || !urlDraft.trim()}
              onClick={() => void applyBackgroundUrl(urlDraft.trim())}
              className="px-2 py-1 rounded bg-cyan-900/60 text-cyan-200 border border-cyan-800/50 hover:bg-cyan-800/60 disabled:opacity-40"
            >
              Set URL
            </button>
            <label className="px-2 py-1 rounded bg-violet-900/40 text-violet-200 border border-violet-800/40 cursor-pointer hover:bg-violet-900/60">
              Upload
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPickMapFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        )}
      </div>

      {mapError && <p className="text-xs text-red-400 px-3 py-1 bg-red-950/30">{mapError}</p>}

      <div
        ref={boardRef}
        role="application"
        aria-label="Battle map"
        className="relative w-full aspect-video bg-zinc-950 bg-no-repeat bg-center select-none touch-none"
        style={{
          backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
          backgroundSize: 'contain',
        }}
        onPointerDown={onBoardPointerDown}
      >
        {!backgroundUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-xs px-6 text-center pointer-events-none">
            No map image — {isGm ? 'set a URL or upload (GM).' : 'wait for the GM to set the map.'}
          </div>
        )}

        {tokens.map((t) => {
          const role = tokenRoleLabel(t, dragCtx);
          const ring =
            role === 'gm'
              ? 'ring-2 ring-amber-500/80'
              : role === 'yours'
                ? 'ring-2 ring-cyan-500/80'
                : 'ring-1 ring-zinc-600/80';
          const h = makeTokenHandlers(t);
          const showPortrait = t.imageUrl.trim().length > 0;

          return (
            <div
              key={t.id}
              title={`${t.name}${canDragToken(t, dragCtx) ? ' — drag to move' : ''}`}
              className={`absolute flex items-center justify-center rounded-full bg-zinc-900/90 text-[10px] font-bold text-zinc-100 shadow-lg ${
                canDragToken(t, dragCtx) ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
              } ${ring} overflow-hidden`}
              style={{
                left: `${t.x}%`,
                top: `${t.y}%`,
                width: t.size,
                height: t.size,
                transform: 'translate(-50%, -50%)',
                zIndex: 5,
              }}
              onPointerDown={h.onPointerDown}
              onPointerMove={h.onPointerMove}
              onPointerUp={h.onPointerUp}
              onPointerCancel={h.onPointerCancel}
            >
              {showPortrait ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.imageUrl} alt="" className="w-full h-full object-cover pointer-events-none" />
              ) : (
                <span className="px-1 text-center leading-tight pointer-events-none">{t.name.slice(0, 3)}</span>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-zinc-600 px-3 py-1.5 border-t border-zinc-800/60">
        Positions are synced to the session (0–100%). GM markers: amber ring. Your PC: cyan.
        {!allowPlayerTokenMovement && ' Player token moves are disabled in session settings.'}
      </p>
    </section>
  );
}
