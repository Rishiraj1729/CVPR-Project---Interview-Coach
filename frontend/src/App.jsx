import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Webcam from "react-webcam";
import { io } from "socket.io-client";
import MetricsPanel from "./components/MetricsPanel.jsx";
import QuestionPanel from "./components/QuestionPanel.jsx";
import AnalyticsPanel from "./components/AnalyticsPanel.jsx";
import SessionSummary from "./components/SessionSummary.jsx";
import AnswerInsights from "./components/AnswerInsights.jsx";
import MoodPanel from "./components/MoodPanel.jsx";
import QuestionCreator from "./components/QuestionCreator.jsx";
import LipSyncPanel from "./components/LipSyncPanel.jsx";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition.js";

const BACKEND_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const socket = io(BACKEND_URL, {
  transports: ["websocket"],
  autoConnect: false
});

export default function App() {
  const webcamRef = useRef(null);
  const sessionActiveRef = useRef(true);
  const [metrics, setMetrics] = useState({
    confidence_score: 100,
    blink_count: 0
  });
  const [questions, setQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [matchScore, setMatchScore] = useState(0);
  const [sessionActive, setSessionActive] = useState(true);
  const [metricsHistory, setMetricsHistory] = useState([]);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [sampleScore, setSampleScore] = useState(0);
  const [noveltyScore, setNoveltyScore] = useState(0);
  const [missingKeywords, setMissingKeywords] = useState([]);
  const [showSampleAnswer, setShowSampleAnswer] = useState(false);
  const [speechEnergy, setSpeechEnergy] = useState(0);
  const speechEnergyRef = useRef(0);
  const transcriptStatsRef = useRef({ words: 0, timestamp: Date.now() });
  const [lipSyncScore, setLipSyncScore] = useState(100);
  const [lipSyncStatus, setLipSyncStatus] = useState("Synced");

  const { transcript, isSupported, start, stop, isListening, resetTranscript } =
    useSpeechRecognition({
      onResult: (text) => {
        debouncedSendTranscript(text);
      }
    });

  const debouncedSendTranscript = useMemo(() => {
    let timeout;
    return (text) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        sendTranscript(text);
      }, 1000);
    };
  }, []);

  useEffect(() => {
    const now = Date.now();
    const words = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
    const prevStats = transcriptStatsRef.current;
    const deltaWords = Math.max(0, words - (prevStats.words || 0));
    const deltaTime = Math.max(500, now - (prevStats.timestamp || now));
    const wordsPerMinute = (deltaWords / deltaTime) * 60000;
    const energy = Math.max(0, Math.min(100, (wordsPerMinute / 140) * 100));
    setSpeechEnergy(energy);
    speechEnergyRef.current = energy;
    transcriptStatsRef.current = { words, timestamp: now };
  }, [transcript]);

  useEffect(() => {
    sessionActiveRef.current = sessionActive;
  }, [sessionActive]);

  const fetchQuestions = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/questions`);
      const data = await response.json();
      const list = data.questions || [];
      setQuestions(list);
      return list;
    } catch {
      setQuestions([]);
      return [];
    }
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const computeLipSync = useCallback(
    (mouthActivity) => {
      const diff = Math.abs((mouthActivity || 0) - speechEnergyRef.current);
      const score = Math.max(0, 100 - diff);
      const status = score > 70 ? "Synced" : score > 45 ? "Loosely Synced" : "Off-sync";
      return { score, status };
    },
    []
  );

  useEffect(() => {
    socket.connect();
    const listener = (payload) => {
      setMetrics((prev) => {
        const updated = { ...prev, ...payload };
        const mouthActivity =
          payload?.mouth_activity ?? updated.mouth_activity ?? prev.mouth_activity ?? 0;
        const { score, status } = computeLipSync(mouthActivity);
        setLipSyncScore(score);
        setLipSyncStatus(status);
        if (sessionActiveRef.current) {
          setMetricsHistory((history) => {
            const next = [
              ...history,
              {
                ...updated,
                timestamp: Date.now(),
                speech_energy: speechEnergyRef.current,
                lip_sync_score: score,
              },
            ];
            return next.length > 600 ? next.slice(-600) : next;
          });
        }
        return updated;
      });
    };
    socket.on("analysis", listener);
    return () => {
      socket.off("analysis", listener);
      socket.disconnect();
    };
  }, [computeLipSync]);

  useEffect(() => {
    if (!sessionActive) return undefined;
    const interval = setInterval(() => {
      const webcam = webcamRef.current;
      if (!webcam) return;
      const imageSrc = webcam.getScreenshot();
      if (!imageSrc) return;
      socket.emit("video_frame", { image: imageSrc });
    }, 100);
    return () => clearInterval(interval);
  }, [sessionActive]);

  const sendTranscript = useCallback(
    async (text) => {
      if (!text || !questions[questionIndex] || !sessionActiveRef.current) return;
      try {
        const response = await fetch(`${BACKEND_URL}/api/transcript`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: questions[questionIndex].id,
            transcript: text
          })
        });
        const data = await response.json();
        if (data.match_score != null) {
          setMatchScore(data.match_score);
          setSampleScore(data.sample_score ?? 0);
          setNoveltyScore(data.novelty_score ?? 0);
          setMissingKeywords(data.missing_keywords ?? []);
        }
      } catch (error) {
        console.error("Transcript error:", error);
      }
    },
    [questions, questionIndex]
  );

  const cycleQuestion = () => {
    setQuestionIndex((prev) => (questions.length ? (prev + 1) % questions.length : 0));
    setMatchScore(0);
    setSampleScore(0);
    setNoveltyScore(0);
    setMissingKeywords([]);
    setShowSampleAnswer(false);
  };

  const summarizeHistory = useCallback((history, answerStats) => {
    if (!history.length) return null;
    const startTime = history[0].timestamp;
    const endTime = history[history.length - 1].timestamp;
    const durationMs = Math.max(0, endTime - startTime);
    const durationSeconds = Math.max(1, durationMs / 1000);
    const avgConfidence =
      history.reduce((sum, item) => sum + (item.confidence_score || 0), 0) /
      history.length;
    const warnings = history.filter((item) => Boolean(item.warning)).length;
    const avgGaze =
      history.reduce((sum, item) => sum + (item.gaze_deviation || 0), 0) /
      history.length;
    const attention = Math.max(
      0,
      Math.min(100, Math.round(100 - warnings * 4 - avgGaze * 140))
    );
    const blinkTotal = history[history.length - 1].blink_count || 0;
    const blinkRate =
      durationMs > 0 ? Math.round((blinkTotal / (durationMs / 60000)) * 10) / 10 : 0;
    const headMovementEvents = history.filter(
      (item) =>
        Math.abs(item.head_pitch || 0) > 18 || Math.abs(item.head_yaw || 0) > 22
    ).length;
    const moodValues = history
      .map((item) => item.mood_score)
      .filter((value) => typeof value === "number");
    const avgMood =
      moodValues.length > 0
        ? moodValues.reduce((sum, value) => sum + value, 0) / moodValues.length
        : 60;
    const lipValues = history
      .map((item) => item.lip_sync_score)
      .filter((value) => typeof value === "number");
    const avgLipSync =
      lipValues.length > 0
        ? lipValues.reduce((sum, value) => sum + value, 0) / lipValues.length
        : lipSyncScore;

    const minutes = Math.floor(durationSeconds / 60);
    const seconds = Math.max(1, Math.round(durationSeconds % 60));
    const durationLabel = minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;

    const suggestions = [];
    if (attention < 70) {
      suggestions.push("Lock your gaze on the camera to project stronger engagement.");
    }
    if (blinkRate > 25) {
      suggestions.push("Slow your blinking cadence to convey calmness.");
    }
    if (headMovementEvents > 10) {
      suggestions.push("Anchor your posture—excessive nodding was detected.");
    }
    if (!suggestions.length) {
      suggestions.push("Solid session! Keep iterating on your stories for mastery.");
    }

    const compositeScore = Math.round(
      avgConfidence * 0.33 +
        attention * 0.18 +
        (answerStats.sampleScore || 0) * 0.14 +
        (answerStats.noveltyScore || 0) * 0.1 +
        avgMood * 0.12 +
        avgLipSync * 0.08 +
        Math.max(0, 100 - warnings * 3) * 0.05
    );

    return {
      durationSeconds,
      durationLabel,
      avgConfidence: Math.round(avgConfidence),
      attention,
      blinkTotal,
      blinkRate,
      warnings,
      headMovementEvents,
      suggestions,
      avgMood: Math.round(avgMood),
      compositeScore,
      sampleScore: Math.round(answerStats.sampleScore || 0),
      noveltyScore: Math.round(answerStats.noveltyScore || 0),
      matchScore: Math.round(answerStats.matchScore || 0),
      lipSyncAverage: Math.round(avgLipSync),
    };
  }, [lipSyncScore]);

  const handleEndSession = () => {
    if (!sessionActiveRef.current) return;
    setSessionActive(false);
    stop();
    const summary = summarizeHistory(metricsHistory, {
      sampleScore,
      noveltyScore,
      matchScore
    });
    setSessionSummary(summary);
  };

  const handleRestart = () => {
    setSessionSummary(null);
    setMetricsHistory([]);
    setMetrics({ confidence_score: 100, blink_count: 0 });
    setMatchScore(0);
    setSampleScore(0);
    setNoveltyScore(0);
    setMissingKeywords([]);
    setShowSampleAnswer(false);
    setLipSyncScore(100);
    setLipSyncStatus("Synced");
    resetTranscript();
    setSessionActive(true);
    if (isSupported) {
      start();
    }
  };

  const handleCreateQuestion = async (payload) => {
    const response = await fetch(`${BACKEND_URL}/api/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Unable to add question");
    }
    const data = await response.json();
    const list = await fetchQuestions();
    const newIndex = list.findIndex((q) => q.id === data.question.id);
    setQuestionIndex(newIndex >= 0 ? newIndex : Math.max(list.length - 1, 0));
    setMatchScore(0);
    setSampleScore(0);
    setNoveltyScore(0);
    setMissingKeywords([]);
    setShowSampleAnswer(Boolean(data.question.sample_answer));
  };

  return (
    <main className="min-h-screen bg-surface p-6 text-white">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Real-time AI Interview Coach</h1>
        <p className="text-gray-400">
          Practice interviews with live body-language feedback and performance analytics.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl bg-black/50 p-4">
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              className="aspect-video w-full rounded-xl border border-white/10 object-cover"
            />
            {!sessionActive && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-lg font-semibold text-white">
                Session paused
              </div>
            )}
            {metrics.warning && (
              <div className="absolute bottom-4 left-4 rounded-lg bg-black/60 px-4 py-2 text-sm text-yellow-200">
                {metrics.warning}
              </div>
            )}
            {lipSyncStatus === "Off-sync" && sessionActive && (
              <div className="absolute bottom-4 right-4 rounded-lg bg-red-500/20 px-4 py-2 text-sm text-red-100">
                Lip sync looks off — adjust mic or speak up.
              </div>
            )}
            <div className="absolute right-4 top-4 rounded-lg bg-black/60 px-4 py-2 text-sm">
              Confidence: {metrics.confidence_score ?? "--"}%
            </div>
          </div>

          <div className="rounded-xl bg-panel p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Speech Recognition</p>
                <p className="text-lg font-semibold">
                  {isSupported ? (isListening ? "Listening..." : "Ready") : "Unsupported"}
                </p>
              </div>
              {isSupported && (
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={start}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-slate-900"
                  >
                    Start
                  </button>
                  <button
                    onClick={stop}
                    className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Stop
                  </button>
                  <button
                    onClick={handleEndSession}
                    className="rounded-lg border border-red-400/60 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-400/10"
                  >
                    End Session
                  </button>
                </div>
              )}
            </div>
            <div className="mt-4 h-32 overflow-y-auto rounded-lg bg-black/20 p-3 text-sm text-gray-200">
              {transcript || "Say your answer to start generating feedback..."}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <QuestionPanel
            questions={questions}
            currentIndex={questionIndex}
            onNext={cycleQuestion}
            matchScore={matchScore}
            showSample={showSampleAnswer}
            onToggleSample={() => setShowSampleAnswer((prev) => !prev)}
          />
          <MetricsPanel metrics={metrics} />
          <MoodPanel metrics={metrics} />
          <LipSyncPanel score={lipSyncScore} status={lipSyncStatus} energy={speechEnergy} />
          <AnalyticsPanel history={metricsHistory} />
          <AnswerInsights
            matchScore={matchScore}
            sampleScore={sampleScore}
            noveltyScore={noveltyScore}
            missingKeywords={missingKeywords}
          />
        </div>
      </section>

      {sessionSummary && (
        <div className="mt-8">
          <SessionSummary summary={sessionSummary} onRestart={handleRestart} />
        </div>
      )}

      <QuestionCreator onCreate={handleCreateQuestion} />
    </main>
  );
}

