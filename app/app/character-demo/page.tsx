import { Suspense } from 'react';
import { CharacterDemoClient } from './CharacterDemoClient';

export default function CharacterDemoPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black text-zinc-400 flex items-center justify-center">
          Loading character demo…
        </div>
      }
    >
      <CharacterDemoClient />
    </Suspense>
  );
}
