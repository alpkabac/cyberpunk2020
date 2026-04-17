import { Suspense } from 'react';
import { SessionRoomClient } from './SessionRoomClient';

export default function SessionRoomPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center font-mono text-sm">
          Opening session…
        </div>
      }
    >
      <SessionRoomClient />
    </Suspense>
  );
}
