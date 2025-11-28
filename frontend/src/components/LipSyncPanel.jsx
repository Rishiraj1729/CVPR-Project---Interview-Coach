export default function LipSyncPanel({ score, status, energy }) {
  const statusColor =
    status === "Synced"
      ? "text-emerald-300"
      : status === "Loosely Synced"
        ? "text-yellow-200"
        : "text-red-300";

  return (
    <div className="rounded-xl bg-panel p-4 shadow-inner">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">Lip Sync Monitor</p>
          <p className={`text-2xl font-semibold ${statusColor}`}>{status}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-gray-400">Sync score</p>
          <p className="text-3xl font-bold text-white">{Math.round(score)}%</p>
        </div>
      </div>
      <div className="mt-4 h-2 rounded-full bg-black/20">
        <div
          className="h-full rounded-full bg-gradient-to-r from-red-400 via-yellow-300 to-emerald-400"
          style={{ width: `${Math.max(8, Math.min(100, score))}%` }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
        <span>
          Speech energy: <span className="text-white">{Math.round(energy)}%</span>
        </span>
        <span>Mouth motion mirrored on cam</span>
      </div>
    </div>
  );
}

