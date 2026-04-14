import Link from 'next/link';

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
            href="/character-demo"
            className="block w-full max-w-md mx-auto bg-cyan-600 hover:bg-cyan-500 text-white border-2 border-cyan-400 px-8 py-4 font-bold uppercase text-lg tracking-wider transition-colors"
          >
            Character Sheet Demo
          </Link>

          <div className="text-sm text-gray-600 space-y-1">
            <p>Full character sheet with stats, skills, combat, gear, cyberware, netrunning, and lifepath.</p>
            <p className="text-gray-700">More features coming: AI-GM chat, dice roller, token map, multiplayer.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
