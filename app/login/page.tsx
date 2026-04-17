import { Suspense } from 'react';
import { LoginClient } from './LoginClient';

export default function LoginPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen bg-zinc-950 text-zinc-500 flex items-center justify-center text-sm">Loading…</div>}
    >
      <LoginClient />
    </Suspense>
  );
}
