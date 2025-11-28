export default function SessionSummary({ summary, onRestart }) {
  if (!summary) return null;

  const items = [
    { label: "Composite Score", value: `${summary.compositeScore}%` },
    { label: "Session length", value: summary.durationLabel },
    { label: "Avg confidence", value: `${summary.avgConfidence}%` },
    { label: "Attention score", value: `${summary.attention}%` },
    { label: "Avg mood", value: `${summary.avgMood}%` },
    { label: "Lip sync avg", value: `${summary.lipSyncAverage ?? 0}%` },
    { label: "Keyword match", value: `${summary.matchScore}%` },
    { label: "Sample alignment", value: `${summary.sampleScore}%` },
    { label: "Story novelty", value: `${summary.noveltyScore}%` },
    { label: "Blink count", value: summary.blinkTotal },
    { label: "Blink rate", value: `${summary.blinkRate}/min` },
    { label: "Warnings", value: summary.warnings },
    { label: "Head movement alerts", value: summary.headMovementEvents }
  ];

  return (
    <div className="rounded-2xl border border-accent/40 bg-surface p-6 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">Session Summary</p>
          <h3 className="text-2xl font-semibold text-white">
            Composite score: {summary.compositeScore}%
          </h3>
          <p className="mt-1 text-sm text-gray-400">
            Here’s how you performed during the last interview attempt.
          </p>
        </div>
        <button
          onClick={onRestart}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-sky-300"
        >
          Restart Session
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-xl bg-panel/70 px-4 py-3 text-sm text-gray-300 shadow-inner"
          >
            <p className="text-xs uppercase tracking-wide text-gray-500">{item.label}</p>
            <p className="mt-1 text-lg font-semibold text-white">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl bg-black/30 p-4 text-sm text-gray-300">
        <p className="font-medium text-white">Coaching tips</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {summary.suggestions.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

