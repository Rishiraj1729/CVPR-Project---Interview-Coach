export default function AnalyticsPanel({ history }) {
  if (!history.length) {
    return (
      <div className="rounded-xl bg-panel p-4 text-sm text-gray-400">
        Analytics will appear once the session collects some data.
      </div>
    );
  }

  const last = history[history.length - 1];
  const avgConfidence =
    history.reduce((sum, item) => sum + (item.confidence_score || 0), 0) /
    history.length;

  const warnings = history.filter((item) => Boolean(item.warning)).length;
  const avgGaze =
    history.reduce((sum, item) => sum + (item.gaze_deviation || 0), 0) /
    history.length;
  const avgMood =
    history.reduce((sum, item) => sum + (item.mood_score || 0), 0) /
    history.length;

  const attentionScore = Math.max(
    0,
    Math.min(100, Math.round(100 - warnings * 3 - avgGaze * 120))
  );

  const durationMs = history[history.length - 1].timestamp - history[0].timestamp;
  const blinkTotal = last.blink_count || 0;
  const blinkRate =
    durationMs > 0 ? Math.round((blinkTotal / (durationMs / 60000)) * 10) / 10 : 0;

  const trend = history
    .slice(-24)
    .map((item) => Math.max(0, Math.min(100, item.confidence_score || 0)));

  return (
    <div className="rounded-xl bg-panel p-4 shadow-inner">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Live Analytics</h3>
        <span className="text-xs uppercase tracking-wide text-gray-400">
          Updated in real-time
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <AnalyticsCard label="Avg Confidence" value={`${Math.round(avgConfidence)}%`} />
        <AnalyticsCard label="Attention" value={`${attentionScore}%`} accent />
        <AnalyticsCard label="Mood Score" value={`${Math.round(avgMood)}%`} />
        <AnalyticsCard label="Blink rate" value={`${blinkRate}/min`} />
        <AnalyticsCard label="Warnings" value={warnings} />
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>Confidence trend</span>
          <span>{trend.length} samples</span>
        </div>
        <div className="mt-3 flex h-28 items-end gap-1 rounded-xl bg-black/20 p-2">
          {trend.map((value, index) => (
            <div
              key={`${value}-${index}`}
              className="flex-1 rounded bg-accent/60"
              style={{ height: `${Math.max(6, value)}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AnalyticsCard({ label, value, accent = false }) {
  return (
    <div
      className={`rounded-lg px-3 py-3 ${
        accent ? "bg-accent/10 text-accent" : "bg-black/10 text-white"
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

