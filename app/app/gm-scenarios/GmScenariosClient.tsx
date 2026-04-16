'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  getDevSessionId,
  getDevSpeakerName,
  isValidSessionUuid,
  setDevSessionId,
  setDevSpeakerName,
} from '@/lib/dev/dev-session-storage';

export interface Scenario {
  id: string;
  title: string;
  summary: string;
  features: string[];
  playerMessage: string;
  expect: string;
}

export const GM_SCENARIOS: Scenario[] = [
  {
    id: 'combat-resolve',
    title: 'Resolve gunfire',
    summary: 'Player describes an attack after a hit is assumed or narrated.',
    features: ['Tool: apply_damage', 'Lore: FNFF / armor (keyword match)'],
    playerMessage:
      'That hit his torso — raw 12 damage, not AP. Apply it to the ganger I was shooting at (use his character sheet).',
    expect:
      'The model may call apply_damage with location Torso. Lore injection often includes fnff-damage when your text mentions combat, damage, or shooting.',
  },
  {
    id: 'skill-roll',
    title: 'Ask for a contested roll',
    summary: 'Classic CP2020: Ref + skill + 1d10 vs DV — surfaced to the table, not rolled server-side.',
    features: ['Tool: request_roll', 'Chat: system + roll_request metadata'],
    playerMessage:
      'I want to sneak past the guard — Ref + Stealth + 1d10 vs DV 15. Tell me what to roll in the dice roller.',
    expect:
      'Often produces request_roll with a formula string. Check chat_messages type system and metadata.kind roll_request.',
  },
  {
    id: 'money',
    title: 'Pay the fixer',
    summary: 'State change on eurobucks.',
    features: ['Tool: deduct_money', 'Lore: economy (keyword match)'],
    playerMessage: 'I hand Ripper 500 eb for the intel. Deduct it from my sheet.',
    expect: 'May call deduct_money. Keywords like money, pay, or eurobuck can pull economy-eurobucks lore into context.',
  },
  {
    id: 'map-move',
    title: 'Move on the map',
    summary: 'Token position as percentage coordinates.',
    features: ['Tool: move_token'],
    playerMessage:
      'I sprint to cover behind the crate — move my token to about 30% from the left edge and 55% from the top.',
    expect: 'May call move_token with x/y 0–100. Requires a valid token id from your session.',
  },
  {
    id: 'scene',
    title: 'GM sets the scene',
    summary: 'Updates session active_scene JSON in the database.',
    features: ['Tool: generate_scenery'],
    playerMessage:
      'The rain picks up; neon reflects in the puddles. Set the situation to a tense standoff outside the club.',
    expect: 'May call generate_scenery to merge description / situation / location into sessions.active_scene.',
  },
  {
    id: 'lookup-rules',
    title: 'Rules lookup',
    summary: 'On-demand lore search (same static rule set as automatic injection).',
    features: ['Tool: lookup_rules'],
    playerMessage:
      'Before I roll, refresh me: how does armor SP and BTM interact with damage in Friday Night Firefight?',
    expect:
      'Check toolResults for lookup_rules — if empty, the model answered from memory only. Prompts now require calling lookup_rules for rules questions; re-run to verify.',
  },
  {
    id: 'inventory',
    title: 'Gear change',
    summary: 'Inventory mutations.',
    features: ['Tools: add_item, remove_item'],
    playerMessage: 'I loot the compact SMG and 2 mags. Add them to my inventory and drop my old knife.',
    expect: 'May call add_item / remove_item with structured item fields. IDs can be server-generated for new items.',
  },
  {
    id: 'net',
    title: 'Netrun vibe',
    summary: 'Lore injection for Interface / ICE without full net combat UI.',
    features: ['Lore: netrunning-basic'],
    playerMessage: 'I jack in and probe the subnet for the security daemon — Interface check, what do I see?',
    expect: 'Keywords like net, deck, or ice can inject netrunning-basic into LORE_RULES for this turn.',
  },
];

type ApiToolResult = { ok: true; name: string; result: unknown } | { ok: false; name: string; error: string };

interface ApiResponse {
  narration?: string;
  model?: string;
  toolResults?: ApiToolResult[];
  toolErrors?: { tool: string; error: string }[];
  error?: string;
}

export function GmScenariosClient() {
  const searchParams = useSearchParams();
  const [sessionId, setSessionId] = useState('');
  const [speakerName, setSpeakerName] = useState('Player');
  const [selectedId, setSelectedId] = useState(GM_SCENARIOS[0].id);
  const [loading, setLoading] = useState(false);
  const [lastJson, setLastJson] = useState<ApiResponse | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    const q = searchParams.get('session')?.trim() ?? '';
    if (q && isValidSessionUuid(q)) {
      setSessionId(q);
      setDevSessionId(q);
    } else {
      const s = getDevSessionId();
      if (s) setSessionId(s);
    }
    const sp = getDevSpeakerName();
    if (sp) setSpeakerName(sp);
  }, [searchParams]);

  useEffect(() => {
    if (sessionId.trim() && isValidSessionUuid(sessionId)) {
      setDevSessionId(sessionId);
    }
  }, [sessionId]);

  useEffect(() => {
    setDevSpeakerName(speakerName);
  }, [speakerName]);

  const selected = useMemo(
    () => GM_SCENARIOS.find((s) => s.id === selectedId) ?? GM_SCENARIOS[0],
    [selectedId],
  );

  const sendScenario = useCallback(async () => {
    setClientError(null);
    setLastJson(null);
    const sid = sessionId.trim();
    if (!sid) {
      setClientError('Paste a session UUID from Supabase or from your /session/… URL.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/gm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sid,
          playerMessage: selected.playerMessage,
          speakerName: speakerName.trim() || 'Player',
          loreTokenBudget: 2000,
        }),
      });
      const data = (await res.json()) as ApiResponse;
      if (!res.ok) {
        setClientError(data.error ?? `HTTP ${res.status}`);
        setLastJson(data);
        return;
      }
      setLastJson(data);
    } catch (e) {
      setClientError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId, selected.playerMessage, speakerName]);

  const copyMessage = useCallback(() => {
    void navigator.clipboard.writeText(selected.playerMessage);
  }, [selected.playerMessage]);

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      <header className="space-y-2 border-b border-cyan-900/50 pb-6">
        <p className="text-cyan-400 text-sm uppercase tracking-[0.2em]">AI-GM lab</p>
        <h1 className="text-3xl md:text-4xl font-bold text-white uppercase tracking-tight">
          Example scenarios
        </h1>
        <p className="text-gray-400 text-sm leading-relaxed max-w-2xl">
          Session id is remembered in this browser (same as{' '}
          <Link href="/dev" className="text-cyan-500 hover:text-cyan-400 underline">
            Dev hub
          </Link>
          ). Use <code className="text-cyan-300/90">?session=…</code> in the URL or set it below — refresh keeps it.
          Pick a scenario and send; tool usage is model-dependent.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-2 md:col-span-2">
          <span className="text-xs uppercase tracking-wider text-gray-500">Session ID (UUID)</span>
          <input
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="e.g. from /session/xxxxxxxx-xxxx-…"
            className="w-full bg-black/60 border border-gray-700 text-gray-100 px-3 py-2 font-mono text-sm rounded-sm focus:border-cyan-500 focus:outline-none"
          />
        </label>
        <label className="block space-y-2">
          <span className="text-xs uppercase tracking-wider text-gray-500">Speaker name</span>
          <input
            value={speakerName}
            onChange={(e) => setSpeakerName(e.target.value)}
            className="w-full bg-black/60 border border-gray-700 text-gray-100 px-3 py-2 text-sm rounded-sm focus:border-cyan-500 focus:outline-none"
          />
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-[0.15em] text-yellow-500/90">Pick a scenario</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {GM_SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={`text-left border p-4 rounded-sm transition-colors ${
                selectedId === s.id
                  ? 'border-cyan-500 bg-cyan-950/30'
                  : 'border-gray-800 bg-black/40 hover:border-gray-600'
              }`}
            >
              <p className="font-bold text-white text-sm">{s.title}</p>
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.summary}</p>
            </button>
          ))}
        </div>
      </section>

      {selected && (
        <article className="border border-gray-800 rounded-sm p-6 space-y-4 bg-black/30">
          <div className="flex flex-wrap gap-2">
            {selected.features.map((f) => (
              <span
                key={f}
                className="text-[10px] uppercase tracking-wide px-2 py-1 bg-gray-900 text-cyan-300/90 border border-gray-700"
              >
                {f}
              </span>
            ))}
          </div>
          <p className="text-gray-300 text-sm">{selected.summary}</p>
          <div>
            <p className="text-xs text-gray-500 uppercase mb-1">Example player message</p>
            <pre className="text-sm text-gray-200 whitespace-pre-wrap font-mono bg-black/50 border border-gray-800 p-3 rounded-sm">
              {selected.playerMessage}
            </pre>
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                type="button"
                onClick={copyMessage}
                className="text-xs px-3 py-1.5 border border-gray-600 text-gray-300 hover:bg-gray-900"
              >
                Copy message
              </button>
              <button
                type="button"
                onClick={sendScenario}
                disabled={loading}
                className="text-xs px-4 py-1.5 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white font-bold uppercase tracking-wide"
              >
                {loading ? 'Calling GM…' : 'Send to /api/gm'}
              </button>
            </div>
          </div>
          <div className="text-xs text-gray-500 space-y-1 border-t border-gray-800 pt-4">
            <p className="text-gray-400">
              <span className="text-yellow-600/90">What to expect:</span> {selected.expect}
            </p>
          </div>
        </article>
      )}

      {(clientError || lastJson?.error) && (
        <div className="border border-red-900/60 bg-red-950/20 p-4 text-sm text-red-300">
          {clientError ?? lastJson?.error}
        </div>
      )}

      {lastJson && !lastJson.error && (
        <div className="border border-gray-800 rounded-sm p-6 space-y-4 bg-black/40">
          <h3 className="text-sm uppercase tracking-wider text-cyan-500/90">Last response</h3>
          {lastJson.model && (
            <p className="text-xs text-gray-500">
              Model: <span className="text-gray-300 font-mono">{lastJson.model}</span>
            </p>
          )}
          {lastJson.narration != null && lastJson.narration !== '' && (
            <div>
              <p className="text-xs text-gray-500 uppercase mb-1">Narration</p>
              <p className="text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">{lastJson.narration}</p>
            </div>
          )}
          {lastJson.toolResults && lastJson.toolResults.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase mb-2">Tool results</p>
              <ul className="space-y-2 font-mono text-xs">
                {lastJson.toolResults.map((t, i) => (
                  <li key={i} className="border border-gray-800 p-2 rounded-sm bg-black/50">
                    {t.ok ? (
                      <>
                        <span className="text-green-500/90">ok</span>{' '}
                        <span className="text-cyan-400">{t.name}</span>
                        <pre className="mt-1 text-gray-400 overflow-x-auto">
                          {JSON.stringify(t.result, null, 2)}
                        </pre>
                      </>
                    ) : (
                      <>
                        <span className="text-red-400">fail</span> <span className="text-cyan-400">{t.name}</span>
                        <p className="text-red-300/90 mt-1">{t.error}</p>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {lastJson.toolErrors && lastJson.toolErrors.length > 0 && (
            <div>
              <p className="text-xs text-amber-600/90 uppercase mb-1">Tool errors (logged server-side too)</p>
              <ul className="text-xs text-amber-200/80 space-y-1">
                {lastJson.toolErrors.map((e, i) => (
                  <li key={i}>
                    {e.tool}: {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer text-gray-500 hover:text-gray-400">Raw JSON</summary>
            <pre className="mt-2 p-3 bg-black/60 border border-gray-800 overflow-x-auto text-gray-500">
              {JSON.stringify(lastJson, null, 2)}
            </pre>
          </details>
        </div>
      )}

      <footer className="text-xs text-gray-600 space-y-2 pb-8">
        <p>
          Requires <code className="text-gray-400">CP2020_OPENROUTER_API_KEY</code> (or legacy{' '}
          <code className="text-gray-400">OPENROUTER_API_KEY</code>) and{' '}
          <code className="text-gray-400">SUPABASE_SERVICE_ROLE_KEY</code> in{' '}
          <code className="text-gray-400">.env.local</code>. Characters and tokens must exist in that session for
          character- or map-based tools to succeed.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link href="/dev" className="text-cyan-600 hover:text-cyan-400">
            ← Dev hub
          </Link>
          <Link href="/" className="text-zinc-500 hover:text-zinc-400">
            Home
          </Link>
        </div>
      </footer>
    </div>
  );
}
