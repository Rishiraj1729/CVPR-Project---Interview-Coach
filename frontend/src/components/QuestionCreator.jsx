import { useState } from "react";

export default function QuestionCreator({ onCreate }) {
  const [question, setQuestion] = useState("");
  const [keywords, setKeywords] = useState("");
  const [sample, setSample] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!question.trim() || !keywords.trim()) {
      setStatus("Question and keywords are required.");
      return;
    }
    setIsSubmitting(true);
    setStatus("Saving…");
    try {
      const keywordList = keywords
        .split(",")
        .map((word) => word.trim())
        .filter(Boolean);
      await onCreate({
        question,
        keywords: keywordList,
        sample_answer: sample
      });
      setQuestion("");
      setKeywords("");
      setSample("");
      setStatus("Saved! Added to the practice set.");
    } catch (error) {
      setStatus(error.message || "Failed to save question.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-8 rounded-2xl bg-panel/70 p-5 shadow-inner">
      <h3 className="text-lg font-semibold text-white">Add Custom Question</h3>
      <p className="text-sm text-gray-400">
        Paste interview prompts or sample answers to personalize scoring.
      </p>
      <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="text-xs uppercase text-gray-400">Question</label>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-white outline-none focus:border-accent"
            placeholder="Describe a time you disagreed with your manager…"
          />
        </div>
        <div>
          <label className="text-xs uppercase text-gray-400">
            Ideal keywords (comma separated)
          </label>
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-white outline-none focus:border-accent"
            placeholder="conflict resolution, listening, outcome, alignment"
          />
        </div>
        <div>
          <label className="text-xs uppercase text-gray-400">Sample answer (optional)</label>
          <textarea
            value={sample}
            onChange={(e) => setSample(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-white outline-none focus:border-accent"
            placeholder="I scheduled a sync to understand the concern..."
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{status}</span>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
          >
            {isSubmitting ? "Saving..." : "Add Question"}
          </button>
        </div>
      </form>
    </div>
  );
}

