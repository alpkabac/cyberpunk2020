'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getDevSessionId, SESSION_ID_RE, setDevSessionId } from '@/lib/dev/dev-session-storage';

export function OpenSessionRoom() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const [initialized, setInitialized] = useState(false);
  if (!initialized && typeof window !== 'undefined') {
    setInitialized(true);
    const s = getDevSessionId();
    if (s) setValue(s);
  }

  const go = () => {
    const id = value.trim();
    if (!SESSION_ID_RE.test(id)) {
      setErr('Paste a full session UUID (create one in Dev → Realtime test, or use your database).');
      return;
    }
    setErr(null);
    setDevSessionId(id);
    router.push(`/session/${id}`);
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-2 text-left">
      <label className="block text-xs uppercase tracking-wider text-gray-500">Open session room</label>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="session UUID"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void go();
          }}
          className="flex-1 min-w-0 bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm text-white placeholder:text-zinc-600 font-mono"
        />
        <button
          type="button"
          onClick={() => void go()}
          className="shrink-0 bg-emerald-800 hover:bg-emerald-700 text-white px-4 py-2 rounded text-sm font-bold uppercase tracking-wide"
        >
          Go
        </button>
      </div>
      {err && <p className="text-xs text-amber-400/90">{err}</p>}
      <p className="text-xs text-gray-500">
        URL shape: <code className="text-gray-400">/session/&lt;uuid&gt;</code> — not{' '}
        <code className="text-gray-500">/realtime-test?session=…</code>
      </p>
    </div>
  );
}
