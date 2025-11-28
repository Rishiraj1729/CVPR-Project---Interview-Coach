export default function QuestionPanel({
  questions,
  currentIndex,
  onNext,
  matchScore,
  showSample,
  onToggleSample
}) {
  const current = questions[currentIndex] ?? {};
  return (
    <div className="rounded-xl bg-panel p-4 shadow-inner">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">
            Current Question
          </p>
          <h3 className="text-lg font-semibold text-white">
            {current.question ?? "Loading..."}
          </h3>
        </div>
        <div className="flex gap-2">
          {current.sample_answer && (
            <button
              onClick={onToggleSample}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/5"
            >
              {showSample ? "Hide Sample" : "Show Sample"}
            </button>
          )}
          <button
            onClick={onNext}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-sky-300"
          >
            Next Question
          </button>
        </div>
      </div>

      {current.keywords && (
        <div className="mt-4 text-sm text-gray-300">
          <p className="font-medium text-gray-400">Ideal keywords:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {current.keywords.map((keyword) => (
              <span
                key={keyword}
                className="rounded-full border border-accent/30 px-3 py-1 text-xs text-accent"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <p className="text-sm text-gray-400">Content Match Score</p>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-black/30">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all"
            style={{ width: `${matchScore}%` }}
          />
        </div>
        <p className="mt-1 text-sm font-semibold text-white">{matchScore}%</p>
      </div>

      {showSample && current.sample_answer && (
        <div className="mt-6 rounded-lg bg-black/20 p-3 text-sm text-gray-200">
          <p className="text-xs uppercase tracking-wide text-gray-400">Sample Answer</p>
          <p className="mt-2 leading-relaxed text-gray-100">{current.sample_answer}</p>
        </div>
      )}
    </div>
  );
}

