import {
  CHATTERBOX_NPC_VOICE_MEMORY_MAX_KEYS,
  slotForOverflowingVoiceMemory,
} from './chatterbox-npc-voice-memory';
import type {
  ChatterboxNpcVoiceMode,
  ChatterboxNpcVoiceRule,
  NarrationTtsClientConfig,
} from './narration-tts-client-config';

const GM_SPEAKER = new Set(['game master', 'gm', 'narrator', '']);

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Picks the best rule for a name or speaker: longest `label` match first (substring in either direction).
 */
export function matchChatterboxNpcVoiceRule(
  nameOrSpeaker: string,
  rules: ChatterboxNpcVoiceRule[] | undefined,
): ChatterboxNpcVoiceRule | null {
  if (!rules || rules.length === 0) return null;
  const n = norm(nameOrSpeaker);
  if (!n) return null;
  const sorted = [...rules]
    .filter((r) => (r.label?.trim() ?? '').length > 0)
    .sort((a, b) => (b.label?.length ?? 0) - (a.label?.length ?? 0));
  for (const r of sorted) {
    const nl = norm(r.label ?? '');
    if (nl.length < 1) continue;
    if (n === nl) return r;
    if (nl.length < 3) continue;
    if (n.includes(nl) || nl.includes(n)) {
      return r;
    }
  }
  return null;
}

type Segment = { text: string; rule: ChatterboxNpcVoiceRule | null };

export type ChatterboxNarrationSegmentsResult = {
  segments: Segment[];
  /**
   * For **byListOrder**, name→row index in `chatterboxNpcVoices` (used as `rules[index % len]`). Persists
   * across messages in `sessions.settings.chatterboxNpcVoiceMemory`. Other modes echo input memory unchanged.
   */
  voiceMemory: Record<string, number>;
};

/**
 * Tries to read `**Name**:` or `Name:` at the start of a line. Returns a trimmed "name" if it looks
 * like dialogue labelling, not e.g. `12: 30` times.
 */
function tryExtractLineDialogueName(line: string): string | null {
  const t = line.trim();
  if (t.length < 3) return null;
  const m = t.match(
    /^\s*(?:\*\*([^*]{1,120}?)\*\*|([^:*\n]{2,120}?))\s*:\s*(.+)$/,
  );
  if (!m) return null;
  const g1 = (m[1] ?? m[2])?.replace(/\*+/g, '').trim() ?? '';
  if (g1.length < 2) return null;
  if (/^\d+(?:[.:]\d+)?$/.test(g1)) return null;
  return g1;
}

function splitByLines(plain: string): string[] {
  return plain.split(/\r\n|\n|\r/);
}

function pickRuleBySlot(rules: ChatterboxNpcVoiceRule[], slot: number): ChatterboxNpcVoiceRule | null {
  if (rules.length === 0) return null;
  return rules[slot % rules.length] ?? null;
}

/** @mutates `working` — new names get the next list slot, capped with deterministic overflow. */
function assignSlotForName(nkey: string, working: Record<string, number>, rulesLen: number): number {
  if (nkey in working) {
    return working[nkey]!;
  }
  if (Object.keys(working).length >= CHATTERBOX_NPC_VOICE_MEMORY_MAX_KEYS) {
    return slotForOverflowingVoiceMemory(nkey, rulesLen);
  }
  const slot = Object.keys(working).length % (rulesLen || 1);
  working[nkey] = slot;
  return slot;
}

/**
 * If the message speaker is a named NPC (not "Game Master"), map the whole line to a voice: name match
 * (byName) or list-order slot (byListOrder, **mutates** `working` when provided).
 */
function buildSegmentsForSpeakerOnly(
  plain: string,
  messageSpeaker: string,
  rules: ChatterboxNpcVoiceRule[] | undefined,
  mode: ChatterboxNpcVoiceMode,
  working: Record<string, number> | null,
): Segment[] | null {
  const sp = norm(messageSpeaker);
  if (!sp || GM_SPEAKER.has(sp)) return null;
  if (!rules || rules.length === 0) return null;
  if (mode === 'byListOrder' && working) {
    const slot = assignSlotForName(sp, working, rules.length);
    const rule = pickRuleBySlot(rules, slot);
    if (!rule) return null;
    return [{ text: plain, rule }];
  }
  if (mode === 'byListOrder') {
    return [{ text: plain, rule: rules[0]! }];
  }
  const hit = matchChatterboxNpcVoiceRule(messageSpeaker, rules);
  if (!hit) return null;
  return [{ text: plain, rule: hit }];
}

/**
 * Splits plain narration into segments by line, switching Chatterbox voice when a line starts
 * with `Name:` / `**Name**:` and `Name` matches a user rule. Continuation lines (no new label) keep
 * the last matched voice. Unmatched `Name:` lines use the default session voice.
 */
function buildSegmentsFromLineLabels(plain: string, rules: ChatterboxNpcVoiceRule[] | undefined): Segment[] {
  if (!rules || rules.length === 0) {
    return [{ text: plain, rule: null }];
  }
  const lines = splitByLines(plain);
  if (lines.length === 0) {
    return [{ text: plain, rule: null }];
  }
  const out: Segment[] = [];
  let cur: { lines: string[]; rule: ChatterboxNpcVoiceRule | null } = { lines: [], rule: null };
  const flush = () => {
    if (cur.lines.length === 0) return;
    const t = cur.lines.join('\n').replace(/\s+$/, '');
    if (t.length > 0) {
      out.push({ text: t, rule: cur.rule });
    }
  };

  for (const line of lines) {
    const name = tryExtractLineDialogueName(line);
    if (name !== null) {
      const r = matchChatterboxNpcVoiceRule(name, rules);
      flush();
      cur = { lines: [line], rule: r };
    } else {
      if (cur.lines.length === 0) {
        cur = { lines: [line], rule: null };
      } else {
        cur.lines.push(line);
      }
    }
  }
  flush();
  if (out.length === 0) {
    return [{ text: plain, rule: null }];
  }
  return mergeAdjacentSameRule(out);
}

function buildSegmentsFromLineLabelsByOrder(
  plain: string,
  rules: ChatterboxNpcVoiceRule[] | undefined,
  working: Record<string, number>,
): Segment[] {
  if (!rules || rules.length === 0) {
    return [{ text: plain, rule: null }];
  }
  const lines = splitByLines(plain);
  if (lines.length === 0) {
    return [{ text: plain, rule: null }];
  }
  const out: Segment[] = [];
  let cur: { lines: string[]; rule: ChatterboxNpcVoiceRule | null } = { lines: [], rule: null };
  const flush = () => {
    if (cur.lines.length === 0) return;
    const t = cur.lines.join('\n').replace(/\s+$/, '');
    if (t.length > 0) {
      out.push({ text: t, rule: cur.rule });
    }
  };

  for (const line of lines) {
    const name = tryExtractLineDialogueName(line);
    if (name !== null) {
      const nkey = norm(name);
      const slot = assignSlotForName(nkey, working, rules.length);
      const r = pickRuleBySlot(rules, slot);
      flush();
      cur = { lines: [line], rule: r };
    } else {
      if (cur.lines.length === 0) {
        cur = { lines: [line], rule: null };
      } else {
        cur.lines.push(line);
      }
    }
  }
  flush();
  if (out.length === 0) {
    return [{ text: plain, rule: null }];
  }
  return mergeAdjacentSameRule(out);
}

function mergeAdjacentSameRule(segments: Segment[]): Segment[] {
  const merged: Segment[] = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && ruleKey(last.rule) === ruleKey(seg.rule)) {
      last.text = `${last.text}\n${seg.text}`;
    } else {
      merged.push({ text: seg.text, rule: seg.rule });
    }
  }
  return merged;
}

function ruleKey(r: ChatterboxNpcVoiceRule | null): string {
  if (!r) return 'default';
  const oa =
    r.useOpenAiEndpoint === true ? '1' : r.useOpenAiEndpoint === false ? '0' : 'x';
  return [
    r.label ?? '',
    r.voiceMode ?? '',
    r.predefinedVoiceId ?? '',
    r.referenceAudioFilename ?? '',
    r.openAiVoice ?? '',
    oa,
  ].join('\u0000');
}

/**
 * @param plain — output of `plainTextForNarrationTts`
 * @param messageSpeaker — `chat_messages.speaker` (e.g. "Game Master" or an NPC name)
 * @param mode — `byName` matches row labels; `byListOrder` uses row 1,2,… for 1st, 2nd,… unique `Name:` in the text
 * @param memoryIn — for **byListOrder**, name→row index; merged across the session in `settings.chatterboxNpcVoiceMemory`
 */
export function buildChatterboxNarrationSegments(
  plain: string,
  messageSpeaker: string,
  rules: ChatterboxNpcVoiceRule[] | undefined,
  mode: ChatterboxNpcVoiceMode = 'byName',
  memoryIn: Record<string, number> = {},
): ChatterboxNarrationSegmentsResult {
  if (!plain.trim()) {
    return { segments: [], voiceMemory: { ...memoryIn } };
  }
  const voiceMemory = { ...memoryIn };
  if (mode === 'byListOrder' && rules && rules.length > 0) {
    const fromSpeaker = buildSegmentsForSpeakerOnly(plain, messageSpeaker, rules, mode, voiceMemory);
    if (fromSpeaker) {
      return { segments: fromSpeaker, voiceMemory };
    }
    return {
      segments: buildSegmentsFromLineLabelsByOrder(plain, rules, voiceMemory),
      voiceMemory,
    };
  }
  if (!rules || rules.length === 0) {
    return { segments: [{ text: plain, rule: null }], voiceMemory };
  }
  const fromSpeaker = buildSegmentsForSpeakerOnly(plain, messageSpeaker, rules, mode, null);
  if (fromSpeaker) {
    return { segments: fromSpeaker, voiceMemory };
  }
  return { segments: buildSegmentsFromLineLabels(plain, rules), voiceMemory };
}

/** Merges a per-NPC rule onto the base Chatterbox block for one synthesis. */
export function clientConfigForChatterboxRule(
  base: NarrationTtsClientConfig,
  rule: ChatterboxNpcVoiceRule | null,
  options?: { forceWav?: boolean },
): NarrationTtsClientConfig {
  const b = base.chatterbox ?? {};
  if (!rule) {
    if (!options?.forceWav) return base;
    return {
      ...base,
      chatterbox: {
        ...b,
        outputFormat: 'wav',
      },
    };
  }
  return {
    ...base,
    chatterbox: {
      ...b,
      ...(options?.forceWav ? { outputFormat: 'wav' as const } : {}),
      ...(typeof rule.useOpenAiEndpoint === 'boolean' ? { useOpenAiEndpoint: rule.useOpenAiEndpoint } : {}),
      ...(typeof rule.voiceMode === 'string' ? { voiceMode: rule.voiceMode } : {}),
      ...(rule.predefinedVoiceId != null && rule.predefinedVoiceId.length > 0
        ? { predefinedVoiceId: rule.predefinedVoiceId }
        : {}),
      ...(rule.referenceAudioFilename != null && rule.referenceAudioFilename.length > 0
        ? { referenceAudioFilename: rule.referenceAudioFilename }
        : {}),
      ...(rule.openAiVoice != null && rule.openAiVoice.length > 0 ? { openAiVoice: rule.openAiVoice } : {}),
    },
  };
}
