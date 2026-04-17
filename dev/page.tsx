import { Suspense } from 'react';
import { DevSessionHub } from '@/components/DevSessionHub';

export default function DevToolsPage() {
  return (
    <div className="min-h-screen bg-black text-white p-8">
      <Suspense
        fallback={
          <div className="max-w-2xl mx-auto py-20 text-zinc-500 text-center font-mono text-sm">Loading dev tools…</div>
        }
      >
        <div className="max-w-2xl mx-auto">
          <DevSessionHub />
        </div>
      </Suspense>
    </div>
  );
}
