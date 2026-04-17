'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getAccessTokenForApi } from '@/lib/auth/client-access-token';
import {
  getDevSessionId,
  getDevSpeakerName,
  isValidSessionUuid,
  setDevSessionId,
  setDevSpeakerName,
} from '@/lib/dev/dev-session-storage';
import { supabase } from '@/lib/supabase';

export interface Scenario {
  id: string;
  title: string;
  summary: string;
  features: string[];
  playerMessage: string;
  expect: string;
}

export const GM_SCENARIOS: Scenario[] = [
  // ── Original tools ────────────────────────────────────────────────
  {
    id: 'combat-resolve',
    title: 'Resolve gunfire',
    summary: 'Player describes an attack after a hit is assumed or narrated.',
    features: ['Tool: apply_damage', 'Lore: FNFF / armor (keyword match)'],
    playerMessage:
      'That hit his torso — raw 12 damage, not AP. Apply it to the ganger I was shooting at (use his character sheet).',
    expect:
      'The model may call apply_damage with location Torso. Lore injection often includes damage-pipeline when your text mentions combat, damage, or shooting.',
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
    features: ['Lore: netrunning'],
    playerMessage: 'I jack in and probe the subnet for the security daemon — Interface check, what do I see?',
    expect: 'Keywords like net, deck, or ice can inject netrunning into LORE_RULES for this turn.',
  },
  // ── New tools ─────────────────────────────────────────────────────
  {
    id: 'add-money',
    title: 'Reward eurobucks',
    summary: 'Add money to a character — symmetric counterpart to deduct_money.',
    features: ['Tool: add_money'],
    playerMessage: 'The corp exec wires me 2000 eb for the completed job. Add it to my sheet.',
    expect:
      'Should call add_money with the amount. Check toolResults for the updated eurobucks balance. The character must exist in the session.',
  },
  {
    id: 'heal-damage',
    title: 'Medical attention',
    summary: 'Reduce damage points — first aid, medtech, or rest.',
    features: ['Tool: heal_damage'],
    playerMessage:
      'The medtech patches me up and says I should heal 8 points of damage. Apply the healing to my character.',
    expect:
      'Should call heal_damage with amount 8. Check the result for updated damage and woundState. Damage should not go below 0.',
  },
  {
    id: 'gm-roll',
    title: 'NPC dice roll (server-side)',
    summary: 'GM rolls dice for an NPC action — posts the result to chat so all players see it.',
    features: ['Tool: roll_dice', 'Chat: roll + gm_roll metadata'],
    playerMessage:
      'The boostergang leader takes a shot at me. Roll his attack — REF 7 + Handgun 5 + 1d10.',
    expect:
      'Should call roll_dice with a formula like 1d10 (the stat+skill bonus may be noted in reason). The result is inserted into chat_messages with type roll. Check toolResults for total, rolls array, and hadExplodingD10.',
  },
  {
    id: 'equip-item',
    title: 'Equip / unequip gear',
    summary: 'Toggle an item equipped flag — triggers armor SP recalc for hit locations.',
    features: ['Tool: equip_item'],
    playerMessage:
      'I take off my MetalGear vest before going into the club. Unequip my body armor.',
    expect:
      'Should call equip_item with equipped: false. The character must have an armor item in inventory. After unequipping, hit location SP should recalculate on all clients via Realtime.',
  },
  {
    id: 'modify-skill',
    title: 'Train a skill',
    summary: 'Change a skill value by name — IP spending or temporary bonus.',
    features: ['Tool: modify_skill'],
    playerMessage:
      'I spent my improvement points. Raise my Handgun skill to 6.',
    expect:
      'Should call modify_skill with skill_name "Handgun" and new_value 6. Case-insensitive name match. Value must be 0–10.',
  },
  {
    id: 'update-ammo',
    title: 'Reload or track ammo',
    summary: 'Set remaining shots on a weapon, or reload to full magazine.',
    features: ['Tool: update_ammo'],
    playerMessage:
      'I slam a fresh mag into my Militech Arms Avenger. Reload it to full.',
    expect:
      'Should call update_ammo with reload: true. The weapon must exist in the character items array. Check result for updated shots_left matching the weapon magazine capacity.',
  },
  {
    id: 'set-condition',
    title: 'Apply a condition with duration',
    summary: 'Persistent status effects with optional duration (rounds). Stored in conditions[] as {name, duration}, synced via Realtime. "stunned" uses isStunned instead.',
    features: ['Tool: set_condition', 'DB: conditions JSONB', 'Chat: system + condition_change metadata'],
    playerMessage:
      'The Dazzle grenade goes off right in front of me — I\'m blinded! Apply the blinded condition for 12 rounds (4 turns).',
    expect:
      'Should call set_condition with condition "blinded", active true, and duration_rounds 12. The condition is persisted as {name:"blinded", duration:12} in conditions[]. A system chat message with the duration is posted. For "stunned" specifically, only isStunned toggles (not stored in conditions[]).',
  },
  {
    id: 'update-summary',
    title: 'Session memory',
    summary: 'Persist important story events to session_summary so context survives long sessions.',
    features: ['Tool: update_summary'],
    playerMessage:
      'We just finished the Arasaka warehouse raid. Update the session summary with what happened: we stole the prototype, lost our rigger, and the corp knows our faces now.',
    expect:
      'Should call update_summary with a summary string. The sessions.session_summary column is updated. This text appears in SUMMARY block on future GM turns.',
  },
  {
    id: 'npc-dialogue',
    title: 'NPC speaks in chat',
    summary: 'Post in-character dialogue attributed to a named NPC — distinct from GM narration.',
    features: ['Tool: add_chat_as_npc', 'Chat: narration + npc_dialogue metadata'],
    playerMessage:
      'I ask the fixer what he knows about the Tyger Claws hideout. What does he say?',
    expect:
      'May call add_chat_as_npc with npc_name (e.g. "Rogue") and text. The chat message appears with the NPC name as speaker, type narration, metadata.kind npc_dialogue. Distinct from play_narration which always says "Game Master".',
  },
  {
    id: 'multi-tool',
    title: 'Multi-tool combat round',
    summary: 'Complex scenario that should trigger multiple tools in one turn.',
    features: ['Tools: roll_dice, apply_damage, set_condition, play_narration'],
    playerMessage:
      'The booster shoots at me with his SMG (3-round burst). Roll his attack, determine if it hits, roll damage if so, and apply it. He\'s at medium range.',
    expect:
      'The model should chain multiple tools: roll_dice for the attack, possibly roll_dice again for damage, apply_damage if it hits, and maybe set_condition or play_narration. Watch the toolResults array for the sequence.',
  },
  {
    id: 'freeform',
    title: 'Freeform (custom message)',
    summary: 'Type your own player message to test any tool combination.',
    features: ['Any tool'],
    playerMessage: '',
    expect: 'Depends on what you type. Use this to test edge cases or combine multiple tools.',
  },
];

type ApiToolResult = { ok: true; name: string; result: unknown } | { ok: false; name: string; error: string };

interface ApiResponse {
  ok?: boolean;
  narrationPending?: boolean;
  playerMessage?: { id: string; speaker: string; text: string; timestamp: number; type: string };
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

  const [customMessage, setCustomMessage] = useState('');

  const isFreeform = selected.id === 'freeform';
  const effectiveMessage = isFreeform ? customMessage : selected.playerMessage;

  const sendScenario = useCallback(async () => {
    setClientError(null);
    setLastJson(null);
    const sid = sessionId.trim();
    if (!sid) {
      setClientError('Paste a session UUID from Supabase or from your /session/… URL.');
      return;
    }
    if (!effectiveMessage.trim()) {
      setClientError('Player message is empty.');
      return;
    }

    setLoading(true);
    try {
      const accessToken = await getAccessTokenForApi(supabase);
      if (!accessToken) {
        setClientError('Sign in first (use /login or Character demo auth), then retry.');
        return;
      }
      const res = await fetch('/api/gm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          sessionId: sid,
          playerMessage: effectiveMessage,
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
  }, [sessionId, effectiveMessage, speakerName]);

  const copyMessage = useCallback(() => {
    void navigator.clipboard.writeText(effectiveMessage);
  }, [effectiveMessage]);

  const originalScenarios = GM_SCENARIOS.filter(
    (s) => !['add-money', 'heal-damage', 'gm-roll', 'equip-item', 'modify-skill', 'update-ammo', 'set-condition', 'update-summary', 'npc-dialogue', 'multi-tool', 'freeform'].includes(s.id),
  );
  const newScenarios = GM_SCENARIOS.filter(
    (s) => ['add-money', 'heal-damage', 'gm-roll', 'equip-item', 'modify-skill', 'update-ammo', 'set-condition', 'update-summary', 'npc-dialogue'].includes(s.id),
  );
  const advancedScenarios = GM_SCENARIOS.filter(
    (s) => s.id === 'multi-tool' || s.id === 'freeform',
  );

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

      <section className="space-y-6">
        <div className="space-y-3">
          <h2 className="text-sm uppercase tracking-[0.15em] text-yellow-500/90">Core tools</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {originalScenarios.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={`text-left border p-3 rounded-sm transition-colors ${
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
        </div>

        <div className="space-y-3">
          <h2 className="text-sm uppercase tracking-[0.15em] text-emerald-400/90">New tools</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {newScenarios.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={`text-left border p-3 rounded-sm transition-colors ${
                  selectedId === s.id
                    ? 'border-emerald-500 bg-emerald-950/30'
                    : 'border-gray-800 bg-black/40 hover:border-gray-600'
                }`}
              >
                <p className="font-bold text-white text-sm">{s.title}</p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-1">{s.summary}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm uppercase tracking-[0.15em] text-amber-400/90">Advanced</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {advancedScenarios.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={`text-left border p-3 rounded-sm transition-colors ${
                  selectedId === s.id
                    ? 'border-amber-500 bg-amber-950/30'
                    : 'border-gray-800 bg-black/40 hover:border-gray-600'
                }`}
              >
                <p className="font-bold text-white text-sm">{s.title}</p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.summary}</p>
              </button>
            ))}
          </div>
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
            <p className="text-xs text-gray-500 uppercase mb-1">
              {isFreeform ? 'Your message' : 'Example player message'}
            </p>
            {isFreeform ? (
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Type any player message to test tools…"
                rows={4}
                className="w-full text-sm text-gray-200 font-mono bg-black/50 border border-gray-800 p-3 rounded-sm resize-y focus:border-cyan-500 focus:outline-none"
              />
            ) : (
              <pre className="text-sm text-gray-200 whitespace-pre-wrap font-mono bg-black/50 border border-gray-800 p-3 rounded-sm">
                {selected.playerMessage}
              </pre>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              {!isFreeform && (
                <button
                  type="button"
                  onClick={copyMessage}
                  className="text-xs px-3 py-1.5 border border-gray-600 text-gray-300 hover:bg-gray-900"
                >
                  Copy message
                </button>
              )}
              <button
                type="button"
                onClick={sendScenario}
                disabled={loading || (isFreeform && !customMessage.trim())}
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
