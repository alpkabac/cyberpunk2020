/**
 * Strip markdown images and extra whitespace for TTS transcripts.
 * Keeps other punctuation; the model can handle light markdown residue.
 */
export function plainTextForNarrationTts(raw: string): string {
  const withoutImages = raw.replace(/!\[[^\]]*]\([^)]+\)/g, ' ');
  return withoutImages.replace(/\s+/g, ' ').trim();
}
