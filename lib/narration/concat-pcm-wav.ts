/**
 * Concatenate Chatterbox-style PCM WAVs with identical `fmt` blocks (same sample format).
 */

function readFmtAndDataPcm(wav: Buffer): { fmt: Buffer; dataPcm: Buffer } {
  if (wav.length < 44) throw new Error('WAV too small');
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a RIFF WAVE file');
  }
  let off = 12;
  let fmt: Buffer | null = null;
  let data: Buffer | null = null;
  while (off + 8 <= wav.length) {
    const id = wav.toString('ascii', off, off + 4);
    const size = wav.readUInt32LE(off + 4);
    const end = off + 8 + size;
    if (end > wav.length) break;
    const body = wav.subarray(off + 8, end);
    if (id === 'fmt ') fmt = body;
    if (id === 'data') data = body;
    off = end + (size % 2);
  }
  if (!fmt || !data) throw new Error('WAV missing fmt or data');
  return { fmt, dataPcm: data };
}

/**
 * @returns single buffer (pass-through) or a new RIFF with one `data` chunk
 */
export function concatPcmWavBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) {
    throw new Error('No WAV buffers to concat');
  }
  if (buffers.length === 1) {
    return buffers[0]!;
  }
  const first = readFmtAndDataPcm(buffers[0]!);
  const fmt = first.fmt;
  const body: Buffer[] = [first.dataPcm];
  for (let i = 1; i < buffers.length; i++) {
    const w = readFmtAndDataPcm(buffers[i]!);
    if (w.fmt.length !== fmt.length || !w.fmt.equals(fmt)) {
      throw new Error('WAV fmt mismatch — all segments must use the same Chatterbox output (e.g. wav + same device)');
    }
    body.push(w.dataPcm);
  }
  const pcm = Buffer.concat(body);
  const dataChunkSize = pcm.length;
  const fmtChunk = Buffer.alloc(8 + fmt.length);
  fmtChunk.write('fmt ', 0);
  fmtChunk.writeUInt32LE(fmt.length, 4);
  fmt.copy(fmtChunk, 8);
  const dataHdr = Buffer.alloc(8);
  dataHdr.write('data', 0);
  dataHdr.writeUInt32LE(dataChunkSize, 4);
  const out = Buffer.alloc(12 + fmtChunk.length + dataHdr.length + dataChunkSize);
  out.write('RIFF', 0);
  out.writeUInt32LE(out.length - 8, 4);
  out.write('WAVE', 8);
  fmtChunk.copy(out, 12);
  dataHdr.copy(out, 12 + fmtChunk.length);
  pcm.copy(out, 12 + fmtChunk.length + dataHdr.length);
  return out;
}
