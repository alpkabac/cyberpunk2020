'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useShallow } from 'zustand/react/shallow';
import { getAccessTokenForApi } from '@/lib/auth/client-access-token';
import { persistSessionTtsEnabled } from '@/lib/session/persist-session-tts-enabled';
import { persistSessionNarrationTts } from '@/lib/session/persist-session-narration-tts';
import { CHATTERBOX_TTS_LANGUAGES } from '@/lib/narration/chatterbox-tts-languages';
import {
  DEFAULT_NARRATION_TTS_CLIENT_CONFIG,
  mergeNarrationTtsClientConfig,
  type NarrationTtsClientConfig,
  type NarrationTtsProviderId,
} from '@/lib/narration/narration-tts-client-config';
import { useGameStore } from '@/lib/store/game-store';

const PROVIDERS: { id: NarrationTtsProviderId; label: string }[] = [
  { id: 'cartesia', label: 'Cartesia (cloud)' },
  { id: 'chatterbox', label: 'Chatterbox (local server)' },
  { id: 'kokoro', label: 'Kokoro (local server)' },
  { id: 'omnivoice', label: 'OmniVoice (omnivoice-server)' },
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

  const [omnivoiceVoiceIds, setOmnivoiceVoiceIds] = useState<string[]>([]);
  const [omnivoiceVoicesLoading, setOmnivoiceVoicesLoading] = useState(false);
  const [omnivoiceVoicesError, setOmnivoiceVoicesError] = useState<string | null>(null);

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

  const loadOmnivoiceVoices = useCallback(
    async (baseUrl: string, signal?: AbortSignal) => {
      const base = baseUrl.trim();
      if (!base) {
        setOmnivoiceVoicesError('Set local server base URL first.');
        return;
      }
      setOmnivoiceVoicesLoading(true);
      setOmnivoiceVoicesError(null);
      try {
        const token = await getAccessTokenForApi(supabase);
        if (!token) {
          setOmnivoiceVoicesError('Not signed in');
          return;
        }
        const q = new URLSearchParams({ sessionId, baseUrl: base });
        const res = await fetch(`/api/session/narration-tts/omnivoice-voices?${q}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        });
        const data = (await res.json().catch(() => ({}))) as {
          voices?: unknown;
          error?: string;
          detail?: string;
        };
        if (!res.ok) {
          setOmnivoiceVoiceIds([]);
          setOmnivoiceVoicesError(data.detail ?? data.error ?? res.statusText ?? 'Failed to load voices');
          return;
        }
        const raw = data.voices;
        const ids: string[] = [];
        if (Array.isArray(raw)) {
          for (const v of raw) {
            if (v && typeof v === 'object' && 'id' in v && typeof (v as { id: unknown }).id === 'string') {
              ids.push((v as { id: string }).id);
            }
          }
        }
        ids.sort((a, b) => a.localeCompare(b));
        setOmnivoiceVoiceIds(ids);
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        if (e instanceof Error && e.name === 'AbortError') return;
        setOmnivoiceVoiceIds([]);
        setOmnivoiceVoicesError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!signal?.aborted) setOmnivoiceVoicesLoading(false);
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

  useEffect(() => {
    if (!open) return;
    setDraft(mergeNarrationTtsClientConfig(useGameStore.getState().session.settings.narrationTts));
  }, [open]);

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

  const omnivoiceListDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const omnivoiceListAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open || draft.provider !== 'omnivoice') return;
    const b = draft.localBaseUrl?.trim();
    if (!b) {
      setOmnivoiceVoiceIds([]);
      return;
    }
    if (omnivoiceListDebounceRef.current) clearTimeout(omnivoiceListDebounceRef.current);
    omnivoiceListAbortRef.current?.abort();
    omnivoiceListDebounceRef.current = setTimeout(() => {
      omnivoiceListDebounceRef.current = null;
      const ac = new AbortController();
      omnivoiceListAbortRef.current = ac;
      void loadOmnivoiceVoices(b, ac.signal);
    }, 450);
    return () => {
      if (omnivoiceListDebounceRef.current) clearTimeout(omnivoiceListDebounceRef.current);
      omnivoiceListAbortRef.current?.abort();
    };
  }, [open, draft.provider, draft.localBaseUrl, loadOmnivoiceVoices]);

  if (!open) return null;

  const isHostedApp =
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1';
  const localTtsBase = draft.localBaseUrl?.toLowerCase() ?? '';
  const ttsBaseLooksLocal =
    localTtsBase.includes('127.0.0.1') ||
    localTtsBase.includes('localhost') ||
    localTtsBase.startsWith('http://0.0.0.0');

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

        {(draft.provider === 'chatterbox' || draft.provider === 'kokoro' || draft.provider === 'omnivoice') && (
          <div>
            <span className={labelCls}>Local server base URL</span>
            <input
              className={inputCls}
              placeholder={draft.provider === 'omnivoice' ? 'http://127.0.0.1:8880' : 'http://127.0.0.1:8004'}
              value={draft.localBaseUrl ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, localBaseUrl: e.target.value }))}
            />
            {isHostedApp && ttsBaseLooksLocal && (
              <p className="text-[10px] text-amber-600/90 mt-1 leading-snug">
                This app runs on a remote host, but that URL points at <em>the server&apos;s</em> loopback, not your PC. For
                hosted games, the TTS box must be reachable at a public or VPN URL (tunnel, static IP, etc.); otherwise
                synthesis will time out or return 502/504.
              </p>
            )}
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
            {!draft.chatterbox?.useOpenAiEndpoint && (
              <div className="space-y-2 border border-zinc-700/50 rounded p-2 bg-zinc-950/20">
                <p className="text-[10px] text-zinc-500">
                  Custom <code className="text-zinc-400">/tts</code> — long text is split at sentence boundaries (Chatterbox
                  50–500 chars per chunk).
                </p>
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="accent-cyan-600 scale-90"
                    checked={draft.chatterbox?.splitText !== false}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        chatterbox: {
                          ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.chatterbox,
                          ...d.chatterbox,
                          splitText: e.target.checked,
                        },
                      }))
                    }
                  />
                  <span className="text-[10px] uppercase tracking-wide text-zinc-400">Split long text into chunks</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <span className={labelCls}>Chunk size (chars)</span>
                    <input
                      type="number"
                      min={50}
                      max={500}
                      step={10}
                      className={inputCls}
                      title="Chatterbox /tts: 50–500"
                      value={draft.chatterbox?.chunkSize ?? 120}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        setDraft((d) => ({
                          ...d,
                          chatterbox: {
                            ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.chatterbox,
                            ...d.chatterbox,
                            chunkSize: Number.isFinite(n) ? n : 120,
                          },
                        }));
                      }}
                    />
                  </div>
                  <div>
                    <span className={labelCls}>Language</span>
                    <select
                      className={inputCls}
                      value={draft.chatterbox?.language ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraft((d) => ({
                          ...d,
                          chatterbox: {
                            ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.chatterbox,
                            ...d.chatterbox,
                            language: v === '' ? undefined : v,
                          },
                        }));
                      }}
                    >
                      {CHATTERBOX_TTS_LANGUAGES.map((l) => (
                        <option key={l.code || '__default__'} value={l.code}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
            {draft.chatterbox?.useOpenAiEndpoint && (
              <p className="text-[10px] text-zinc-500">
                OpenAI-compatible route: this app does not send chunking or language; use the Chatterbox server UI or API
                for that path.
              </p>
            )}
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

        {draft.provider === 'omnivoice' && (
          <div className="space-y-2 border border-zinc-700/80 rounded p-2 bg-zinc-950/40">
            <p className="text-[10px] text-zinc-500">
              <a
                className="text-cyan-600/90 hover:underline"
                href="https://github.com/maemreyo/omnivoice-server"
                target="_blank"
                rel="noreferrer"
              >
                omnivoice-server
              </a>
              : <code className="text-zinc-400">POST /v1/audio/speech</code>. Clone profiles:{' '}
              <code className="text-zinc-400">clone:your_profile_id</code>. Put reference WAVs under the host&apos;s
              profile directory (set <code className="text-zinc-400">OMNIVOICE_PROFILE_DIR</code> on the machine that
              runs the TTS process).
            </p>
            <div>
              <span className={labelCls}>Bearer API key (optional)</span>
              <input
                className={inputCls}
                type="password"
                autoComplete="off"
                placeholder="If omnivoice-server is started with auth"
                value={draft.omnivoice?.apiKey ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    omnivoice: {
                      ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.omnivoice,
                      ...d.omnivoice,
                      apiKey: e.target.value || undefined,
                    },
                  }))
                }
              />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[12rem]">
                <span className={labelCls}>Voice (preset, design, or clone:…)</span>
                <input
                  className={inputCls}
                  list="cp2020-omnivoice-voices"
                  placeholder="alloy, design:…, or clone:my_profile"
                  value={draft.omnivoice?.voice ?? 'alloy'}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      omnivoice: {
                        ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.omnivoice,
                        ...d.omnivoice,
                        voice: e.target.value,
                      },
                    }))
                  }
                />
                <datalist id="cp2020-omnivoice-voices">
                  {omnivoiceVoiceIds.map((id) => (
                    <option key={id} value={id} />
                  ))}
                </datalist>
              </div>
              <button
                type="button"
                disabled={omnivoiceVoicesLoading || !draft.localBaseUrl?.trim()}
                className="shrink-0 rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-400 hover:bg-zinc-800 disabled:opacity-40"
                onClick={() => void loadOmnivoiceVoices(draft.localBaseUrl?.trim() ?? '')}
              >
                {omnivoiceVoicesLoading ? 'Loading…' : 'Refresh voices'}
              </button>
            </div>
            {omnivoiceVoicesError && <p className="text-[10px] text-amber-500/90">{omnivoiceVoicesError}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <span className={labelCls}>Language (pronunciation / multilingual)</span>
                <input
                  className={inputCls}
                  title="omnivoice-server: language for Turkish, English, etc."
                  placeholder="tr"
                  value={draft.omnivoice?.language ?? 'tr'}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      omnivoice: {
                        ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.omnivoice,
                        ...d.omnivoice,
                        language: e.target.value.trim() || 'tr',
                      },
                    }))
                  }
                />
              </div>
              <div>
                <span className={labelCls}>Model</span>
                <input
                  className={inputCls}
                  value={draft.omnivoice?.model ?? 'omnivoice'}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      omnivoice: {
                        ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.omnivoice,
                        ...d.omnivoice,
                        model: e.target.value,
                      },
                    }))
                  }
                />
              </div>
            </div>
            <div>
              <span className={labelCls}>Extra instructions (optional, overrides design)</span>
              <input
                className={inputCls}
                placeholder="e.g. female, american accent (when not using a clone profile)"
                value={draft.omnivoice?.instructions ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    omnivoice: {
                      ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.omnivoice,
                      ...d.omnivoice,
                      instructions: e.target.value || undefined,
                    },
                  }))
                }
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <span className={labelCls}>Speed</span>
                <input
                  type="number"
                  step="0.05"
                  min={0.25}
                  max={4}
                  className={inputCls}
                  value={draft.omnivoice?.speed ?? 1}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      omnivoice: {
                        ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.omnivoice,
                        ...d.omnivoice,
                        speed: parseFloat(e.target.value) || 1,
                      },
                    }))
                  }
                />
              </div>
              <div>
                <span className={labelCls}>Pos. temp. (0 = stable)</span>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={10}
                  className={inputCls}
                  title="Use 0 for consistent timbre (recommended for long lines)"
                  value={draft.omnivoice?.positionTemperature ?? 0}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      omnivoice: {
                        ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.omnivoice,
                        ...d.omnivoice,
                        positionTemperature: parseFloat(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
              <div>
                <span className={labelCls}>num_step</span>
                <input
                  type="number"
                  min={1}
                  max={64}
                  className={inputCls}
                  placeholder="default"
                  value={
                    typeof draft.omnivoice?.numStep === 'number' ? draft.omnivoice.numStep : ''
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraft((d) => ({
                      ...d,
                      omnivoice: {
                        ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.omnivoice,
                        ...d.omnivoice,
                        numStep: v === '' ? undefined : parseInt(v, 10) || undefined,
                      },
                    }));
                  }}
                />
              </div>
              <div>
                <span className={labelCls}>guidance_scale</span>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={10}
                  className={inputCls}
                  placeholder="default"
                  value={
                    typeof draft.omnivoice?.guidanceScale === 'number' ? draft.omnivoice.guidanceScale : ''
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraft((d) => ({
                      ...d,
                      omnivoice: {
                        ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.omnivoice,
                        ...d.omnivoice,
                        guidanceScale: v === '' ? undefined : parseFloat(v) || undefined,
                      },
                    }));
                  }}
                />
              </div>
            </div>
            <div>
              <span className={labelCls}>Output</span>
              <select
                className={inputCls}
                value={draft.omnivoice?.responseFormat ?? 'wav'}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    omnivoice: {
                      ...DEFAULT_NARRATION_TTS_CLIENT_CONFIG.omnivoice,
                      ...d.omnivoice,
                      responseFormat: e.target.value as 'wav' | 'pcm',
                    },
                  }))
                }
              >
                <option value="wav">wav</option>
                <option value="pcm">pcm (raw)</option>
              </select>
            </div>
            <p className="text-[10px] text-amber-600/80">
              Turkish: keep <code className="text-zinc-400">language=tr</code> (default here). A bare{' '}
              <code className="text-zinc-400">curl -d &quot;{'{'}&quot;…</code> in Windows CMD often breaks JSON and
              returns 422 — use a file body or PowerShell here-strings, or this app, which always sends valid JSON.
            </p>
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
