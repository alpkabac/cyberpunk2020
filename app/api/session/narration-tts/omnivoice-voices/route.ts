import { NextResponse } from 'next/server';
import { requireAuthFromRequest } from '@/lib/auth/require-auth';
import {
  narrationTtsCachedAccess,
  narrationTtsCachedConfig,
} from '@/lib/narration/narration-tts-request-cache';
import { getServiceRoleClient } from '@/lib/supabase';
import { z } from 'zod';

const uuid = z.string().uuid();

const CACHE_TTL_MS = 30_000;
const CACHE_MAX = 32;
const listCache = new Map<string, { at: number; data: unknown }>();

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

type OmnivoiceVoicesResponse = {
  voices?: Array<{
    id?: string;
    type?: string;
    description?: string;
    profile_id?: string;
  }>;
  design_attributes?: unknown;
  total?: number;
};

/**
 * Proxy omnivoice-server GET /v1/voices for the TTS settings UI (avoids CORS; attaches optional Bearer from session).
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

  const tts = await narrationTtsCachedConfig(supabase, sessionId);
  const apiKey = tts.omnivoice?.apiKey?.trim();

  const cacheKey = `${base}\0${apiKey ? '1' : '0'}`;
  const cached = listCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  const voicesUrl = new URL('/v1/voices', `${base}/`);
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 15_000);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const res = await fetch(voicesUrl.toString(), { method: 'GET', headers, signal: ac.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        { error: 'omnivoice-server returned an error', detail: text.slice(0, 300) },
        { status: 502 },
      );
    }
    const data = (await res.json()) as OmnivoiceVoicesResponse;
    if (listCache.size >= CACHE_MAX) {
      const first = listCache.keys().next().value;
      if (first) listCache.delete(first);
    }
    listCache.set(cacheKey, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof Error && e.name === 'AbortError') {
      return NextResponse.json({ error: 'omnivoice-server request timed out' }, { status: 504 });
    }
    return NextResponse.json(
      { error: 'Could not reach omnivoice-server', detail: msg.slice(0, 200) },
      { status: 502 },
    );
  } finally {
    clearTimeout(tid);
  }
}
