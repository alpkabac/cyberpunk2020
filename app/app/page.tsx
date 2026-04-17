import Link from 'next/link';
import { OpenSessionRoom } from '@/components/OpenSessionRoom';

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center space-y-8">
        <h1 className="text-6xl font-bold uppercase tracking-widest">
          <span className="text-cyan-400">Cyber</span>
          <span className="text-yellow-400">punk</span>
          <span className="text-white"> 2020</span>
        </h1>

        <p className="text-xl text-gray-400">
          AI Game Master &bull; Digital Character Sheets &bull; Multiplayer Sessions
        </p>

        <div className="border-t border-gray-800 pt-8 space-y-4">
          <Link
            href="/dev"
            className="block w-full max-w-md mx-auto bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-2 border-zinc-500 px-8 py-4 font-bold uppercase text-lg tracking-wider transition-colors"
          >
            Session &amp; dev tools
          </Link>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            One place: save session UUID, open the room, character demo, realtime debugger, and AI-GM scenarios — survives
            refresh.
          </p>

          <Link
            href="/login"
            className="block w-full max-w-md mx-auto bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-2 border-zinc-500 px-8 py-4 font-bold uppercase text-lg tracking-wider transition-colors"
          >
            Sign in / sign up
          </Link>

          <Link
            href="/character-demo"
            className="block w-full max-w-md mx-auto bg-cyan-600 hover:bg-cyan-500 text-white border-2 border-cyan-400 px-8 py-4 font-bold uppercase text-lg tracking-wider transition-colors"
          >
            Character sheet demo
          </Link>

          <div className="border-t border-zinc-800 pt-6">
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Jump to session room</p>
            <OpenSessionRoom />
          </div>

          <div className="text-sm text-gray-600 space-y-2 text-left max-w-md mx-auto">
            <p>
              <strong className="text-gray-400">Play URL:</strong>{' '}
              <code className="text-gray-400">/session/&lt;uuid&gt;</code> — cloud sheets:{' '}
              <code className="text-gray-400">/character-demo?session=…</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
