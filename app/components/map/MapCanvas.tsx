'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useGameStore } from '@/lib/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import type { MapCoverRegion, Token } from '@/lib/types';
import { canDragToken, tokenRoleLabel, type TokenDragContext } from '@/lib/map/token-drag-permissions';
import {
  MAP_GRID_DEFAULT_COLS,
  MAP_GRID_DEFAULT_ROWS,
  MAP_GRID_MAX,
  MAP_GRID_MIN,
  cellDistance,
  normalizeGridDimension,
  pctToCell,
  snapPctToGrid,
} from '@/lib/map/grid';
import { CP2020_COVER_TYPES, coverSpStyle, coverTypeLabel } from '@/lib/map/cover-types';
import { normalizeCellRect, type SessionMapState } from '@/lib/map/map-state';
import type { MapPresetPayload } from '@/lib/map/map-preset-types';
import { persistSessionMapGridSettings } from '@/lib/session/persist-session-map-grid-settings';
import { persistSessionMapState } from '@/lib/session/persist-session-map-state';

const MAP_UPLOAD_MAX_BYTES = 1_800_000;

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 100) / 100));
}

export interface MapCanvasProps {
  sessionId: string;
  supabase: SupabaseClient;
  userId: string | undefined;
  isGm: boolean;
  /** Called on left-click (after drag threshold guard). */
  onTokenClick?: (tokenId: string) => void;
  /** Called on right-click / context menu. */
  onTokenRightClick?: (tokenId: string) => void;
  /** When set and no token already exists for the character, show "Place my token". */
  myCharacterId?: string | null;
  /** Callback for the "Place my token" button. */
  onPlaceMyToken?: () => void;
  /** Overlay content rendered inside the board div (e.g. TokenContextCard). */
  boardOverlay?: ReactNode;
}

export function MapCanvas({
  sessionId,
  supabase,
  userId,
  isGm,
  onTokenClick,
  onTokenRightClick,
  myCharacterId,
  onPlaceMyToken,
  boardOverlay,
}: MapCanvasProps) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  /** Ruler: pointer captured on board while drag-measuring */
  const rulerDraggingRef = useRef(false);
  /** Cover: drag rectangle in grid cells */
  const coverDraggingRef = useRef(false);
  const coverDragStartRef = useRef<{ c: number; r: number } | null>(null);
  const coverDragRectRef = useRef<{ c0: number; r0: number; c1: number; r1: number } | null>(null);
  // Track drag distance so a click doesn't fire after a drag
  const dragRef = useRef<{ tokenId: string; startX: number; startY: number; moved: boolean } | null>(null);

  const [mapError, setMapError] = useState<string | null>(null);
  const [mapBusy, setMapBusy] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [gridOptsVisible, setGridOptsVisible] = useState(true);
  const [rulerActive, setRulerActive] = useState(false);
  const [ruler, setRuler] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);
  const [coverTool, setCoverTool] = useState(false);
  const [coverDraft, setCoverDraft] = useState<{ c0: number; r0: number; c1: number; r1: number } | null>(null);
  const [coverPickRect, setCoverPickRect] = useState<{ c0: number; r0: number; c1: number; r1: number } | null>(
    null,
  );
  const [coverPickTypeId, setCoverPickTypeId] = useState(CP2020_COVER_TYPES[0]?.id ?? 'sheetrock_wall');
  const [mapPresets, setMapPresets] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetNameDraft, setPresetNameDraft] = useState('');
  const [presetBusy, setPresetBusy] = useState(false);

  const backgroundUrl = useGameStore((s) => s.map.backgroundImageUrl);
  const tokens = useGameStore((s) => s.map.tokens);
  const selectedTokenId = useGameStore((s) => s.ui.selectedTokenId);
  const allowPlayerTokenMovement = useGameStore((s) => s.session.settings.allowPlayerTokenMovement);
  const mapGridCols = useGameStore((s) => s.session.settings.mapGridCols);
  const mapGridRows = useGameStore((s) => s.session.settings.mapGridRows);
  const mapShowGrid = useGameStore((s) => s.session.settings.mapShowGrid);
  const mapSnapToGrid = useGameStore((s) => s.session.settings.mapSnapToGrid);
  const mapMetersPerSquare = useGameStore((s) => s.session.settings.mapMetersPerSquare);
  const coverRegions = useGameStore((s) => s.map.coverRegions);
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

  // Show "Place my token" when the prop is set and no token exists for that character
  const showPlaceMyToken =
    Boolean(myCharacterId) &&
    Boolean(onPlaceMyToken) &&
    !tokens.some((t) => t.characterId === myCharacterId);

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

  const gridCols = normalizeGridDimension(mapGridCols, MAP_GRID_DEFAULT_COLS);
  const gridRows = normalizeGridDimension(mapGridRows, MAP_GRID_DEFAULT_ROWS);

  const distanceFromSelected = useMemo(() => {
    if (!selectedTokenId || tokens.length < 2) return null;
    const from = tokens.find((t) => t.id === selectedTokenId);
    if (!from) return null;
    return tokens
      .filter((t) => t.id !== from.id)
      .map((t) => {
        const cells = cellDistance(from.x, from.y, t.x, t.y, gridCols, gridRows);
        const meters = mapMetersPerSquare > 0 ? cells * mapMetersPerSquare : null;
        return { token: t, cells, meters };
      })
      .sort((a, b) => a.cells - b.cells);
  }, [selectedTokenId, tokens, gridCols, gridRows, mapMetersPerSquare]);

  const pointerToPctRaw = useCallback((clientX: number, clientY: number) => {
    const el = boardRef.current;
    if (!el) return { x: 50, y: 50 };
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return { x: 50, y: 50 };
    return {
      x: clampPct(((clientX - r.left) / r.width) * 100),
      y: clampPct(((clientY - r.top) / r.height) * 100),
    };
  }, []);

  const pointerToPct = useCallback((clientX: number, clientY: number) => {
    const raw = pointerToPctRaw(clientX, clientY);
    const st = useGameStore.getState().session.settings;
    if (!st.mapSnapToGrid) return raw;
    const cols = normalizeGridDimension(st.mapGridCols, MAP_GRID_DEFAULT_COLS);
    const rows = normalizeGridDimension(st.mapGridRows, MAP_GRID_DEFAULT_ROWS);
    return snapPctToGrid(raw.x, raw.y, cols, rows);
  }, [pointerToPctRaw]);

  useEffect(() => {
    if (!rulerActive) {
      setRuler(null);
      rulerDraggingRef.current = false;
    }
  }, [rulerActive]);

  useEffect(() => {
    if (!isGm || !sessionId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('map_presets')
        .select('id,name')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false });
      if (cancelled || error) return;
      setMapPresets((data ?? []) as Array<{ id: string; name: string }>);
    })();
    return () => {
      cancelled = true;
    };
  }, [isGm, sessionId, supabase]);

  const endRulerPointerDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!rulerDraggingRef.current) return;
    rulerDraggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
  }, []);

  const onBoardPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (coverTool && isGm) {
        e.preventDefault();
        const p = pointerToPctRaw(e.clientX, e.clientY);
        const st = useGameStore.getState().session.settings;
        const cols = normalizeGridDimension(st.mapGridCols, MAP_GRID_DEFAULT_COLS);
        const rows = normalizeGridDimension(st.mapGridRows, MAP_GRID_DEFAULT_ROWS);
        const cell = pctToCell(p.x, p.y, cols, rows);
        coverDragStartRef.current = { c: cell.c, r: cell.r };
        coverDraggingRef.current = true;
        const rect = normalizeCellRect(cell.c, cell.r, cell.c, cell.r);
        coverDragRectRef.current = rect;
        setCoverDraft(rect);
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* */
        }
        return;
      }
      if (rulerActive) {
        e.preventDefault();
        const p = pointerToPctRaw(e.clientX, e.clientY);
        rulerDraggingRef.current = true;
        setRuler({ a: p, b: p });
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* */
        }
        return;
      }
      useGameStore.getState().selectToken(null);
    },
    [coverTool, isGm, rulerActive, pointerToPctRaw],
  );

  const onBoardPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (coverDraggingRef.current && coverTool && isGm) {
        e.preventDefault();
        const p = pointerToPctRaw(e.clientX, e.clientY);
        const st = useGameStore.getState().session.settings;
        const cols = normalizeGridDimension(st.mapGridCols, MAP_GRID_DEFAULT_COLS);
        const rows = normalizeGridDimension(st.mapGridRows, MAP_GRID_DEFAULT_ROWS);
        const cell = pctToCell(p.x, p.y, cols, rows);
        const start = coverDragStartRef.current;
        if (!start) return;
        const rect = normalizeCellRect(start.c, start.r, cell.c, cell.r);
        coverDragRectRef.current = rect;
        setCoverDraft(rect);
        return;
      }
      if (!rulerActive || !rulerDraggingRef.current) return;
      e.preventDefault();
      const pt = pointerToPctRaw(e.clientX, e.clientY);
      setRuler((prev) => (prev ? { a: prev.a, b: pt } : null));
    },
    [coverTool, isGm, rulerActive, pointerToPctRaw],
  );

  const onBoardPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (coverDraggingRef.current && coverTool && isGm) {
        e.preventDefault();
        coverDraggingRef.current = false;
        coverDragStartRef.current = null;
        const rect = coverDragRectRef.current;
        coverDragRectRef.current = null;
        setCoverDraft(null);
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* */
        }
        if (rect) setCoverPickRect(rect);
        return;
      }
      endRulerPointerDrag(e);
    },
    [coverTool, isGm, endRulerPointerDrag],
  );

  const onBoardPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (coverDraggingRef.current) {
        coverDraggingRef.current = false;
        coverDragStartRef.current = null;
        coverDragRectRef.current = null;
        setCoverDraft(null);
      }
      endRulerPointerDrag(e);
    },
    [endRulerPointerDrag],
  );

  const confirmCoverRegion = useCallback(async () => {
    if (!coverPickRect || !isGm) return;
    const id =
      globalThis.crypto && 'randomUUID' in globalThis.crypto
        ? globalThis.crypto.randomUUID()
        : `cov-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const next: MapCoverRegion = {
      id,
      ...coverPickRect,
      coverTypeId: coverPickTypeId,
    };
    const mapState: SessionMapState = {
      coverRegions: [...useGameStore.getState().map.coverRegions, next],
    };
    setCoverPickRect(null);
    const { error } = await persistSessionMapState(supabase, sessionId, mapState);
    if (error) setMapError(error.message);
  }, [coverPickRect, coverPickTypeId, isGm, sessionId, supabase]);

  const removeCoverRegion = useCallback(
    async (regionId: string) => {
      if (!isGm) return;
      const mapState: SessionMapState = {
        coverRegions: useGameStore.getState().map.coverRegions.filter((r) => r.id !== regionId),
      };
      const { error } = await persistSessionMapState(supabase, sessionId, mapState);
      if (error) setMapError(error.message);
    },
    [isGm, sessionId, supabase],
  );

  const saveMapPreset = useCallback(async () => {
    const name = presetNameDraft.trim();
    if (!isGm || !sessionId || !name) return;
    setPresetBusy(true);
    setMapError(null);
    try {
      const st = useGameStore.getState().session.settings;
      const bg = useGameStore.getState().map.backgroundImageUrl;
      const regions = useGameStore.getState().map.coverRegions;
      const payload: MapPresetPayload = {
        map_background_url: bg,
        settings: {
          mapGridCols: st.mapGridCols,
          mapGridRows: st.mapGridRows,
          mapShowGrid: st.mapShowGrid,
          mapSnapToGrid: st.mapSnapToGrid,
          mapMetersPerSquare: st.mapMetersPerSquare,
        },
        map_state: { coverRegions: regions },
      };
      const { error } = await supabase.from('map_presets').insert({
        session_id: sessionId,
        name,
        payload,
      });
      if (error) {
        setMapError(error.message);
        return;
      }
      setPresetNameDraft('');
      const { data } = await supabase
        .from('map_presets')
        .select('id,name')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false });
      setMapPresets((data ?? []) as Array<{ id: string; name: string }>);
    } finally {
      setPresetBusy(false);
    }
  }, [isGm, presetNameDraft, sessionId, supabase]);

  const loadMapPreset = useCallback(async () => {
    if (!isGm || !sessionId || !selectedPresetId) return;
    setPresetBusy(true);
    setMapError(null);
    try {
      const { data, error } = await supabase
        .from('map_presets')
        .select('payload')
        .eq('id', selectedPresetId)
        .eq('session_id', sessionId)
        .maybeSingle();
      if (error || !data?.payload) {
        setMapError(error?.message ?? 'Preset not found');
        return;
      }
      const payload = data.payload as MapPresetPayload;
      const prev = useGameStore.getState().session.settings;
      const mergedSettings = { ...prev, ...payload.settings };
      const { error: upErr } = await supabase
        .from('sessions')
        .update({
          map_background_url: payload.map_background_url,
          settings: mergedSettings,
          map_state: payload.map_state,
        })
        .eq('id', sessionId);
      if (upErr) {
        setMapError(upErr.message);
        return;
      }
      useGameStore.getState().setMapBackground(payload.map_background_url);
      useGameStore.getState().updateSessionSettings(payload.settings);
      useGameStore.getState().setMapCoverRegions(payload.map_state.coverRegions);
    } finally {
      setPresetBusy(false);
    }
  }, [isGm, selectedPresetId, sessionId, supabase]);

  const makeTokenHandlers = (token: Token) => {
    const draggable = canDragToken(token, dragCtx);

    return {
      onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        useGameStore.getState().selectToken(token.id);
        if (!draggable) {
          // Not draggable — just mark no drag started so click fires normally
          dragRef.current = { tokenId: token.id, startX: e.clientX, startY: e.clientY, moved: false };
          return;
        }
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        dragRef.current = { tokenId: token.id, startX: e.clientX, startY: e.clientY, moved: false };
      },
      onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!dragRef.current || dragRef.current.tokenId !== token.id) return;
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        if (!dragRef.current.moved && Math.sqrt(dx * dx + dy * dy) > 4) {
          dragRef.current.moved = true;
        }
        if (!draggable || !dragRef.current.moved) return;
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
        const wasDrag = dragRef.current.moved;
        const start = { x: dragRef.current.startX, y: dragRef.current.startY };
        dragRef.current = null;

        if (draggable && wasDrag) {
          // Commit drag
          const t = useGameStore.getState().map.tokens.find((x) => x.id === token.id);
          const startPct = pointerToPct(start.x, start.y);
          if (t) void commitTokenPosition(token.id, t.x, t.y, startPct);
        } else if (!wasDrag) {
          // It was a click, not a drag
          onTokenClick?.(token.id);
        }
      },
      onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!dragRef.current || dragRef.current.tokenId !== token.id) return;
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* */
        }
        const wasMoving = dragRef.current.moved;
        const startClient = { x: dragRef.current.startX, y: dragRef.current.startY };
        dragRef.current = null;
        if (draggable && wasMoving) {
          const startPct = pointerToPct(startClient.x, startClient.y);
          useGameStore.getState().moveToken(token.id, startPct.x, startPct.y);
        }
      },
      onContextMenu: (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        onTokenRightClick?.(token.id);
      },
    };
  };

  const cellRectPercentStyle = useCallback(
    (c0: number, r0: number, c1: number, r1: number) => ({
      left: `${(c0 / gridCols) * 100}%`,
      top: `${(r0 / gridRows) * 100}%`,
      width: `${((c1 - c0 + 1) / gridCols) * 100}%`,
      height: `${((r1 - r0 + 1) / gridRows) * 100}%`,
    }),
    [gridCols, gridRows],
  );

  return (
    <section className="rounded border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-zinc-800/80">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <h2 className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold shrink-0">Map</h2>
          <button
            type="button"
            title="Measure in meters: click and drag on the map (uses m/cell from Grid options)."
            onClick={() => {
              setCoverTool(false);
              setRulerActive((v) => !v);
            }}
            className={`text-[10px] px-2 py-0.5 rounded border shrink-0 ${
              rulerActive
                ? 'bg-amber-900/50 text-amber-100 border-amber-700/60'
                : 'bg-zinc-800/80 text-zinc-300 border-zinc-600/60 hover:bg-zinc-800'
            }`}
          >
            {rulerActive ? 'Ruler on' : 'Ruler'}
          </button>
          {isGm && (
            <button
              type="button"
              title="Draw cover on grid tiles (CP2020 SP). Drag to select cells, then pick material."
              onClick={() => {
                setRulerActive(false);
                setCoverTool((v) => !v);
              }}
              className={`text-[10px] px-2 py-0.5 rounded border shrink-0 ${
                coverTool
                  ? 'bg-emerald-900/50 text-emerald-100 border-emerald-700/60'
                  : 'bg-zinc-800/80 text-zinc-300 border-zinc-600/60 hover:bg-zinc-800'
              }`}
            >
              {coverTool ? 'Cover on' : 'Cover'}
            </button>
          )}
          {rulerActive && ruler && (
            <button
              type="button"
              onClick={() => setRuler(null)}
              className="text-[10px] px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-600/50 hover:bg-zinc-700/80 shrink-0"
            >
              Clear line
            </button>
          )}
          {isGm && !gridOptsVisible && (
            <button
              type="button"
              onClick={() => setGridOptsVisible(true)}
              className="text-[10px] px-2 py-0.5 rounded bg-zinc-800/60 text-zinc-400 border border-zinc-600/40 hover:bg-zinc-700/60 shrink-0"
            >
              Grid options
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {/* Place my token — shown to players when they have a character but no token */}
          {showPlaceMyToken && (
            <button
              type="button"
              onClick={onPlaceMyToken}
              className="px-2 py-1 rounded bg-emerald-900/50 text-emerald-200 border border-emerald-700/50 hover:bg-emerald-800/50"
            >
              + Place my token
            </button>
          )}
          {isGm && (
            <>
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
            </>
          )}
        </div>
      </div>

      {isGm && gridOptsVisible && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5 border-b border-zinc-800/50 bg-zinc-950/30 text-[10px] text-zinc-400">
          <span className="uppercase tracking-wider text-zinc-500 font-bold shrink-0">Grid</span>
          <label className="flex items-center gap-1">
            Cols
            <input
              type="number"
              min={MAP_GRID_MIN}
              max={MAP_GRID_MAX}
              className="w-12 bg-zinc-950 border border-zinc-700 rounded px-1 py-0.5 text-zinc-200"
              defaultValue={gridCols}
              key={`gc-${sessionId}-${gridCols}`}
              onBlur={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!Number.isFinite(v)) return;
                void persistSessionMapGridSettings(supabase, sessionId, {
                  mapGridCols: normalizeGridDimension(v, MAP_GRID_DEFAULT_COLS),
                });
              }}
            />
          </label>
          <label className="flex items-center gap-1">
            Rows
            <input
              type="number"
              min={MAP_GRID_MIN}
              max={MAP_GRID_MAX}
              className="w-12 bg-zinc-950 border border-zinc-700 rounded px-1 py-0.5 text-zinc-200"
              defaultValue={gridRows}
              key={`gr-${sessionId}-${gridRows}`}
              onBlur={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!Number.isFinite(v)) return;
                void persistSessionMapGridSettings(supabase, sessionId, {
                  mapGridRows: normalizeGridDimension(v, MAP_GRID_DEFAULT_ROWS),
                });
              }}
            />
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={mapShowGrid}
              onChange={(e) => {
                void persistSessionMapGridSettings(supabase, sessionId, { mapShowGrid: e.target.checked });
              }}
            />
            Show
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={mapSnapToGrid}
              onChange={(e) => {
                void persistSessionMapGridSettings(supabase, sessionId, { mapSnapToGrid: e.target.checked });
              }}
            />
            Snap
          </label>
          <label className="flex items-center gap-1">
            m/cell
            <input
              type="number"
              min={0}
              step={0.5}
              className="w-14 bg-zinc-950 border border-zinc-700 rounded px-1 py-0.5 text-zinc-200"
              defaultValue={mapMetersPerSquare}
              key={`gm-${sessionId}-${mapMetersPerSquare}`}
              onBlur={(e) => {
                const v = parseFloat(e.target.value);
                if (!Number.isFinite(v) || v < 0) return;
                void persistSessionMapGridSettings(supabase, sessionId, { mapMetersPerSquare: v });
              }}
            />
          </label>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 items-center w-full basis-full border-t border-zinc-800/50 pt-2 mt-1">
            <span className="uppercase tracking-wider text-zinc-500 font-bold shrink-0">Saved maps</span>
            <input
              type="text"
              placeholder="Preset name"
              value={presetNameDraft}
              onChange={(e) => setPresetNameDraft(e.target.value)}
              className="flex-1 min-w-[8rem] max-w-xs bg-zinc-950 border border-zinc-700 rounded px-2 py-0.5 text-zinc-200 text-[10px]"
            />
            <button
              type="button"
              disabled={presetBusy || !presetNameDraft.trim()}
              onClick={() => void saveMapPreset()}
              className="shrink-0 px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-600 text-[10px] hover:bg-slate-700 disabled:opacity-40"
            >
              Save
            </button>
            <select
              value={selectedPresetId}
              onChange={(e) => setSelectedPresetId(e.target.value)}
              className="max-w-[10rem] bg-zinc-950 border border-zinc-700 rounded px-1 py-0.5 text-[10px] text-zinc-300"
            >
              <option value="">Load preset…</option>
              {mapPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={presetBusy || !selectedPresetId}
              onClick={() => void loadMapPreset()}
              className="shrink-0 px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-600 text-[10px] hover:bg-slate-700 disabled:opacity-40"
            >
              Load
            </button>
          </div>
          {coverRegions.length > 0 && (
            <div className="w-full basis-full text-[10px] text-zinc-500 space-y-1 pt-1">
              <span className="text-zinc-600 uppercase tracking-wider font-bold">Cover areas</span>
              <ul className="flex flex-wrap gap-1">
                {coverRegions.map((r) => {
                  const def = CP2020_COVER_TYPES.find((t) => t.id === r.coverTypeId);
                  return (
                    <li
                      key={r.id}
                      className="inline-flex items-center gap-1 rounded border border-zinc-700/80 bg-zinc-950/60 px-1.5 py-0.5"
                    >
                      <span className="text-zinc-400 truncate max-w-[9rem]" title={def?.label}>
                        {def?.label ?? r.coverTypeId} (SP {def?.sp ?? '?'})
                      </span>
                      <button
                        type="button"
                        className="text-red-400/90 hover:text-red-300"
                        title="Remove"
                        onClick={() => void removeCoverRegion(r.id)}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <button
            type="button"
            onClick={() => setGridOptsVisible(false)}
            className="ml-auto shrink-0 text-zinc-500 hover:text-zinc-300 underline-offset-2 hover:underline"
          >
            Hide
          </button>
        </div>
      )}

      {mapError && <p className="text-xs text-red-400 px-3 py-1 bg-red-950/30">{mapError}</p>}

      {coverPickRect && isGm && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-emerald-900/40 bg-emerald-950/20 text-[11px]">
          <span className="text-emerald-200/90 shrink-0">Cover material (CP2020)</span>
          <select
            value={coverPickTypeId}
            onChange={(e) => setCoverPickTypeId(e.target.value)}
            className="flex-1 min-w-[12rem] max-w-lg bg-zinc-950 border border-zinc-600 rounded px-2 py-1 text-zinc-200"
          >
            {CP2020_COVER_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} — SP {t.sp}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void confirmCoverRegion()}
            className="shrink-0 px-2 py-1 rounded bg-emerald-900/60 text-emerald-100 border border-emerald-700/50 hover:bg-emerald-800/60"
          >
            Add to map
          </button>
          <button
            type="button"
            onClick={() => setCoverPickRect(null)}
            className="shrink-0 px-2 py-1 rounded border border-zinc-600 text-zinc-400 hover:bg-zinc-800/80"
          >
            Cancel
          </button>
        </div>
      )}

      <div
        ref={boardRef}
        role="application"
        aria-label="Battle map"
        className={`relative w-full min-h-[min(88vh,920px)] h-[min(88vh,920px)] max-h-[95vh] bg-zinc-950 bg-no-repeat bg-center select-none touch-none ${
          rulerActive || (coverTool && isGm) ? 'cursor-crosshair' : ''
        }`}
        style={{
          backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
          backgroundSize: 'contain',
        }}
        onPointerDown={onBoardPointerDown}
        onPointerMove={onBoardPointerMove}
        onPointerUp={onBoardPointerUp}
        onPointerCancel={onBoardPointerCancel}
      >
        {!backgroundUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-xs px-6 text-center pointer-events-none">
            No map image — {isGm ? 'set a URL or upload (GM).' : 'wait for the GM to set the map.'}
          </div>
        )}

        {/* Board overlay slot (e.g. TokenContextCard) */}
        {boardOverlay}

        {mapShowGrid && (
          <div
            className="pointer-events-none absolute inset-0 z-2"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(148,163,184,0.22) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(148,163,184,0.22) 1px, transparent 1px)
              `,
              backgroundSize: `${100 / gridCols}% ${100 / gridRows}%`,
            }}
            aria-hidden
          />
        )}

        {coverRegions.map((reg) => {
          const def = CP2020_COVER_TYPES.find((t) => t.id === reg.coverTypeId);
          const sp = def?.sp ?? 10;
          const { bg, border } = coverSpStyle(sp);
          return (
            <div
              key={reg.id}
              className="pointer-events-none absolute z-3 rounded-sm border"
              style={{
                ...cellRectPercentStyle(reg.c0, reg.r0, reg.c1, reg.r1),
                backgroundColor: bg,
                borderColor: border,
              }}
              title={`${coverTypeLabel(reg.coverTypeId)} · SP ${sp}`}
            />
          );
        })}

        {coverDraft && (
          <div
            className="pointer-events-none absolute z-3 rounded-sm border-2 border-dashed border-emerald-400/70 bg-emerald-500/10"
            style={cellRectPercentStyle(coverDraft.c0, coverDraft.r0, coverDraft.c1, coverDraft.r1)}
          />
        )}

        {ruler && (
          <svg
            className="pointer-events-none absolute inset-0 z-4 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            <line
              x1={ruler.a.x}
              y1={ruler.a.y}
              x2={ruler.b.x}
              y2={ruler.b.y}
              stroke="rgba(251, 191, 36, 0.9)"
              strokeWidth={0.45}
            />
            <circle cx={ruler.a.x} cy={ruler.a.y} r={1.1} fill="rgba(251, 191, 36, 0.95)" />
            <circle cx={ruler.b.x} cy={ruler.b.y} r={1.1} fill="rgba(251, 191, 36, 0.95)" />
          </svg>
        )}

        {rulerActive && ruler && (
          <div className="pointer-events-none absolute bottom-1 left-1/2 z-4 max-w-[95%] -translate-x-1/2 rounded border border-amber-900/40 bg-zinc-950/90 px-2 py-0.5 text-center text-[10px] text-amber-100/95">
            {(() => {
              const cells = cellDistance(ruler.a.x, ruler.a.y, ruler.b.x, ruler.b.y, gridCols, gridRows);
              if (mapMetersPerSquare > 0) {
                const m = cells * mapMetersPerSquare;
                return <span>{m.toFixed(1)} m</span>;
              }
              return (
                <span className="text-zinc-400">
                  Set <span className="text-zinc-300">m/cell</span> in Grid options for meters ({cells.toFixed(1)} cells)
                </span>
              );
            })()}
          </div>
        )}

        {rulerActive && !ruler && (
          <div className="pointer-events-none absolute bottom-1 left-1/2 z-4 max-w-[95%] -translate-x-1/2 rounded border border-amber-900/30 bg-zinc-950/90 px-2 py-0.5 text-center text-[10px] text-zinc-500">
            Click and drag on the map
          </div>
        )}

        {coverTool && isGm && !coverDraft && (
          <div className="pointer-events-none absolute bottom-1 left-1/2 z-4 max-w-[95%] -translate-x-1/2 rounded border border-emerald-900/30 bg-zinc-950/90 px-2 py-0.5 text-center text-[10px] text-emerald-600/95">
            Drag to select tiles, then choose cover type
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
              title={`${t.name}${canDragToken(t, dragCtx) ? ' — drag to move' : ' — right-click for sheet'}`}
              className={`absolute flex items-center justify-center rounded-full bg-zinc-900/90 text-[10px] font-bold text-zinc-100 shadow-lg ${
                canDragToken(t, dragCtx) ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
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
              onContextMenu={h.onContextMenu}
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

      {distanceFromSelected && distanceFromSelected.length > 0 && (
        <p className="text-[10px] text-zinc-400 px-3 py-1 border-t border-zinc-800/60">
          Distance from{' '}
          <span className="text-zinc-200">
            {tokens.find((t) => t.id === selectedTokenId)?.name ?? 'token'}
          </span>
          :{' '}
          {distanceFromSelected.map(({ token, cells, meters }) => (
            <span key={token.id} className="inline-block mr-2">
              {token.name}: {cells.toFixed(1)} cells
              {meters !== null ? ` (~${meters.toFixed(1)} m)` : ''}
            </span>
          ))}
        </p>
      )}

      <p className="text-[10px] text-zinc-600 px-3 py-1.5 border-t border-zinc-800/60">
        Click token for details · Right-click for full sheet · GM markers: amber ring · Your PC: cyan
        {!allowPlayerTokenMovement && ' · Player moves disabled in session settings'}
        {rulerActive && ' · Ruler: click-drag on map · meters use m/cell'}
      </p>
    </section>
  );
}
