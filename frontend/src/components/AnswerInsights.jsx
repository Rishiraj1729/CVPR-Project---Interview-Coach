export default function AnswerInsights({
  matchScore,
  sampleScore,
  noveltyScore,
  missingKeywords
}) {
  return (
    <div className="rounded-xl bg-panel p-4 shadow-inner">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Answer Insights</h3>
        <span className="text-xs uppercase tracking-wide text-gray-400">
          AI scoring
        </span>
      </div>

      <div className="mt-4 space-y-4">
        <InsightBar label="Keyword coverage" value={matchScore} accent />
        <InsightBar label="Sample answer alignment" value={sampleScore} />
        <InsightBar label="Story novelty" value={noveltyScore} />
      </div>

      <div className="mt-6 rounded-lg bg-black/15 p-3 text-sm">
        <p className="font-medium text-gray-200">Focus areas</p>
        {missingKeywords.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {missingKeywords.map((word) => (
              <span
                key={word}
                className="rounded-full border border-yellow-300/40 px-3 py-1 text-xs text-yellow-200"
              >
                {word}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-gray-400">Nice! You mentioned every key idea.</p>
        )}
      </div>
    </div>
  );
}

function InsightBar({ label, value, accent = false }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm text-gray-300">
        <span>{label}</span>
        <span className={accent ? "text-accent font-semibold" : "text-white"}>
          {Math.round(value)}%
        </span>
      </div>
      <div className="mt-2 h-3 rounded-full bg-black/30">
        <div
          className={`h-full rounded-full ${
            accent ? "bg-accent" : "bg-emerald-400"
          } transition-all`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

