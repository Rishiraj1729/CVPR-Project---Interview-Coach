export default function MetricsPanel({ metrics }) {
  const rows = [
    { label: "Confidence", value: `${metrics.confidence_score ?? 0}%` },
    { label: "Blink Count", value: metrics.blink_count ?? 0 },
    { label: "Head Pitch", value: `${metrics.head_pitch ?? "--"}°` },
    { label: "Head Yaw", value: `${metrics.head_yaw ?? "--"}°` },
    { label: "Gaze Deviation", value: metrics.gaze_deviation ?? "--" },
    { label: "Movement Alerts", value: metrics.movement_alerts ?? 0 }
  ];

  return (
    <div className="rounded-xl bg-panel p-4 shadow-inner">
      <h3 className="text-lg font-semibold">Live Metrics</h3>
      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between rounded-lg bg-black/10 px-3 py-2 text-sm"
          >
            <span className="text-gray-400">{row.label}</span>
            <span className="font-medium text-white">{row.value}</span>
          </div>
        ))}
      </div>
      {metrics.warning && (
        <div className="mt-4 rounded-lg bg-yellow-500/20 px-3 py-2 text-sm text-yellow-200">
          ⚠️ {metrics.warning}
        </div>
      )}
    </div>
  );
}

