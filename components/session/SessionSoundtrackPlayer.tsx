'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useGameStore } from '@/lib/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import type { SessionSoundtrackState } from '@/lib/types';
import { persistSessionSoundtrackState } from '@/lib/session/persist-session-soundtrack-state';
import { unlockHtmlAudioFromUserGesture } from '@/lib/audio/unlock-html-audio';
import {
  SOUNDTRACK_BUCKET,
  defaultSessionSoundtrackState,
  isSoundtrackAudioFileName,
  publicSoundtrackObjectUrl,
  resolveSoundtrackPlaybackUrl,
} from '@/lib/session/soundtrack-state';
import {
  uploadSoundtrackFile,
  validateSoundtrackFile,
  type SoundtrackUploadMode,
} from '@/lib/storage/soundtrack-upload';

type UploadQueueItem = {
  id: string;
  file: File;
  mode: SoundtrackUploadMode;
  status: 'pending' | 'uploading' | 'done' | 'error';
  errMsg?: string;
};

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
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [uploadTargetMode, setUploadTargetMode] = useState<SoundtrackUploadMode>('ambient');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [playbackErr, setPlaybackErr] = useState<string | null>(null);
  const [persistErr, setPersistErr] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [rangeMax, setRangeMax] = useState(0);
  const [rangeVal, setRangeVal] = useState(0);
  const musicVolume = useGameStore((s) => s.ui.audioMusicVolume);
  const setAudioMusicVolume = useGameStore((s) => s.setAudioMusicVolume);
  const musicVolumeRef = useRef(musicVolume);
  musicVolumeRef.current = musicVolume;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastLoadedPathRef = useRef<string>('');
  const lastAppliedRevRef = useRef<number>(-1);
  const loadGenRef = useRef(0);
  const scrubbingRef = useRef(false);

  const reloadTrackLists = useCallback(async () => {
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
    if (a.error || c.error) {
      setListErr(a.error?.message ?? c.error?.message ?? 'Could not list soundtrack bucket');
      return;
    }
    setListErr(null);
    setAmbientFiles((a.data ?? []).filter((f) => isSoundtrackAudioFileName(f.name)));
    setCombatFiles((c.data ?? []).filter((f) => isSoundtrackAudioFileName(f.name)));
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await reloadTrackLists();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadTrackLists]);

  useEffect(() => {
    if (uploadQueue.some((i) => i.status === 'uploading')) return;
    const next = uploadQueue.find((i) => i.status === 'pending');
    if (!next) return;
    setUploadQueue((q) => q.map((i) => (i.id === next.id ? { ...i, status: 'uploading' } : i)));
    void (async () => {
      const { error } = await uploadSoundtrackFile(supabase, { mode: next.mode, file: next.file });
      setUploadQueue((q) =>
        q.map((i) =>
          i.id === next.id
            ? {
                ...i,
                status: error ? 'error' : 'done',
                errMsg: error?.message,
              }
            : i,
        ),
      );
      if (!error) {
        await reloadTrackLists();
        window.setTimeout(() => {
          setUploadQueue((q) => q.filter((i) => i.id !== next.id));
        }, 2200);
      }
    })();
  }, [uploadQueue, supabase, reloadTrackLists]);

  /** play() after async signed-URL + decode is often blocked unless audio was unlocked from a gesture. */
  useEffect(() => {
    const prime = () => unlockHtmlAudioFromUserGesture();
    window.addEventListener('pointerdown', prime, { capture: true, passive: true });
    window.addEventListener('keydown', prime, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', prime, { capture: true });
      window.removeEventListener('keydown', prime, { capture: true });
    };
  }, []);

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

    let cancelled = false;

    if (!soundtrackState) {
      loadGenRef.current += 1;
      lastLoadedPathRef.current = '';
      lastAppliedRevRef.current = -1;
      setPlaybackErr(null);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return () => {
        cancelled = true;
      };
    }

    const pubProbe = publicSoundtrackObjectUrl(activePath);
    if (!activePath.trim() || !pubProbe) {
      loadGenRef.current += 1;
      lastLoadedPathRef.current = '';
      lastAppliedRevRef.current = -1;
      setPlaybackErr(null);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return () => {
        cancelled = true;
      };
    }

    const rev = soundtrackState.revision;
    const shouldPlay = soundtrackState.isPlaying;

    const applyRevTransport = () => {
      if (lastAppliedRevRef.current === rev) return;
      lastAppliedRevRef.current = rev;
      if (shouldPlay) void audio.play().catch(() => {});
      else audio.pause();
    };

    if (lastLoadedPathRef.current !== activePath) {
      const gen = ++loadGenRef.current;
      setPlaybackErr(null);

      void (async () => {
        const { url, lastError } = await resolveSoundtrackPlaybackUrl(supabase, activePath);
        if (cancelled || gen !== loadGenRef.current) return;
        if (!audioRef.current) return;
        const el = audioRef.current;

        if (!url) {
          setPlaybackErr(
            lastError ?? 'Could not build a playback URL. Check the soundtrack bucket and policies.',
          );
          lastLoadedPathRef.current = '';
          return;
        }

        el.src = url;
        el.load();

        const onErr = () => {
          if (cancelled || gen !== loadGenRef.current) return;
          const code = el.error?.code;
          const detail = el.error?.message ?? '';
          setPlaybackErr(
            `Playback failed (code ${code ?? '?'}${detail ? `: ${detail}` : ''}). ` +
              'If you see HTTP 502 on the Storage request, confirm the `soundtrack` bucket exists, ' +
              'is readable (signed URL or public), and your Supabase project is active.',
          );
        };

        let transportRan = false;
        const runTransport = () => {
          if (transportRan || cancelled || gen !== loadGenRef.current) return;
          transportRan = true;
          lastLoadedPathRef.current = activePath;
          setPlaybackErr(null);
          el.volume = musicVolumeRef.current;
          el.currentTime = 0;
          const st = useGameStore.getState().session.soundtrackState;
          const playNow = st?.isPlaying ?? false;
          const revNow = st?.revision ?? 0;
          if (playNow) {
            void el.play().catch((e) => {
              if (typeof console !== 'undefined') {
                console.warn(
                  '[soundtrack] play() blocked or failed — click Play again or tap the page once',
                  e,
                );
              }
            });
          } else el.pause();
          lastAppliedRevRef.current = revNow;
        };

        el.addEventListener('error', onErr, { once: true });
        el.addEventListener('loadedmetadata', runTransport, { once: true });
        el.addEventListener('canplay', runTransport, { once: true });
      })();

      return () => {
        cancelled = true;
        loadGenRef.current += 1;
      };
    }

    if (audio.readyState < 1) {
      return () => {
        cancelled = true;
      };
    }

    applyRevTransport();

    return () => {
      cancelled = true;
    };
  }, [soundtrackState, activePath, supabase]);

  useEffect(() => {
    const a = audioRef.current;
    if (a) a.volume = musicVolume;
  }, [musicVolume]);

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
    unlockHtmlAudioFromUserGesture();
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
    unlockHtmlAudioFromUserGesture();
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
    unlockHtmlAudioFromUserGesture();
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

      <audio ref={audioRef} preload="metadata" playsInline className="hidden" />

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
          Music
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={musicVolume}
          disabled={localBusy || !canUse}
          onChange={(e) =>
            setAudioMusicVolume(Math.min(1, Math.max(0, Number(e.target.value))))
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

      <div className="space-y-1.5 border-t border-zinc-800 pt-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] uppercase text-zinc-500 tracking-wide">Upload to</span>
          {(['ambient', 'combat'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setUploadTargetMode(m)}
              className={`text-[10px] px-1.5 py-0.5 rounded border ${
                uploadTargetMode === m
                  ? 'border-cyan-700/60 bg-cyan-950/30 text-cyan-100'
                  : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800/50'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.ogg,.opus,.wav,.m4a,.flac"
            multiple
            className="hidden"
            onChange={(e) => {
              const { files } = e.target;
              if (!files?.length) return;
              setUploadQueue((q) => [
                ...q,
                ...Array.from(files).map((file) => {
                  const pre = validateSoundtrackFile(file);
                  if (pre) {
                    return {
                      id: crypto.randomUUID(),
                      file,
                      mode: uploadTargetMode,
                      status: 'error' as const,
                      errMsg: pre,
                    };
                  }
                  return {
                    id: crypto.randomUUID(),
                    file,
                    mode: uploadTargetMode,
                    status: 'pending' as const,
                  };
                }),
              ]);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 text-[11px] py-1 rounded border border-zinc-600 text-zinc-200 hover:bg-zinc-800/80"
          >
            Add files to queue…
          </button>
          {uploadQueue.length > 0 && (
            <button
              type="button"
              onClick={() => setUploadQueue([])}
              className="shrink-0 text-[10px] px-2 py-1 rounded border border-zinc-700 text-zinc-500 hover:text-zinc-300"
            >
              Clear queue
            </button>
          )}
        </div>
        {uploadQueue.length > 0 && (
          <ul className="text-[10px] space-y-0.5 max-h-24 overflow-y-auto pr-0.5">
            {uploadQueue.map((it) => (
              <li
                key={it.id}
                className="flex items-start justify-between gap-1 font-mono text-zinc-400 leading-tight"
              >
                <span className="min-w-0 truncate" title={it.file.name}>
                  <span className="text-zinc-600">{it.mode}/</span>
                  {it.file.name}
                </span>
                <span className="shrink-0">
                  {it.status === 'pending' && <span className="text-zinc-500">queued</span>}
                  {it.status === 'uploading' && <span className="text-amber-300/90">…</span>}
                  {it.status === 'done' && <span className="text-emerald-400/90">ok</span>}
                  {it.status === 'error' && (
                    <span className="text-rose-400/90" title={it.errMsg ?? ''}>
                      fail
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {listErr && <p className="text-[10px] text-amber-400/90">{listErr}</p>}
      {persistErr && <p className="text-[10px] text-red-400">{persistErr}</p>}
      {!listErr && !canUse && (
        <p className="text-[10px] text-zinc-500">
          Add audio with the uploader (signed-in players), or add files under{' '}
          <span className="font-mono text-zinc-400">soundtrack/ambient</span> and{' '}
          <span className="font-mono text-zinc-400">soundtrack/combat</span> in the Supabase dashboard.
        </p>
      )}
    </div>
  );
}
