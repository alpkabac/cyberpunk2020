/**
 * Server-side merge of per-client STT fragments (and optional saved dice rolls) into one GM player message.
 */

export interface SessionVoiceTurnFragmentInput {
  anchorMs: number;
  playerMessage: string;
  pendingRolls: Array<{ rolledAtMs: number; playerMessage: string }>;
}

function segmentTimeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function mergeSessionVoiceTurnFragmentsForGm(
  fragments: SessionVoiceTurnFragmentInput[],
): { playerMessage: string; playerMessageMetadata: Record<string, unknown> } {
  type Seg = { t: number; kind: 'voice' | 'roll'; body: string };
  const segments: Seg[] = [];

  for (const f of fragments) {
    const body = f.playerMessage.trim();
    if (body) {
      segments.push({ t: f.anchorMs, kind: 'voice', body });
    }
    for (const r of f.pendingRolls) {
      const rb = r.playerMessage.trim();
      if (rb) {
        segments.push({ t: r.rolledAtMs, kind: 'roll', body: rb });
      }
    }
  }

  segments.sort((a, b) => a.t - b.t);

  const lines = segments.map((s) => {
    const time = segmentTimeLabel(s.t);
    const kind = s.kind === 'voice' ? 'Voice' : 'Roll';
    return `[${time}] ${kind}\n${s.body}`;
  });

  return {
    playerMessage: lines.join('\n\n'),
    playerMessageMetadata: {
      mergedSessionVoice: true as const,
      chronological: true as const,
      fragmentCount: fragments.length,
    },
  };
}
