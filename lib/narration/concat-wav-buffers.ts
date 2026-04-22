/**
 * Concatenate PCM wave files with identical format (e.g. multiple omnivoice-server
 * /v1/audio/speech non-streaming WAVs with the same sample rate and depth).
 */
function readFmtAndData(
  buf: Buffer,
): { sampleRate: number; numChannels: number; bitsPerSample: number; pcm: Buffer } | null {
  if (buf.length < 36 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    return null;
  }
  let pos = 12;
  let sampleRate = 0;
  let numChannels = 0;
  let bitsPerSample = 0;
  const chunks: Buffer[] = [];
  while (pos < buf.length - 8) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const dataStart = pos + 8;
    if (dataStart + size > buf.length) return null;
    if (id === 'fmt ' && size >= 16) {
      numChannels = buf.readUInt16LE(dataStart + 2);
      sampleRate = buf.readUInt32LE(dataStart + 4);
      bitsPerSample = buf.readUInt16LE(dataStart + 14);
    } else if (id === 'data') {
      chunks.push(buf.subarray(dataStart, dataStart + size));
    }
    pos = dataStart + size;
    if (size % 2 === 1) pos += 1;
  }
  if (chunks.length === 0 || !sampleRate || !numChannels || !bitsPerSample) return null;
  return { sampleRate, numChannels, bitsPerSample, pcm: Buffer.concat(chunks) };
}

function buildWavPcm(
  pcm: Buffer,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number,
): Buffer {
  const blockAlign = (numChannels * bitsPerSample) >> 3;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * If formats match, returns one WAV. Otherwise returns the first buffer (caller
 * may split text smaller so all parts match from the same engine).
 */
export function concatWavBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) return Buffer.alloc(0);
  if (buffers.length === 1) return buffers[0]!;
  const first = readFmtAndData(buffers[0]!);
  if (!first) return buffers[0]!;
  const allPcm: Buffer[] = [first.pcm];
  for (let i = 1; i < buffers.length; i++) {
    const p = readFmtAndData(buffers[i]!);
    if (
      !p ||
      p.sampleRate !== first.sampleRate ||
      p.numChannels !== first.numChannels ||
      p.bitsPerSample !== first.bitsPerSample
    ) {
      return buffers[0]!;
    }
    allPcm.push(p.pcm);
  }
  return buildWavPcm(
    Buffer.concat(allPcm),
    first.sampleRate,
    first.numChannels,
    first.bitsPerSample,
  );
}

/**
 * Splits at paragraph / sentence / word boundaries to stay under TTS per-request
 * time limits. Does not use full NLP; good enough for GM narration.
 */
export function splitTextForOmnivoiceChunks(text: string, maxChars: number): string[] {
  const t = text.replace(/\r\n/g, '\n').trim();
  if (t.length <= maxChars) return [t];
  const out: string[] = [];
  let start = 0;
  while (start < t.length) {
    const endLimit = Math.min(start + maxChars, t.length);
    if (endLimit >= t.length) {
      out.push(t.slice(start).trim());
      break;
    }
    const slice = t.slice(start, endLimit);
    let breakAt = -1;
    const para = slice.lastIndexOf('\n\n');
    if (para >= 20) breakAt = start + para + 2;
    if (breakAt < 0) {
      for (const sep of ['. ', '.\n', '! ', '?\n', '? ', ';\n', '; ']) {
        const idx = slice.lastIndexOf(sep);
        if (idx >= Math.min(20, slice.length * 0.15)) {
          breakAt = start + idx + sep.length;
          break;
        }
      }
    }
    if (breakAt < 0) {
      const sp = slice.lastIndexOf(' ');
      breakAt = sp > 30 ? start + sp + 1 : endLimit;
    }
    let next = breakAt > start ? breakAt : endLimit;
    if (next <= start) next = Math.min(start + 1, t.length);
    const part = t.slice(start, next).trim();
    if (part.length > 0) out.push(part);
    start = next;
  }
  return out.length > 0 ? out : [t];
}
