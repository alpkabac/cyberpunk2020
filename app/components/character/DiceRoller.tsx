'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useGameStore } from '@/lib/store/game-store';
import { rollDice } from '@/lib/game-logic/dice';
import { resolveAttackFumbleOutcome } from '@/lib/game-logic/fumbles';
import { fnffAttackTotalMeetsDv } from '@/lib/game-logic/lookups';
import {
  buildGmDiceRollMessage,
  buildStunOverrideGmPayload,
  mergeVoiceWithSingleRollForGm,
} from '@/lib/dice-roll-send-to-gm';
import { getAccessTokenForApi } from '@/lib/auth/client-access-token';
import { applyGmPostSuccessToStore } from '@/lib/gm/apply-gm-client-response';
import { supabase } from '@/lib/supabase';
import type { DiceRollIntent, RollResult } from '@/lib/types';

interface DiceRollEntry {
  id: number;
  formula: string;
  result: RollResult;
  timestamp: number;
  /** Intent at roll time (before flat saves clear the store) — used for Save for voice / reroll. */
  intentSnapshot: DiceRollIntent | null;
  /** Captured when the roll completes so "Send to GM" still works after stun/death clears intent. */
  sendToGm?: {
    sessionId: string;
    speakerName: string;
    playerMessage: string;
  };
}

export function DiceRoller() {
  const isDiceRollerOpen = useGameStore((state) => state.ui.isDiceRollerOpen);
  const diceFormula = useGameStore((state) => state.ui.diceFormula);
  const diceRollIntent = useGameStore((state) => state.ui.diceRollIntent);
  const closeDiceRoller = useGameStore((state) => state.closeDiceRoller);
  const addPendingRollForVoice = useGameStore((state) => state.addPendingRollForVoice);

  const nonBlockingGm =
    diceRollIntent?.kind === 'gm_request' && diceRollIntent.nonBlockingUi !== false;
  const isStunOverrideRequest = diceRollIntent?.kind === 'stun_override_request';

  const [customFormula, setCustomFormula] = useState('');
  const [rollHistory, setRollHistory] = useState<DiceRollEntry[]>([]);
  const [lastRoll, setLastRoll] = useState<DiceRollEntry | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [fumbleLines, setFumbleLines] = useState<string[] | null>(null);
  const [stabilizationOutcome, setStabilizationOutcome] = useState<{
    target: number;
    success: boolean;
  } | null>(null);
  const [sheetSendError, setSheetSendError] = useState<string | null>(null);
  const [sheetSending, setSheetSending] = useState(false);
  const [saveForVoiceHint, setSaveForVoiceHint] = useState(false);
  const [stunOverrideNote, setStunOverrideNote] = useState('');

  const doRoll = useCallback((formula: string) => {
    const result = rollDice(formula);
    if (!result) return;

    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 300);

    const storeSnap = useGameStore.getState();
    const intentSnapshot = storeSnap.ui.diceRollIntent;
    let sendPayload = buildGmDiceRollMessage(intentSnapshot, formula, result);
    if (!sendPayload) {
      const sid = storeSnap.session.id?.trim();
      if (sid) {
        const cid = storeSnap.ui.selectedCharacterId;
        const char = cid ? storeSnap.characters.byId[cid] ?? storeSnap.npcs.byId[cid] : null;
        sendPayload = {
          sessionId: sid,
          speakerName: char?.name ?? 'Player',
          playerMessage: `Rolled ${formula} = ${result.total} (dice: ${result.rolls.join(', ')})`,
        };
      }
    }

    const entry: DiceRollEntry = {
      id: Date.now(),
      formula,
      result,
      timestamp: Date.now(),
      intentSnapshot,
      ...(sendPayload ? { sendToGm: sendPayload } : {}),
    };

    setLastRoll(entry);
    setRollHistory((prev) => [entry, ...prev].slice(0, 20));

    const intent = intentSnapshot;
    const isFlat = formula.trim().toLowerCase().startsWith('flat:');

    if (!isFlat && intent?.kind === 'attack' && result.firstD10Face === 1) {
      setFumbleLines(resolveAttackFumbleOutcome(intent.isMelee, intent.reliability).lines);
    } else {
      setFumbleLines(null);
    }

    if (intent?.kind === 'stabilization') {
      const success = result.total >= intent.targetDamage;
      setStabilizationOutcome({
        target: intent.targetDamage,
        success,
      });
      const store = useGameStore.getState();
      store.applyStabilizationRollResult(intent.patientCharacterId, success, {
        rollTotal: result.total,
        targetDamage: intent.targetDamage,
      });
      store.clearDiceRollIntent();
    } else {
      setStabilizationOutcome(null);
    }

    if (intent && isFlat) {
      const store = useGameStore.getState();
      if (intent.kind === 'stun') {
        store.applyStunSaveRollResult(intent.characterId, result.total);
      } else if (intent.kind === 'stun_recovery') {
        store.applyStunRecoveryRollResult(intent.characterId, result.total);
      } else if (intent.kind === 'death') {
        store.applyDeathSaveRollResult(intent.characterId, result.total);
      }
      store.clearDiceRollIntent();
    }
  }, []);

  // Auto-roll once per distinct open/intent. Flat saves clear diceRollIntent after
  // applying the result — we must NOT re-auto-roll on that null transition (otherwise
  // the displayed die becomes a second, cosmetic roll that disagrees with what the
  // store applied). But chained saves (limb-sever → stun → forced death) replace the
  // intent with a new one while the roller stays open, and those DO need a fresh auto-roll.
  const lastAutoRolledKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isDiceRollerOpen) {
      lastAutoRolledKeyRef.current = null;
      return;
    }
    if (diceRollIntent?.kind === 'stun_override_request') {
      lastAutoRolledKeyRef.current = null;
      return;
    }
    if (!diceFormula) return;
    if (diceRollIntent?.kind === 'gm_request') {
      const id = requestAnimationFrame(() => setCustomFormula(diceFormula));
      return () => cancelAnimationFrame(id);
    }
    // Intent was just cleared post-roll: skip (this is the bug guard).
    if (diceRollIntent === null && lastAutoRolledKeyRef.current !== null) return;

    const intentKey = diceRollIntent
      ? diceRollIntent.kind === 'stabilization'
        ? `stabilization:${diceRollIntent.patientCharacterId}:${diceRollIntent.targetDamage}`
        : `${diceRollIntent.kind}:${'characterId' in diceRollIntent ? diceRollIntent.characterId : ''}`
      : '__no_intent__';
    const key = `${diceFormula}::${intentKey}`;
    if (lastAutoRolledKeyRef.current === key) return;
    lastAutoRolledKeyRef.current = key;

    const id = requestAnimationFrame(() => {
      setCustomFormula(diceFormula);
      doRoll(diceFormula);
    });
    return () => cancelAnimationFrame(id);
  }, [isDiceRollerOpen, diceFormula, doRoll, diceRollIntent]);

  useEffect(() => {
    if (diceRollIntent?.kind === 'stun_override_request') {
      setStunOverrideNote(diceRollIntent.note ?? '');
    }
  }, [diceRollIntent]);

  const handleClose = useCallback(() => {
    setFumbleLines(null);
    setStabilizationOutcome(null);
    setSheetSendError(null);
    setSheetSending(false);
    setSaveForVoiceHint(false);
    setStunOverrideNote('');
    closeDiceRoller();
  }, [closeDiceRoller]);

  const sendStunOverrideToGm = useCallback(async () => {
    const intent = useGameStore.getState().ui.diceRollIntent;
    if (intent?.kind !== 'stun_override_request') return;
    const sid = (intent.sessionId?.trim() || useGameStore.getState().session.id?.trim()) ?? '';
    if (!sid) {
      setSheetSendError('Join a session to send this request.');
      return;
    }
    const char =
      useGameStore.getState().characters.byId[intent.characterId] ??
      useGameStore.getState().npcs.byId[intent.characterId];
    if (!char) {
      setSheetSendError('Character not found.');
      return;
    }
    setSheetSendError(null);
    setSheetSending(true);
    try {
      const accessToken = await getAccessTokenForApi(supabase);
      if (!accessToken) {
        setSheetSendError('Not signed in');
        return;
      }
      const payload = buildStunOverrideGmPayload({
        character: char,
        sessionId: sid,
        speakerName: intent.speakerName?.trim() || char.name,
        note: stunOverrideNote,
      });
      const res = await fetch('/api/gm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          sessionId: payload.sessionId,
          playerMessage: payload.playerMessage,
          speakerName: payload.speakerName,
          playerMessageMetadata: payload.playerMessageMetadata,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSheetSendError((data as { error?: string }).error ?? res.statusText ?? 'Request failed');
        return;
      }
      applyGmPostSuccessToStore(data);
      useGameStore.getState().clearDiceRollIntent();
      useGameStore.getState().closeDiceRoller();
    } catch (e) {
      setSheetSendError(e instanceof Error ? e.message : String(e));
    } finally {
      setSheetSending(false);
    }
  }, [stunOverrideNote]);

  const sendSheetRollToGm = useCallback(async () => {
    const payload = lastRoll?.sendToGm;
    if (!payload) return;
    setSheetSendError(null);
    setSheetSending(true);
    try {
      const accessToken = await getAccessTokenForApi(supabase);
      if (!accessToken) {
        setSheetSendError('Not signed in');
        return;
      }
      const pending = useGameStore.getState().ui.pendingVoiceGm;
      const merge =
        pending &&
        pending.sessionId === payload.sessionId &&
        lastRoll
          ? mergeVoiceWithSingleRollForGm(pending, payload.playerMessage, lastRoll.timestamp)
          : null;
      const res = await fetch('/api/gm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          sessionId: payload.sessionId,
          playerMessage: merge ? merge.playerMessage : payload.playerMessage,
          speakerName: payload.speakerName,
          ...(merge?.playerMessageMetadata
            ? { playerMessageMetadata: merge.playerMessageMetadata }
            : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSheetSendError((data as { error?: string }).error ?? res.statusText ?? 'Request failed');
        return;
      }
      applyGmPostSuccessToStore(data);
      if (merge) {
        useGameStore.getState().clearPendingVoiceGm();
      }
      const store = useGameStore.getState();
      if (store.ui.diceRollIntent?.kind === 'gm_request') {
        store.clearDiceRollIntent();
        store.closeDiceRoller();
      }
    } catch (e) {
      setSheetSendError(e instanceof Error ? e.message : String(e));
    } finally {
      setSheetSending(false);
    }
  }, [lastRoll]);

  const saveRollForNextVoice = useCallback(() => {
    if (!lastRoll?.sendToGm) {
      setSheetSendError('Join a session (or select a character with a session) to save rolls for voice.');
      return;
    }
    setSheetSendError(null);
    const payload = lastRoll.sendToGm;
    addPendingRollForVoice({
      id: crypto.randomUUID(),
      sessionId: payload.sessionId,
      speakerName: payload.speakerName,
      playerMessage: payload.playerMessage,
      rolledAtMs: lastRoll.timestamp,
      formula: lastRoll.formula,
      diceRollIntent: lastRoll.intentSnapshot,
    });
    setSaveForVoiceHint(true);
    window.setTimeout(() => setSaveForVoiceHint(false), 2500);
  }, [lastRoll, addPendingRollForVoice]);

  const handleQuickRoll = (formula: string) => {
    setCustomFormula(formula);
    doRoll(formula);
  };

  const handleCustomRoll = () => {
    if (customFormula.trim()) {
      doRoll(customFormula.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCustomRoll();
    }
  };

  if (!isDiceRollerOpen) return null;

  const displayFormula = (f: string) =>
    f.toLowerCase().startsWith('flat:')
      ? `${f.replace(/^flat:/i, '').trim()} · flat (save)`
      : f;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      aria-modal="true"
      role="dialog"
    >
      {nonBlockingGm ? (
        <div className="absolute inset-0 pointer-events-none" aria-hidden />
      ) : (
        <button
          type="button"
          className="absolute inset-0 bg-black/15 pointer-events-auto cursor-default"
          onClick={handleClose}
          aria-label="Close dice roller"
        />
      )}

      <div
        className="relative pointer-events-auto w-full max-w-md bg-[#f5f5dc] text-black border-4 border-black shadow-[8px_8px_0_0_rgba(0,0,0,0.85)] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b-4 border-black p-3 flex justify-between items-center bg-[#e8e8d0] shrink-0">
          <h2 className="text-lg font-bold uppercase tracking-wide text-black">
            {isStunOverrideRequest ? 'Stun override (AI-GM)' : 'Dice roller'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-2xl font-bold leading-none px-2 hover:bg-black hover:text-white border-2 border-black"
          >
            ×
          </button>
        </div>

        <div className="p-4 text-center overflow-y-auto flex-1 min-h-0">
          {isStunOverrideRequest && diceRollIntent?.kind === 'stun_override_request' ? (
            <div className="text-left space-y-3">
              <p className="text-xs text-black leading-relaxed">
                Ask the AI-GM to rule whether <strong className="font-bold">{diceRollIntent.speakerName}</strong>{' '}
                should remain <strong>STUNNED</strong>. The model should apply the result with{' '}
                <code className="font-mono bg-white border border-black px-1">set_condition</code> (stunned) when it
                changes the ruling.
              </p>
              <label className="block text-left text-xs font-bold uppercase text-black">
                Player note (optional)
                <textarea
                  value={stunOverrideNote}
                  onChange={(e) => setStunOverrideNote(e.target.value)}
                  rows={4}
                  placeholder="e.g. Kerenzikov kicked in, adrenalin from the doc…"
                  className="mt-1 w-full border-2 border-black px-2 py-1.5 font-sans text-sm text-black bg-white resize-y"
                />
              </label>
              <button
                type="button"
                onClick={() => void sendStunOverrideToGm()}
                disabled={sheetSending}
                className="w-full border-2 border-black bg-amber-100 text-black py-2 font-bold uppercase text-sm hover:bg-amber-200 disabled:opacity-50"
              >
                {sheetSending ? 'Sending…' : 'Send request to AI-GM'}
              </button>
              {sheetSendError && (
                <p className="text-xs text-red-800 border border-red-800 bg-red-50 p-1">{sheetSendError}</p>
              )}
            </div>
          ) : lastRoll ? (
            <div>
              <div className="text-xs font-mono text-black uppercase mb-1 break-all">
                {displayFormula(lastRoll.formula)}
              </div>
              <div
                className={`text-6xl sm:text-7xl font-bold text-black transition-transform ${
                  isAnimating ? 'scale-105' : 'scale-100'
                }`}
              >
                {lastRoll.result.total}
              </div>
              {lastRoll.result.rolls.length > 1 && (
                <div className="text-sm text-black mt-2 font-mono">
                  Rolls: [{lastRoll.result.rolls.join(', ')}]
                </div>
              )}
              {lastRoll.result.rolls.length === 1 && lastRoll.result.rolls[0] !== lastRoll.result.total && (
                <div className="text-sm text-black mt-2 font-mono">
                  Roll: {lastRoll.result.rolls[0]}
                  {lastRoll.result.total - lastRoll.result.rolls[0] > 0
                    ? ` + ${lastRoll.result.total - lastRoll.result.rolls[0]}`
                    : ` − ${lastRoll.result.rolls[0] - lastRoll.result.total}`}
                </div>
              )}
              {fumbleLines && fumbleLines.length > 0 && (
                <div className="mt-3 text-left border-2 border-red-900 bg-red-50 p-2 text-xs space-y-1">
                  <div className="font-bold uppercase text-red-950">Natural 1 — fumble</div>
                  {fumbleLines.map((line, i) => (
                    <p key={i} className="text-gray-900">
                      {line}
                    </p>
                  ))}
                </div>
              )}
              {stabilizationOutcome && (
                <div
                  className={`mt-3 text-left border-2 p-2 text-xs ${
                    stabilizationOutcome.success
                      ? 'border-green-800 bg-green-50'
                      : 'border-amber-900 bg-amber-50'
                  }`}
                >
                  <div className="font-bold uppercase text-gray-900">Stabilization</div>
                  <p className="text-gray-800">
                    Need total ≥ <strong>{stabilizationOutcome.target}</strong> (patient damage).
                  </p>
                  <p className="font-semibold text-gray-900">
                    {stabilizationOutcome.success
                      ? 'Success — patient marked Stabilized on the sheet (ongoing death saves off until new damage).'
                      : 'Failed — try again when rules allow, or other care.'}
                  </p>
                </div>
              )}
              {lastRoll.intentSnapshot?.kind === 'attack' &&
                typeof lastRoll.intentSnapshot.difficultyValue === 'number' && (
                  <div
                    className={`mt-3 text-left border-2 p-2 text-xs ${
                      fnffAttackTotalMeetsDv(
                        lastRoll.result.total,
                        lastRoll.intentSnapshot.difficultyValue,
                      )
                        ? 'border-green-800 bg-green-50'
                        : 'border-amber-900 bg-amber-50'
                    }`}
                  >
                    <div className="font-bold uppercase text-gray-900">vs DV (FNFF)</div>
                    <p className="text-gray-800">
                      Total <strong>{lastRoll.result.total}</strong> vs DV{' '}
                      <strong>{lastRoll.intentSnapshot.difficultyValue}</strong>
                      {lastRoll.intentSnapshot.rangeBracketLabel && (
                        <>
                          {' '}
                          · {lastRoll.intentSnapshot.rangeBracketLabel}
                        </>
                      )}
                      {lastRoll.intentSnapshot.targetName && (
                        <>
                          {' '}
                          · Target: <strong>{lastRoll.intentSnapshot.targetName}</strong>
                        </>
                      )}
                    </p>
                    <p className="font-semibold text-gray-900 mt-1">
                      {fnffAttackTotalMeetsDv(
                        lastRoll.result.total,
                        lastRoll.intentSnapshot.difficultyValue,
                      )
                        ? 'HIT — you may resolve damage (location + armor) against the target.'
                        : 'MISS — no damage from this roll unless the referee rules otherwise.'}
                    </p>
                    {fumbleLines && fumbleLines.length > 0 && (
                      <p className="text-[10px] text-red-950 mt-1.5 border-t border-red-900/30 pt-1">
                        Natural 1: resolve weapon fumble / jam even if the total reached the DV.
                      </p>
                    )}
                  </div>
                )}
              {lastRoll.result.hadExplodingD10 &&
                !lastRoll.formula.toLowerCase().startsWith('flat:') && (
                  <div className="mt-3 text-left space-y-1">
                    <div className="text-xs text-amber-950 font-bold uppercase border-2 border-black inline-block px-2 py-0.5 bg-amber-100">
                      Rolled a 10 — extra d10(s) included (FNFF)
                    </div>
                    {lastRoll.result.explodingD10Chains &&
                      lastRoll.result.explodingD10Chains.length > 0 && (
                      <div className="text-xs text-black font-mono">
                        {lastRoll.result.explodingD10Chains.map((faces, i) => (
                          <span key={i} className="block">
                            {faces.length > 1 ? (
                              <>
                                d10 chain: {faces.join(' + ')} = {faces.reduce((a, b) => a + b, 0)}
                              </>
                            ) : (
                              <>d10: {faces[0]}</>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              {lastRoll.formula.toLowerCase().startsWith('flat:') && (
                <div className="text-xs text-black mt-2">
                  Single d10 — no explosion (compare to save target)
                </div>
              )}
              {lastRoll.sendToGm && (
                <div className="mt-3 text-left border-2 border-black bg-[#e8e8d0] p-2 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void sendSheetRollToGm()}
                      disabled={sheetSending}
                      className="border-2 border-black bg-white text-black py-2 font-bold uppercase text-xs hover:bg-amber-50 disabled:opacity-50"
                    >
                      {sheetSending ? 'Sending…' : 'Send now'}
                    </button>
                    <button
                      type="button"
                      onClick={saveRollForNextVoice}
                      disabled={sheetSending}
                      className="border-2 border-black bg-[#d4d4b8] text-black py-2 font-bold uppercase text-xs hover:bg-[#c8c8a8] disabled:opacity-50"
                    >
                      Save for voice
                    </button>
                  </div>
                  <p className="text-[10px] text-black font-mono wrap-break-word">
                    {lastRoll.sendToGm.playerMessage}
                  </p>
                  {saveForVoiceHint && (
                    <p className="text-xs text-green-900 border border-green-800 bg-green-100 p-1 font-bold">
                      Saved — appears under Session chat → Saved for voice.
                    </p>
                  )}
                  {sheetSendError && (
                    <p className="text-xs text-red-800 border border-red-800 bg-red-50 p-1">{sheetSendError}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-black text-sm py-6">Roll or enter a formula</div>
          )}
        </div>

        {!isStunOverrideRequest && (
          <div className="px-4 pb-3 border-t-2 border-black/10 shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={customFormula}
                onChange={(e) => setCustomFormula(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. 1d10+12, 2d6+3, flat:1d10"
                className="flex-1 border-2 border-black px-3 py-2 font-mono text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-black/20"
              />
              <button
                type="button"
                onClick={handleCustomRoll}
                className="bg-black text-white border-2 border-black px-4 py-2 font-bold uppercase text-sm hover:bg-gray-800 shrink-0"
              >
                Roll
              </button>
            </div>
          </div>
        )}

        {!isStunOverrideRequest && (
          <div className="px-4 pb-3 shrink-0">
            <div className="grid grid-cols-4 gap-2">
              {(['1d10', '2d6', '3d6', '4d6'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => handleQuickRoll(f)}
                  className="border-2 border-black bg-white text-black py-2 font-bold text-sm hover:bg-[#e8e8d0]"
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isStunOverrideRequest && lastRoll && (
          <div className="px-4 pb-3 shrink-0">
            <button
              type="button"
              onClick={() => doRoll(lastRoll.formula)}
              className="w-full border-2 border-black bg-amber-100 text-black py-2 font-bold uppercase text-sm hover:bg-amber-200"
            >
              Re-roll ({displayFormula(lastRoll.formula)})
            </button>
          </div>
        )}

        {!isStunOverrideRequest && rollHistory.length > 1 && (
          <div className="border-t-2 border-black px-4 py-2 max-h-28 overflow-y-auto bg-white/50 shrink-0">
            <div className="text-xs font-bold uppercase text-black mb-1">History</div>
            <div className="space-y-1">
              {rollHistory.slice(1, 8).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => doRoll(entry.formula)}
                  className="w-full flex justify-between text-sm font-mono text-black text-left hover:bg-[#e8e8d0] px-1 py-0.5 border border-transparent hover:border-black"
                >
                  <span className="truncate mr-2">{displayFormula(entry.formula)}</span>
                  <span className="font-bold shrink-0">{entry.result.total}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
