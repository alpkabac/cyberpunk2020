/**
 * Calls merge after all clients have had time to POST STT fragments; retries when the server
 * is still waiting for stragglers (HTTP 202) or merge lock contention.
 */
export async function requestSessionVoiceTurnMerge(
  sessionId: string,
  turnId: string,
  accessToken: string,
  opts?: { openRouterModel?: string },
): Promise<void> {
  for (let attempt = 0; attempt < 15; attempt++) {
    const res = await fetch('/api/session/voice-turn/merge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        sessionId,
        turnId,
        ...(opts?.openRouterModel ? { openRouterModel: opts.openRouterModel } : {}),
      }),
    });

    if (res.status === 202) {
      const j = (await res.json().catch(() => ({}))) as { retryAfterMs?: number };
      await new Promise((r) => setTimeout(r, j.retryAfterMs ?? 1500));
      continue;
    }

    if (res.status === 400) {
      const err = (await res.json().catch(() => ({}))) as { code?: string };
      if (err.code === 'NO_FRAGMENTS') {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
    }

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? res.statusText ?? 'Merge failed');
    }
    return;
  }
  throw new Error('Voice turn merge did not complete after retries');
}
