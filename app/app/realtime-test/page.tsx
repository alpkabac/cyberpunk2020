import { Suspense } from 'react';
import { RealtimeTestClient } from './RealtimeTestClient';

export default function RealtimeTestPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center font-mono text-sm">
          Loading realtime test…
        </div>
      }
    >
      <RealtimeTestClient />
    </Suspense>
  );
}
