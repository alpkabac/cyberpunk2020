import { NextResponse } from 'next/server';
import { requireAuthFromRequest } from '@/lib/auth/require-auth';
import { narrationTtsCachedAccess } from '@/lib/narration/narration-tts-request-cache';
import {
  extractPredefinedVoicesFromInitialData,
  extractReferenceFilesFromInitialData,
  parseChatterboxReferencePayload,
  parseChatterboxVoicesPayload,
} from '@/lib/narration/chatterbox-voices-parse';
import { getServiceRoleClient } from '@/lib/supabase';
import { z } from 'zod';

const uuid = z.string().uuid();

/** Chatterbox rescans disk per HTTP call; avoid hammering it when the UI refetches. */
const CHATTERBOX_VOICE_CACHE_TTL_MS = 60_000;
const CHATTERBOX_VOICE_CACHE_MAX = 32;
const voiceListCache = new Map<
  string,
  { at: number; body: { voices: string[]; referenceFiles: string[] } }
>();

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

function assertHttpUrl(base: string): URL {
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    throw new Error('Invalid base URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Base URL must be http or https');
  }
  if (!u.hostname) throw new Error('Base URL needs a host');
  return u;
}

/**
 * Proxy Chatterbox predefined-voice list for the TTS settings UI (avoids browser CORS to localhost).
 * GET `?sessionId=uuid&baseUrl=...` — requires session access.
 */
export async function GET(request: Request) {
  const auth = await requireAuthFromRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const sessionParsed = uuid.safeParse(url.searchParams.get('sessionId'));
  const baseRaw = url.searchParams.get('baseUrl')?.trim();
  if (!sessionParsed.success || !baseRaw) {
    return NextResponse.json(
      { error: 'sessionId (uuid) and baseUrl query params required' },
      { status: 400 },
    );
  }

  const sessionId = sessionParsed.data;
  const supabase = getServiceRoleClient();
  if (!(await narrationTtsCachedAccess(supabase, sessionId, auth.user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let base: string;
  try {
    base = normalizeBaseUrl(baseRaw);
    assertHttpUrl(base);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const cached = voiceListCache.get(base);
  if (cached && Date.now() - cached.at < CHATTERBOX_VOICE_CACHE_TTL_MS) {
    return NextResponse.json(cached.body);
  }

  const tryJson = async (path: string): Promise<unknown | null> => {
    const u = new URL(path, `${base}/`);
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(u.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: ac.signal,
      });
    } finally {
      clearTimeout(tid);
    }
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      try {
        return (await res.json()) as unknown;
      } catch {
        return null;
      }
    }
    const text = await res.text();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  };

  try {
    const [predefinedRaw, referenceRaw] = await Promise.all([
      tryJson('/get_predefined_voices'),
      tryJson('/get_reference_files'),
    ]);

    let voices = parseChatterboxVoicesPayload(predefinedRaw);
    if (typeof predefinedRaw === 'string' && voices.length === 0) {
      voices = predefinedRaw
        .split(/[\r\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }

    let referenceFiles = parseChatterboxReferencePayload(referenceRaw);
    if (typeof referenceRaw === 'string' && referenceFiles.length === 0) {
      referenceFiles = referenceRaw
        .split(/[\r\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }

    if (voices.length === 0 || referenceFiles.length === 0) {
      const initial = await tryJson('/api/ui/initial-data');
      if (initial != null) {
        if (voices.length === 0) {
          voices = extractPredefinedVoicesFromInitialData(initial);
        }
        if (referenceFiles.length === 0) {
          referenceFiles = extractReferenceFilesFromInitialData(initial);
        }
      }
    }

    const uniqueVoices = [...new Set(voices)];
    uniqueVoices.sort((a, b) => a.localeCompare(b));
    const uniqueRefs = [...new Set(referenceFiles)];
    uniqueRefs.sort((a, b) => a.localeCompare(b));
    const body = { voices: uniqueVoices, referenceFiles: uniqueRefs };
    if (voiceListCache.size >= CHATTERBOX_VOICE_CACHE_MAX) {
      const first = voiceListCache.keys().next().value;
      if (first) voiceListCache.delete(first);
    }
    voiceListCache.set(base, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: 'Could not reach Chatterbox server', detail: msg.slice(0, 200) },
      { status: 502 },
    );
  }
}
