'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useShallow } from 'zustand/react/shallow';
import { getAccessTokenForApi } from '@/lib/auth/client-access-token';
import { persistSessionTtsEnabled } from '@/lib/session/persist-session-tts-enabled';
import { persistSessionNarrationTts } from '@/lib/session/persist-session-narration-tts';
import {
  DEFAULT_NARRATION_TTS_CLIENT_CONFIG,
  mergeNarrationTtsClientConfig,
  type ChatterboxNpcVoiceMode,
  type ChatterboxNpcVoiceRule,
  type NarrationTtsClientConfig,
  type NarrationTtsProviderId,
} from '@/lib/narration/narration-tts-client-config';
import { useGameStore } from '@/lib/store/game-store';

const PROVIDERS: { id: NarrationTtsProviderId; label: string }[] = [
  { id: 'cartesia', label: 'Cartesia (cloud)' },
  { id: 'chatterbox', label: 'Chatterbox (local server)' },
  { id: 'kokoro', label: 'Kokoro (local server)' },
];

export function NarrationTtsSettingsPopout({
  open,
  onClose,
  sessionId,
  supabase,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  supabase: SupabaseClient;
}) {
  const { ttsEnabled } = useGameStore(
    useShallow((s) => ({ ttsEnabled: s.session.settings.ttsEnabled })),
  );

  const [draft, setDraft] = useState<NarrationTtsClientConfig>(() =>
    mergeNarrationTtsClientConfig(useGameStore.getState().session.settings.narrationTts),
  );

  const [chatterboxVoices, setChatterboxVoices] = useState<string[]>([]);
  const [chatterboxReferenceFiles, setChatterboxReferenceFiles] = useState<string[]>([]);
  const [chatterboxVoicesLoading, setChatterboxVoicesLoading] = useState(false);
  const [chatterboxVoicesError, setChatterboxVoicesError] = useState<string | null>(null);

  function sanitizeFilenameList(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const x of raw) {
      if (typeof x === 'string' && x.length > 0 && !x.startsWith('[object ')) {
        out.push(x);
        continue;
      }
      if (x != null && typeof x === 'object' && !Array.isArray(x)) {
        const name = (x as Record<string, unknown>).filename ?? (x as Record<string, unknown>).name;
        if (typeof name === 'string' && name.length > 0) out.push(name);
      }
    }
    return out;
  }

  const loadChatterboxVoices = useCallback(
    async (baseUrl: string, signal?: AbortSignal) => {
      const base = baseUrl.trim();
      if (!base) {
        setChatterboxVoicesError('Set local server base URL first.');
        return;
      }
      setChatterboxVoicesLoading(true);
      setChatterboxVoicesError(null);
      try {
        const token = await getAccessTokenForApi(supabase);
        if (!token) {
          setChatterboxVoicesError('Not signed in');
          return;
        }
        const q = new URLSearchParams({ sessionId, baseUrl: base });
        const res = await fetch(`/api/session/narration-tts/chatterbox-voices?${q}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        });
        const data = (await res.json().catch(() => ({}))) as {
          voices?: unknown;
          referenceFiles?: unknown;
          error?: string;
          detail?: string;
        };
        if (!res.ok) {
          setChatterboxVoices([]);
          setChatterboxReferenceFiles([]);
          setChatterboxVoicesError(data.detail ?? data.error ?? res.statusText ?? 'Failed to load voices');
          return;
        }
        setChatterboxVoices(sanitizeFilenameList(data.voices));
        setChatterboxReferenceFiles(sanitizeFilenameList(data.referenceFiles));
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        if (e instanceof Error && e.name === 'AbortError') return;
        setChatterboxVoices([]);
        setChatterboxReferenceFiles([]);
        setChatterboxVoicesError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!signal?.aborted) setChatterboxVoicesLoading(false);
      }
    },
    [sessionId, supabase],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const chatterboxListDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatterboxListAbortRef = useRef<AbortController | null>(null);

  /** Debounced: typing the base URL was firing one Chatterbox scan per keystroke (blocking /tts). */
  useEffect(() => {
    if (!open || draft.provider !== 'chatterbox') return;
    const base = draft.localBaseUrl?.trim();
    if (!base) {
      setChatterboxVoices([]);
      setChatterboxReferenceFiles([]);
      return;
    }

    if (chatterboxListDebounceRef.current) clearTimeout(chatterboxListDebounceRef.current);
    chatterboxListAbortRef.current?.abort();

    chatterboxListDebounceRef.current = setTimeout(() => {
      chatterboxListDebounceRef.current = null;
      const ac = new AbortController();
      chatterboxListAbortRef.current = ac;
      void loadChatterboxVoices(base, ac.signal);
    }, 450);

    return () => {
      if (chatterboxListDebounceRef.current) clearTimeout(chatterboxListDebounceRef.current);
      chatterboxListAbortRef.current?.abort();
    };
  }, [open, draft.provider, draft.localBaseUrl, loadChatterboxVoices]);

  if (!open) return null;

  const save = async () => {
    const merged = mergeNarrationTtsClientConfig(draft);
    const r = await persistSessionNarrationTts(supabase, sessionId, merged);
    if (r.error && typeof console !== 'undefined') {
      console.warn('[session] narration TTS persist failed', r.error);
    }
    onClose();
  };

  const inputCls =
    'w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600';
  const labelCls = 'block text-[9px] uppercase tracking-wide text-zinc-500 mb-0.5';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70" role="dialog">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div
        className="relative w-full max-w-lg max-h-[min(90vh,720px)] overflow-y-auto rounded-lg border border-zinc-600 bg-zinc-900 shadow-xl p-4 space-y-3 text-xs text-zinc-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-zinc-700 pb-2">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Narration TTS</h3>
            <p className="text-[10px] text-zinc-500 mt-0.5 leading-snug">
              Saved on the <strong className="text-zinc-400 font-normal">session</strong> for everyone: one server
              synthesis per line, then the same signed audio URL is broadcast so all clients start together when they
              receive it. The Next.js host must reach your local TTS URL (e.g.{' '}
              <code className="text-zinc-400">127.0.0.1</code> when running <code className="text-zinc-400">npm run dev</code>
              ). Voice input still uses Deepgram STT on the server.
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 text-zinc-500 hover:text-zinc-200 text-lg leading-none px-1"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            className="accent-violet-600 scale-90"
            checked={ttsEnabled}
            onChange={(e) => {
              const on = e.target.checked;
              void persistSessionTtsEnabled(supabase, sessionId, { ttsEnabled: on }).then((r) => {
                if (r.error && typeof console !== 'undefined') {
                  console.warn('[session] TTS setting persist failed', r.error);
                }
              });
            }}
          />
          <span className="text-[10px] uppercase tracking-wide text-zinc-400">Auto TTS while AI-GM streams</span>
        </label>

        <div>
          <span className={labelCls}>Engine</span>
          <select
            className={inputCls}
            value={draft.provider}
            onChange={(e) =>
              setDraft((d) => ({ ...d, provider: e.target.value as NarrationTtsProviderId }))
            }
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {draft.provider === 'cartesia' && (
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-cyan-600 scale-90"
              checked={draft.useCartesiaCloud !== false}
              onChange={(e) => setDraft((d) => ({ ...d, useCartesiaCloud: e.target.checked }))}
            />
            <span className="text-[10px] uppercase tracking-wide text-zinc-400">
              Use Cartesia cloud (requires CARTESIA_API_KEY on the server)
            </span>
          </label>
        )}

        {(draft.provider === 'chatterbox' || draft.provider === 'kokoro') && (
          <div>
            <span className={labelCls}>Local server base URL</span>
            <input
              className={inputCls}
              placeholder="http://127.0.0.1:8004"
              value={draft.localBaseUrl ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, localBaseUrl: e.target.value }))}
            />
          </div>
        )}

        {draft.provider === 'chatterbox' && (
          <div className="space-y-2 border border-zinc-700/80 rounded p-2 bg-zinc-950/40">
            <p className="text-[10px] text-zinc-500">
              Chatterbox: <code className="text-zinc-400">/tts</code> or OpenAI-compatible{' '}
              <code className="text-zinc-400">/v1/audio/speech</code>.
            </p>
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-cyan-600 scale-90"
                checked={draft.chatterbox?.useOpenAiEndpoint === true}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    chatterbox: { ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.chatterbox, ...d.chatterbox, useOpenAiEndpoint: e.target.checked },
                  }))
                }
              />
              <span className="text-[10px] uppercase tracking-wide text-zinc-400">Use OpenAI endpoint</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className={labelCls}>Voice mode</span>
                <select
                  className={inputCls}
                  value={draft.chatterbox?.voiceMode ?? 'predefined'}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      chatterbox: {
                        ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.chatterbox,
                        ...d.chatterbox,
                        voiceMode: e.target.value as 'predefined' | 'clone',
                      },
                    }))
                  }
                >
                  <option value="predefined">Predefined</option>
                  <option value="clone">Clone</option>
                </select>
              </div>
              <div>
                <span className={labelCls}>Output</span>
                <select
                  className={inputCls}
                  value={draft.chatterbox?.outputFormat ?? 'wav'}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      chatterbox: {
                        ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.chatterbox,
                        ...d.chatterbox,
                        outputFormat: e.target.value as 'wav' | 'opus',
                      },
                    }))
                  }
                >
                  <option value="wav">wav</option>
                  <option value="opus">opus</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[12rem]">
                <span className={labelCls}>Predefined voice (pick or type)</span>
                <input
                  className={inputCls}
                  list="cp2020-chatterbox-predefined-voices"
                  placeholder="Load voices, then pick or type filename.wav"
                  value={draft.chatterbox?.predefinedVoiceId ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      chatterbox: {
                        ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.chatterbox,
                        ...d.chatterbox,
                        predefinedVoiceId: e.target.value,
                      },
                    }))
                  }
                />
                <datalist id="cp2020-chatterbox-predefined-voices">
                  {chatterboxVoices.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </div>
              <button
                type="button"
                disabled={chatterboxVoicesLoading || !draft.localBaseUrl?.trim()}
                className="shrink-0 rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-400 hover:bg-zinc-800 disabled:opacity-40"
                onClick={() => void loadChatterboxVoices(draft.localBaseUrl?.trim() ?? '')}
              >
                {chatterboxVoicesLoading ? 'Loading…' : 'Refresh voices'}
              </button>
            </div>
            {chatterboxVoicesError && (
              <p className="text-[10px] text-amber-500/90">{chatterboxVoicesError}</p>
            )}
            <div>
              <span className={labelCls}>OpenAI endpoint voice</span>
              <input
                className={inputCls}
                list="cp2020-chatterbox-openai-voices"
                placeholder="S1, S2, dialogue, or a filename from voices"
                value={draft.chatterbox?.openAiVoice ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    chatterbox: {
                      ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.chatterbox,
                      ...d.chatterbox,
                      openAiVoice: e.target.value,
                    },
                  }))
                }
              />
              <datalist id="cp2020-chatterbox-openai-voices">
                <option value="S1" />
                <option value="S2" />
                <option value="dialogue" />
                {chatterboxVoices.map((v) => (
                  <option key={`oa-${v}`} value={v} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[12rem]">
                <span className={labelCls}>Reference audio (clone mode)</span>
                <input
                  className={inputCls}
                  list="cp2020-chatterbox-reference-audio"
                  placeholder="Pick from reference_audio/ or type filename"
                  value={draft.chatterbox?.referenceAudioFilename ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      chatterbox: {
                        ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.chatterbox,
                        ...d.chatterbox,
                        referenceAudioFilename: e.target.value,
                      },
                    }))
                  }
                />
                <datalist id="cp2020-chatterbox-reference-audio">
                  {chatterboxReferenceFiles.map((v) => (
                    <option key={`ref-${v}`} value={v} />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <span className={labelCls}>Speed</span>
                <input
                  type="number"
                  step="0.05"
                  min={0.5}
                  max={2}
                  className={inputCls}
                  value={draft.chatterbox?.speed ?? 1}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      chatterbox: {
                        ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.chatterbox,
                        ...d.chatterbox,
                        speed: parseFloat(e.target.value) || 1,
                      },
                    }))
                  }
                />
              </div>
              <div>
                <span className={labelCls}>Temperature</span>
                <input
                  type="number"
                  step="0.05"
                  min={0}
                  max={2}
                  className={inputCls}
                  title="Chatterbox generation temperature (/tts and OpenAI endpoint if supported)"
                  placeholder="0–2"
                  value={
                    typeof draft.chatterbox?.temperature === 'number'
                      ? draft.chatterbox.temperature
                      : ''
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraft((d) => ({
                      ...d,
                      chatterbox: {
                        ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.chatterbox,
                        ...d.chatterbox,
                        temperature:
                          v === ''
                            ? undefined
                            : Math.min(2, Math.max(0, parseFloat(v) || 0)),
                      },
                    }));
                  }}
                />
              </div>
              <div>
                <span className={labelCls}>Seed (optional)</span>
                <input
                  type="number"
                  className={inputCls}
                  placeholder="random"
                  value={draft.chatterbox?.seed ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraft((d) => ({
                      ...d,
                      chatterbox: {
                        ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.chatterbox,
                        ...d.chatterbox,
                        seed: v === '' ? undefined : parseInt(v, 10),
                      },
                    }));
                  }}
                />
              </div>
            </div>

            <div className="space-y-2 border border-violet-900/40 rounded p-2 bg-violet-950/20">
              <div>
                <span className={labelCls}>How this list is used</span>
                <select
                  className={inputCls}
                  value={draft.chatterboxNpcVoiceMode ?? 'byName'}
                  onChange={(e) => {
                    const m = e.target.value as ChatterboxNpcVoiceMode;
                    setDraft((d) => ({ ...d, chatterboxNpcVoiceMode: m }));
                  }}
                >
                  <option value="byName">Match by name (per-row match key)</option>
                  <option value="byListOrder">List order only — 1st NPC in the message = row 1, 2nd = row 2, then repeat</option>
                </select>
              </div>
              {draft.chatterboxNpcVoiceMode === 'byListOrder' ? (
                <p className="text-[10px] text-zinc-500 leading-snug">
                  <span className="text-zinc-400">List order</span> — you only pick voices top-to-bottom. The{' '}
                  <strong>first</strong> distinct <code className="text-zinc-400">Whoever:</code> or{' '}
                  <code className="text-zinc-400">**Name**:</code> line uses row 1, the <strong>second</strong> new
                  character uses row 2, and so on (wraps to row 1 if you run out). The actual names the AI invents
                  do not matter. Single-NPC lines (chat speaker not &quot;Game Master&quot;) use row 1. Continuation
                  lines stay on the last voice. Multi-voice output is WAV. Streamed GM TTS still uses the default
                  engine voice until the turn is saved. Names are remembered for the whole session (stored on the
                  room) so the same label keeps the same row in later messages — unless you clear it below.
                </p>
              ) : (
                <p className="text-[10px] text-zinc-500 leading-snug">
                  <span className="text-zinc-400">Name match</span> — set a <strong>match key</strong> per row. Lines like{' '}
                  <code className="text-zinc-400">Name:</code> or <code className="text-zinc-400">**Name**:</code> pick the
                  row whose key matches; 3+ characters for broad matching. Single-NPC messages can match the chat{' '}
                  <strong>speaker</strong> if it is not &quot;Game Master&quot;.                   Multi-voice output is WAV.
                </p>
              )}
              {draft.provider === 'chatterbox' && draft.chatterboxNpcVoiceMode === 'byListOrder' && (
                <button
                  type="button"
                  className="text-[10px] rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-zinc-500 hover:text-amber-200 hover:border-amber-900/50"
                  onClick={async () => {
                    const prev = useGameStore.getState().session.settings;
                    const merged = { ...prev, chatterboxNpcVoiceMemory: {} };
                    const { error } = await supabase.from('sessions').update({ settings: merged }).eq('id', sessionId);
                    if (error && typeof console !== 'undefined') {
                      console.warn('[session] clear NPC voice memory failed', error);
                    }
                    useGameStore.getState().updateSessionSettings({ chatterboxNpcVoiceMemory: {} });
                  }}
                >
                  Clear remembered NPC → row map
                </button>
              )}
              <button
                type="button"
                className="text-[10px] uppercase tracking-wide text-violet-400/90 hover:text-violet-200"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    chatterboxNpcVoices: [
                      ...(d.chatterboxNpcVoices ?? []),
                      {
                        label: d.chatterboxNpcVoiceMode === 'byName' ? 'Bartender' : undefined,
                        voiceMode: (d.chatterbox?.voiceMode as 'predefined' | 'clone' | undefined) ?? 'predefined',
                        predefinedVoiceId: d.chatterbox?.predefinedVoiceId?.trim() || '',
                      } satisfies ChatterboxNpcVoiceRule,
                    ],
                  }))
                }
              >
                + Add voice
              </button>
              {(draft.chatterboxNpcVoices ?? []).map((row, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end border-b border-zinc-800/60 pb-2 last:border-0"
                >
                  {draft.chatterboxNpcVoiceMode === 'byListOrder' && (
                    <div className="sm:col-span-1 min-w-0">
                      <span className={labelCls}>#</span>
                      <div className="px-1 py-1.5 text-[11px] text-violet-300 tabular-nums text-center">
                        {i + 1}
                      </div>
                    </div>
                  )}
                  {draft.chatterboxNpcVoiceMode === 'byName' && (
                    <div className="sm:col-span-3">
                      <span className={labelCls}>Name (match key)</span>
                      <input
                        className={inputCls}
                        placeholder="bartender, fixer, …"
                        value={row.label ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraft((d) => {
                            const list = [...(d.chatterboxNpcVoices ?? [])];
                            list[i] = { ...list[i]!, label: v };
                            return { ...d, chatterboxNpcVoices: list };
                          });
                        }}
                      />
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <span className={labelCls}>Mode</span>
                    <select
                      className={inputCls}
                      value={row.voiceMode ?? 'predefined'}
                      onChange={(e) => {
                        const v = e.target.value as 'predefined' | 'clone';
                        setDraft((d) => {
                          const list = [...(d.chatterboxNpcVoices ?? [])];
                          list[i] = { ...list[i]!, voiceMode: v };
                          return { ...d, chatterboxNpcVoices: list };
                        });
                      }}
                    >
                      <option value="predefined">Predefined</option>
                      <option value="clone">Clone (reference)</option>
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <span className={labelCls}>Predefined voice</span>
                    <input
                      className={inputCls}
                      list="cp2020-chatterbox-predefined-voices"
                      disabled={(row.voiceMode ?? 'predefined') === 'clone'}
                      placeholder="filename.wav, S1, …"
                      value={row.predefinedVoiceId ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraft((d) => {
                          const list = [...(d.chatterboxNpcVoices ?? [])];
                          list[i] = { ...list[i]!, predefinedVoiceId: v };
                          return { ...d, chatterboxNpcVoices: list };
                        });
                      }}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <span className={labelCls}>Reference (clone)</span>
                    <input
                      className={inputCls}
                      list="cp2020-chatterbox-reference-audio"
                      disabled={(row.voiceMode ?? 'predefined') !== 'clone'}
                      value={row.referenceAudioFilename ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraft((d) => {
                          const list = [...(d.chatterboxNpcVoices ?? [])];
                          list[i] = { ...list[i]!, referenceAudioFilename: v };
                          return { ...d, chatterboxNpcVoices: list };
                        });
                      }}
                    />
                  </div>
                  <div className="sm:col-span-1 flex flex-col gap-1">
                    <span className={labelCls}>OAI /tts</span>
                    <label className="inline-flex items-center gap-1.5 text-[10px] text-zinc-400">
                      <input
                        type="checkbox"
                        className="accent-violet-600 scale-90"
                        checked={row.useOpenAiEndpoint === true}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setDraft((d) => {
                            const list = [...(d.chatterboxNpcVoices ?? [])];
                            list[i] = { ...list[i]!, useOpenAiEndpoint: on ? true : false };
                            return { ...d, chatterboxNpcVoices: list };
                          });
                        }}
                      />
                      OpenAI
                    </label>
                  </div>
                  <div className="sm:col-span-3">
                    <span className={labelCls}>OpenAI voice</span>
                    <input
                      className={inputCls}
                      list="cp2020-chatterbox-openai-voices"
                      disabled={row.useOpenAiEndpoint !== true}
                      placeholder="S1, dialogue, …"
                      value={row.openAiVoice ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraft((d) => {
                          const list = [...(d.chatterboxNpcVoices ?? [])];
                          list[i] = { ...list[i]!, openAiVoice: v };
                          return { ...d, chatterboxNpcVoices: list };
                        });
                      }}
                    />
                  </div>
                  <div className="sm:col-span-1 flex items-end">
                    <button
                      type="button"
                      className="w-full rounded border border-zinc-600 bg-zinc-950 px-1 py-1 text-[10px] text-zinc-500 hover:text-rose-300 hover:border-rose-800"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          chatterboxNpcVoices: (d.chatterboxNpcVoices ?? []).filter((_, j) => j !== i),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {draft.provider === 'kokoro' && (
          <div className="space-y-2 border border-zinc-700/80 rounded p-2 bg-zinc-950/40">
            <p className="text-[10px] text-zinc-500">
              Kokoro OpenAI-compatible <code className="text-zinc-400">POST /v1/audio/speech</code>.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className={labelCls}>Voice</span>
                <input
                  className={inputCls}
                  value={draft.kokoro?.voice ?? 'af_heart'}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      kokoro: { ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.kokoro, ...d.kokoro, voice: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <span className={labelCls}>Model</span>
                <input
                  className={inputCls}
                  value={draft.kokoro?.model ?? 'kokoro'}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      kokoro: { ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.kokoro, ...d.kokoro, model: e.target.value },
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className={labelCls}>Format</span>
                <select
                  className={inputCls}
                  value={draft.kokoro?.responseFormat ?? 'mp3'}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      kokoro: {
                        ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.kokoro,
                        ...d.kokoro,
                        responseFormat: e.target.value as 'mp3' | 'wav',
                      },
                    }))
                  }
                >
                  <option value="mp3">mp3</option>
                  <option value="wav">wav</option>
                </select>
              </div>
              <div>
                <span className={labelCls}>Speed</span>
                <input
                  type="number"
                  step="0.05"
                  min={0.25}
                  max={4}
                  className={inputCls}
                  value={draft.kokoro?.speed ?? 1}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      kokoro: {
                        ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.kokoro,
                        ...d.kokoro,
                        speed: parseFloat(e.target.value) || 1,
                      },
                    }))
                  }
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-700">
          <button
            type="button"
            className="px-3 py-1.5 rounded border border-zinc-600 text-zinc-400 hover:bg-zinc-800 text-[11px] uppercase tracking-wide"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-3 py-1.5 rounded bg-cyan-900 hover:bg-cyan-800 border border-cyan-700 text-[11px] uppercase tracking-wide text-cyan-100"
            onClick={save}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
