import { Suspense } from 'react';
import { GmScenariosClient } from './GmScenariosClient';

export default function GmScenariosPage() {
  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-10">
      <Suspense
        fallback={
          <div className="max-w-4xl mx-auto py-20 text-center text-zinc-500 font-mono text-sm">Loading GM scenarios…</div>
        }
      >
        <GmScenariosClient />
      </Suspense>
    </div>
  );
}
