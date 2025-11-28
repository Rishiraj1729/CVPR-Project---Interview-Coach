export default function MoodPanel({ metrics }) {
  const mood = metrics.mood_label || "Neutral";
  const score = metrics.mood_score ?? 0;
  const micro = metrics.microexpression;
  const colors = {
    Engaged: "text-emerald-300 border-emerald-400/40",
    Neutral: "text-sky-200 border-sky-400/30",
    Tense: "text-yellow-200 border-yellow-400/30"
  };
  const moodColor = colors[mood] || colors.Neutral;

  return (
    <div className="rounded-xl bg-panel p-4 shadow-inner">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">Mood Outlook</p>
          <p className={`text-2xl font-semibold ${moodColor}`}>{mood}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-gray-400">Mood Score</p>
          <p className="text-3xl font-bold text-white">{Math.round(score)}</p>
        </div>
      </div>
      <div className="mt-4">
        <div className="h-2 rounded-full bg-black/20">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-yellow-300"
            style={{ width: `${Math.max(8, Math.min(100, score))}%` }}
          />
        </div>
      </div>
      <div className="mt-4 text-sm text-gray-300">
        <p>Micro-expression monitor</p>
        <p className="text-xs text-gray-400">
          {micro || "Stable face pattern detected."}
        </p>
      </div>
    </div>
  );
}

