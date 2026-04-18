/**
 * Incrementally extracts complete sentences from streamed narration for chunk TTS.
 * Sentence end: . ! ? … followed by whitespace or end of string.
 */
export function pullCompleteSentences(
  carry: string,
  incoming: string,
): { sentences: string[]; carry: string } {
  const s = carry + incoming;
  const sentences: string[] = [];
  let start = 0;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    const isEnd = ch === '.' || ch === '!' || ch === '?' || ch === '\u2026';
    if (isEnd) {
      const next = i + 1 < s.length ? s[i + 1] : '';
      const atEnd = i === s.length - 1;
      const followedBySpace = /\s/.test(next);
      if (atEnd || followedBySpace) {
        const piece = s.slice(start, i + 1).trim();
        if (piece.length >= 2) sentences.push(piece);
        start = i + 1;
        while (start < s.length && /\s/.test(s[start])) start++;
        i = start;
        continue;
      }
    }
    i++;
  }
  return { sentences, carry: s.slice(start) };
}
