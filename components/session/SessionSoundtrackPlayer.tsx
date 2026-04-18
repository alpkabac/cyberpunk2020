'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useGameStore } from '@/lib/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import type { SessionSoundtrackState } from '@/lib/types';
import { persistSessionSoundtrackState } from '@/lib/session/persist-session-soundtrack-state';
import {
  SOUNDTRACK_BUCKET,
  defaultSessionSoundtrackState,
  isSoundtrackAudioFileName,
  publicSoundtrackObjectUrl,
} from '@/lib/session/soundtrack-state';

function sessionInCombat(combatState: { entries: { length: number } } | null | undefined): boolean {
  return combatState != null && combatState.entries.length > 0;
}

interface SessionSoundtrackPlayerProps {
  sessionId: string;
  supabase: SupabaseClient;
}

export function SessionSoundtrackPlayer({ sessionId, supabase }: SessionSoundtrackPlayerProps) {
  const { combatState, soundtrackState } = useGameStore(
    useShallow((s) => ({
      combatState: s.session.combatState,
      soundtrackState: s.session.soundtrackState,
    })),
  );

  const inCombat = useMemo(() => sessionInCombat(combatState), [combatState]);

  const [ambientFiles, setAmbientFiles] = useState<{ name: string }[]>([]);
  const [combatFiles, setCombatFiles] = useState<{ name: string }[]>([]);
  const [listErr, setListErr] = useState<string | null>(null);
  const [persistErr, setPersistErr] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [rangeMax, setRangeMax] = useState(0);
  const [rangeVal, setRangeVal] = useState(0);
  const [localVolume, setLocalVolume] = useState(0.7);
  const localVolumeRef = useRef(localVolume);
  localVolumeRef.current = localVolume;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastLoadedPathRef = useRef<string>('');
  const lastAppliedRevRef = useRef<number>(-1);
  const scrubbingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [a, c] = await Promise.all([
        supabase.storage.from(SOUNDTRACK_BUCKET).list('ambient', {
          limit: 200,
          sortBy: { column: 'name', order: 'asc' },
        }),
        supabase.storage.from(SOUNDTRACK_BUCKET).list('combat', {
          limit: 200,
          sortBy: { column: 'name', order: 'asc' },
        }),
      ]);
      if (cancelled) return;
      if (a.error || c.error) {
        setListErr(a.error?.message ?? c.error?.message ?? 'Could not list soundtrack bucket');
        return;
      }
      setAmbientFiles((a.data ?? []).filter((f) => isSoundtrackAudioFileName(f.name)));
      setCombatFiles((c.data ?? []).filter((f) => isSoundtrackAudioFileName(f.name)));
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const activePath = soundtrackState
    ? inCombat
      ? soundtrackState.combatPath
      : soundtrackState.ambientPath
    : '';

  const filesForMode = inCombat ? combatFiles : ambientFiles;
  const pathPrefix = inCombat ? 'combat' : 'ambient';

  const selectValue = useMemo(() => {
    if (activePath && filesForMode.some((f) => `${pathPrefix}/${f.name}` === activePath)) {
      return activePath;
    }
    if (filesForMode[0]) return `${pathPrefix}/${filesForMode[0].name}`;
    return '';
  }, [activePath, filesForMode, pathPrefix]);

  const displayPath = activePath || selectValue;

  const displayTrackTitle = useMemo(() => {
    if (!displayPath) return '—';
    const seg = displayPath.split('/').pop();
    return seg || displayPath;
  }, [displayPath]);

  const modeLabel = inCombat ? 'Combat' : 'Ambient';

  const ensureBaseState = useCallback((): SessionSoundtrackState => {
    const cur = useGameStore.getState().session.soundtrackState;
    if (cur) return { ...cur };
    const a0 = ambientFiles[0] ? `ambient/${ambientFiles[0].name}` : '';
    const c0 = combatFiles[0] ? `combat/${combatFiles[0].name}` : '';
    return { ...defaultSessionSoundtrackState(), ambientPath: a0, combatPath: c0 };
  }, [ambientFiles, combatFiles]);

  const pushState = useCallback(
    async (next: SessionSoundtrackState) => {
      setPersistErr(null);
      setLocalBusy(true);
      try {
        const toWrite = { ...next, revision: Date.now() };
        const { error } = await persistSessionSoundtrackState(supabase, sessionId, toWrite);
        if (error) setPersistErr(error.message);
      } finally {
        setLocalBusy(false);
      }
    },
    [sessionId, supabase],
  );

  /** Shared: track + play/pause. Volume and position are local only. */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!soundtrackState) {
      lastLoadedPathRef.current = '';
      lastAppliedRevRef.current = -1;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return;
    }

    const url = publicSoundtrackObjectUrl(activePath);

    if (!activePath || !url) {
      lastLoadedPathRef.current = '';
      lastAppliedRevRef.current = -1;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return;
    }

    const rev = soundtrackState.revision;
    const shouldPlay = soundtrackState.isPlaying;

    if (lastLoadedPathRef.current !== activePath) {
      lastLoadedPathRef.current = activePath;
      audio.src = url;
      audio.load();
      const onMeta = () => {
        audio.volume = localVolumeRef.current;
        audio.currentTime = 0;
        if (shouldPlay) void audio.play().catch(() => {});
        else audio.pause();
        lastAppliedRevRef.current = rev;
      };
      audio.addEventListener('loadedmetadata', onMeta, { once: true });
      return;
    }

    if (lastAppliedRevRef.current !== rev) {
      lastAppliedRevRef.current = rev;
      if (shouldPlay) void audio.play().catch(() => {});
      else audio.pause();
    }
  }, [soundtrackState, activePath]);

  useEffect(() => {
    const a = audioRef.current;
    if (a) a.volume = localVolume;
  }, [localVolume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const sync = () => {
      if (scrubbingRef.current) return;
      setRangeVal(audio.currentTime);
      if (audio.duration && Number.isFinite(audio.duration)) setRangeMax(audio.duration);
    };
    audio.addEventListener('loadedmetadata', sync);
    audio.addEventListener('timeupdate', sync);
    return () => {
      audio.removeEventListener('loadedmetadata', sync);
      audio.removeEventListener('timeupdate', sync);
    };
  }, [activePath, soundtrackState?.revision]);

  const togglePlay = () => {
    const base = soundtrackState ?? ensureBaseState();
    if (!base.ambientPath && !base.combatPath) {
      setPersistErr('Add audio files to soundtrack/ambient and soundtrack/combat in Storage.');
      return;
    }
    void pushState({
      ...base,
      isPlaying: !base.isPlaying,
    });
  };

  const stepTrack = (delta: number) => {
    const base = soundtrackState ?? ensureBaseState();
    if (filesForMode.length === 0) return;
    const paths = filesForMode.map((f) => `${pathPrefix}/${f.name}`);
    const cur = inCombat ? base.combatPath : base.ambientPath;
    const idx = Math.max(0, paths.indexOf(cur));
    const nextPath = paths[(idx + delta + paths.length) % paths.length];
    if (inCombat) {
      void pushState({ ...base, combatPath: nextPath, isPlaying: true });
    } else {
      void pushState({ ...base, ambientPath: nextPath, isPlaying: true });
    }
  };

  const onPickTrack = (objectPath: string) => {
    const base = soundtrackState ?? ensureBaseState();
    if (inCombat) {
      void pushState({ ...base, combatPath: objectPath, isPlaying: true });
    } else {
      void pushState({ ...base, ambientPath: objectPath, isPlaying: true });
    }
  };

  const onScrubChange = (v: number) => {
    setRangeVal(v);
    const audio = audioRef.current;
    if (audio) audio.currentTime = v;
  };

  const canUse = ambientFiles.length > 0 || combatFiles.length > 0;

  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[10px] uppercase text-zinc-500 tracking-wider">Soundtrack</h2>
        <span
          className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${
            inCombat
              ? 'border-rose-700/60 text-rose-200/90 bg-rose-950/35'
              : 'border-emerald-800/60 text-emerald-200/85 bg-emerald-950/25'
          }`}
        >
          {modeLabel}
        </span>
      </div>

      <audio ref={audioRef} preload="metadata" className="hidden" />

      <div className="min-h-10">
        <p className="text-xs text-zinc-200 truncate font-medium" title={displayPath || undefined}>
          {displayTrackTitle}
        </p>
        <p className="text-[10px] text-zinc-500 truncate">
          {displayPath ? displayPath : 'No track selected for this mode'}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={localBusy || !canUse}
          onClick={() => stepTrack(-1)}
          className="shrink-0 px-2 py-1 text-[11px] rounded border border-zinc-600 text-zinc-200 hover:bg-zinc-800 disabled:opacity-45"
          title="Previous track in folder"
        >
          «
        </button>
        <button
          type="button"
          disabled={localBusy || !canUse}
          onClick={() => void togglePlay()}
          className="flex-1 py-1.5 text-[11px] uppercase tracking-wide rounded border border-cyan-800/60 text-cyan-100 hover:bg-cyan-950/40 disabled:opacity-45"
        >
          {localBusy ? '…' : soundtrackState?.isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          disabled={localBusy || !canUse}
          onClick={() => stepTrack(1)}
          className="shrink-0 px-2 py-1 text-[11px] rounded border border-zinc-600 text-zinc-200 hover:bg-zinc-800 disabled:opacity-45"
          title="Next track in folder"
        >
          »
        </button>
      </div>

      <div className="space-y-0.5">
        <label className="text-[9px] uppercase text-zinc-500 tracking-wide">
          Position (this device only)
        </label>
        <input
          type="range"
          min={0}
          max={rangeMax > 0 ? rangeMax : 1}
          step={0.1}
          value={rangeMax > 0 ? rangeVal : 0}
          disabled={!activePath || rangeMax <= 0}
          onPointerDown={() => {
            scrubbingRef.current = true;
          }}
          onPointerUp={() => {
            scrubbingRef.current = false;
          }}
          onPointerCancel={() => {
            scrubbingRef.current = false;
          }}
          onChange={(e) => onScrubChange(Number(e.target.value))}
          className="w-full accent-cyan-600 disabled:opacity-40"
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[9px] uppercase text-zinc-500 tracking-wide shrink-0">
          Volume
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={localVolume}
          disabled={localBusy || !canUse}
          onChange={(e) =>
            setLocalVolume(Math.min(1, Math.max(0, Number(e.target.value))))
          }
          className="flex-1 accent-zinc-500 disabled:opacity-40"
        />
      </div>

      <div className="space-y-0.5">
        <label className="text-[9px] uppercase text-zinc-500 tracking-wide">Track ({pathPrefix}/)</label>
        <select
          value={selectValue}
          disabled={localBusy || filesForMode.length === 0}
          onChange={(e) => {
            const v = e.target.value;
            if (v) onPickTrack(v);
          }}
          className="w-full text-[11px] bg-zinc-950 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 disabled:opacity-45"
        >
          {filesForMode.length === 0 ? (
            <option value="">No files</option>
          ) : (
            filesForMode.map((f) => {
              const p = `${pathPrefix}/${f.name}`;
              return (
                <option key={p} value={p}>
                  {f.name}
                </option>
              );
            })
          )}
        </select>
      </div>

      {listErr && <p className="text-[10px] text-amber-400/90">{listErr}</p>}
      {persistErr && <p className="text-[10px] text-red-400">{persistErr}</p>}
      {!listErr && !canUse && (
        <p className="text-[10px] text-zinc-500">
          Upload audio under <span className="font-mono text-zinc-400">soundtrack/ambient</span> and{' '}
          <span className="font-mono text-zinc-400">soundtrack/combat</span> in Supabase Storage.
        </p>
      )}
    </div>
  );
}
