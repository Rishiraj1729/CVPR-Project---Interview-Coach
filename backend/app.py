import base64
import re
import time
from difflib import SequenceMatcher
from typing import List, Dict, Any

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit

from cv_utils import VideoProcessor


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["SECRET_KEY"] = "interview-coach-secret"
    CORS(app, resources={r"/*": {"origins": "*"}})
    return app


app = create_app()
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="eventlet",
    ping_interval=25,
    ping_timeout=120,
)
video_processor = VideoProcessor()


def _load_questions() -> List[Dict[str, Any]]:
    return [
        {
            "id": 1,
            "question": "Tell me about yourself",
            "keywords": ["background", "experience", "skills", "current role"],
            "sample_answer": (
                "I am a software engineer with five years of building user-facing "
                "products. Currently at Acme Corp I lead a small squad focused on "
                "shipping realtime collaboration features. I enjoy connecting business "
                "goals to technical execution and mentoring junior developers."
            ),
        },
        {
            "id": 2,
            "question": "Describe a challenging problem you solved",
            "keywords": ["challenge", "solution", "impact", "teamwork"],
            "sample_answer": (
                "Our ingestion pipeline kept missing SLAs during product launches. "
                "I profiled the system, found lock contention in the batching logic, "
                "and redesigned it around asynchronous workers. After the rollout we "
                "cut processing time by 60 percent and resolved the launch incidents."
            ),
        },
        {
            "id": 3,
            "question": "Why do you want this role?",
            "keywords": ["company", "mission", "fit", "growth"],
            "sample_answer": (
                "Your mission to make AI coaching accessible resonates with my work "
                "building learning tools. The role blends product intuition with "
                "hands-on prototyping, which is where I thrive, and I see a clear path "
                "to grow while helping the team scale."
            ),
        },
        {
            "id": 4,
            "question": "Tell me about a time you showed leadership",
            "keywords": ["leadership", "initiative", "result", "team"],
            "sample_answer": (
                "When our manager went on leave I coordinated a cross-team launch. "
                "I set up twice-weekly checkpoints, clarified ownership, and removed "
                "blocking dependencies. The team delivered on time and the process is "
                "now codified as our launch playbook."
            ),
        },
    ]


QUESTIONS = _load_questions()
QUESTION_COUNTER = max(q["id"] for q in QUESTIONS)


def _next_question_id() -> int:
    global QUESTION_COUNTER
    QUESTION_COUNTER += 1
    return QUESTION_COUNTER


def _tokenize(text: str) -> List[str]:
    return re.findall(r"\b\w+\b", text.lower())


@socketio.on("connect")
def handle_connect():
    emit(
        "analysis",
        {
            "message": "Socket connected. Send frames via `video_frame` events.",
            "timestamp": time.time(),
        },
    )


@socketio.on("disconnect")
def handle_disconnect():
    video_processor.reset_state()


@socketio.on("video_frame")
def handle_video_frame(data):
    """
    Expects payload: {"image": "<base64_data>"}
    """
    if not data or "image" not in data:
        emit(
            "analysis",
            {"error": "Missing base64 image", "timestamp": time.time()},
        )
        return

    try:
        metrics = video_processor.process_frame(data["image"])
    except base64.binascii.Error:
        emit("analysis", {"error": "Invalid base64 frame"})
        return
    except Exception as exc:
        emit("analysis", {"error": f"Processing error: {exc}"})
        return

    emit("analysis", metrics)


@app.get("/api/questions")
def get_questions():
    return jsonify({"questions": QUESTIONS})


@app.post("/api/questions")
def create_question():
    payload = request.get_json(force=True, silent=True) or {}
    text = (payload.get("question") or "").strip()
    keywords = payload.get("keywords") or []
    sample = (payload.get("sample_answer") or "").strip()

    if not text:
        return jsonify({"error": "Question text is required"}), 400

    if isinstance(keywords, str):
        keywords = [k.strip() for k in keywords.split(",") if k.strip()]

    if not keywords:
        return jsonify({"error": "At least one keyword is required"}), 400

    question = {
        "id": _next_question_id(),
        "question": text,
        "keywords": keywords,
        "sample_answer": sample,
    }
    QUESTIONS.append(question)
    return jsonify({"question": question}), 201


@app.post("/api/transcript")
def evaluate_transcript():
    payload = request.get_json(force=True, silent=True) or {}
    transcript = (payload.get("transcript") or "").lower()
    question_id = payload.get("questionId")

    question = next((q for q in QUESTIONS if q["id"] == question_id), None)
    if not question:
        return jsonify({"error": "Invalid questionId"}), 400

    keywords = question["keywords"]
    sample_answer = question.get("sample_answer", "")
    if not transcript.strip():
        return jsonify(
            {
                "match_score": 0,
                "sample_score": 0,
                "novelty_score": 0,
                "keywords": keywords,
                "missing_keywords": keywords,
            }
        )

    hits = sum(1 for k in keywords if k.lower() in transcript)
    score = int((hits / len(keywords)) * 100)

    missing = [k for k in keywords if k.lower() not in transcript]
    sample_similarity = SequenceMatcher(None, transcript, sample_answer.lower()).ratio()
    sample_score = int(sample_similarity * 100)

    transcript_tokens = _tokenize(transcript)
    unique_tokens = len(set(transcript_tokens))
    lexical_diversity = unique_tokens / max(len(transcript_tokens), 1)
    novelty = (
        (1 - sample_similarity) * 0.5 + min(1, lexical_diversity) * 0.5
    ) * 100

    return jsonify(
        {
            "match_score": score,
            "sample_score": int(sample_score),
            "novelty_score": int(novelty),
            "keywords": keywords,
            "missing_keywords": missing,
            "sample_answer": sample_answer,
        }
    )


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000)

