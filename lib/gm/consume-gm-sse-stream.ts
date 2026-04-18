/**
 * Parse Server-Sent Events from POST /api/gm/stream (single-line data JSON per event).
 */
export async function* parseGmSseResponse(response: Response): AsyncGenerator<{
  event: string;
  data: Record<string, unknown>;
}> {
  if (!response.body) {
    throw new Error('GM stream: no response body');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep = buffer.indexOf('\n\n');
      while (sep !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        sep = buffer.indexOf('\n\n');

        let eventName = 'message';
        const dataLines: string[] = [];
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
        }
        const dataStr = dataLines.join('');
        if (!dataStr) continue;
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(dataStr) as Record<string, unknown>;
        } catch {
          continue;
        }
        yield { event: eventName, data };
      }
    }
  } finally {
    reader.releaseLock();
  }
}
