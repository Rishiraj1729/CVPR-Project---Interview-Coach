## Interview Coach – Real‑Time CV‑Based Behavioural Assessment

Interview Coach is a **real‑time computer‑vision project** that helps users practice interviews by giving **live feedback** on:

- **Engagement & mood** (smile, brows, attention)
- **Eye contact & head pose**
- **Blinking and confidence**
- **Speaking / mouth activity**

The system streams webcam frames from a **React + Vite frontend** to a **Flask + Socket.IO backend**, where a custom **Computer Vision (CV) pipeline** built with **MediaPipe FaceMesh** and **OpenCV + NumPy** converts 3D facial landmarks into interpretable metrics.

---

## 1. Project Architecture

- **Frontend (`frontend/`)**
  - React 18 + Vite
  - `react-webcam` for camera streaming
  - `socket.io-client` for low‑latency communication with the backend
  - Tailwind CSS for a clean UI

- **Backend (`backend/`)**
  - Flask REST API
  - Flask‑SocketIO (eventlet) for real‑time bidirectional communication
  - `cv_utils.VideoProcessor` – core CV engine using MediaPipe + OpenCV
  - `/api/questions` – CRUD for interview questions
  - `/api/transcript` – evaluates a spoken answer against keywords and a sample answer

High‑level flow:

1. Frontend captures frames from webcam.
2. Frames are encoded to base64 and sent over a Socket.IO `video_frame` event.
3. Backend decodes the frame, runs the CV pipeline, and sends back metrics via an `analysis` event.
4. UI visualises **engagement**, **confidence**, **blink count**, **head movement**, **gaze deviation**, **mood label**, and **mouth activity** in real time.

---

## 2. Computer Vision & Feature Pipeline

All CV logic lives in `backend/cv_utils.py` inside the `VideoProcessor` class.

### 2.1 FaceMesh Configuration

```python
self.face_mesh = mp.solutions.face_mesh.FaceMesh(
    static_image_mode=False,
    refine_landmarks=True,
    max_num_faces=1,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
)
```

- **`refine_landmarks=True`**  
  - Enables high‑precision iris and facial contour landmarks.  
  - Critical for **gaze estimation**, **mouth geometry**, and **brow positioning**.
- **`max_num_faces=1`**  
  - Optimised for single‑user interview scenario.
- **Detection / tracking confidence = 0.5**  
  - Balanced to keep **false positives low** while still tracking under moderate lighting changes.

### 2.2 Landmark Geometry

The pipeline uses specific FaceMesh indices:

- **Eyes:** `EYE_LANDMARKS`
- **Iris:** `IRIS_LANDMARKS` (for gaze)
- **Nose tip / ears:** for approximate head pose
- **Mouth & brows:** for expression and mood

All landmarks are converted into a NumPy array of 3D points (x, y scaled by image width/height, z scaled by width).

### 2.3 Core Metrics

#### a) Blink Detection (Eye Aspect Ratio – EAR)

- Uses 6 landmarks per eye.  
- EAR = (sum of two vertical distances) / (2 × horizontal distance).  
- If EAR falls below a **blink threshold** for N consecutive frames, it is counted as a blink.

Purpose:
- Detect **fatigue**, **nervousness**, or **rapid blinking** under stress.

#### b) Head Pose (Pitch & Yaw)

- Approximated from:
  - Vector between **left and right ear** → yaw (left/right turning)
  - Vector from **nose tip to ear midpoint** → pitch (up/down tilt)

Usage:
- High absolute pitch or yaw penalises **confidence_score** and **mood_score**.
- Also used to generate warnings like “Too much head movement detected.”

#### c) Gaze Deviation

- Uses iris center vs. eye corners:
  - Computes ratio of **iris‑to‑left‑corner distance** / **eye width** for each eye.
  - Deviation from the center (≈ 0.5) means looking away.

Usage:
- Higher deviation → lower engagement, lower confidence, and warning:  
  “Maintain eye contact with the camera.”

#### d) Expression, Mood & Micro‑Expressions

From `VideoProcessor._analyze_expression`:

- **Smile ratio** – mouth width / mouth height
- **Mouth activity ratio** – mouth height / width (used for speaking / lip activity)
- **Brow gap** – average distance from brows to eyes, normalised by inter‑ocular distance

These are combined to form a **mood score (0–100)**:

- Positive contributions:
  - Bigger smile ratio (controlled to avoid over‑sensitivity)
  - Relaxed / open brow gap
- Negative contributions:
  - Large pitch/yaw (head tilt)
  - Large gaze deviation

The final score is clamped to \[0, 100\] and translated to:

- `Engaged`
- `Neutral`
- `Tense`

**Micro‑expressions:**

- Detects **sudden changes in smile ratio** beyond a threshold within a short time.  
- Uses a **cooldown** (in frames) so the UI is not spammed with repeated events.

#### e) Mouth / Speaking Activity

- Derived from **vertical mouth opening vs. width**.
- Mapped to a **0–100 score**:
  - 0 = no mouth movement
  - 100 = very active (speaking a lot)

This can later be combined with **audio cues** or **transcript timing** to assess speaking pace and clarity.

---

## 3. Hyperparameter Tuning

Even though this project does not use a heavy deep‑learning model that requires training, it still relies on **many geometric thresholds and coefficients**. These were tuned empirically to balance **stability**, **responsiveness**, and **interpretability**.

### 3.1 Blink Detection Hyperparameters

- `blink_threshold = 0.25`
  - If EAR < 0.25, the eye is considered “closed”.
- `blink_consec_frames = 3`
  - Require at least 3 consecutive frames below threshold to register a blink.
- `recent_ear` window length = 12

**Tuning process:**

1. Recorded several short videos under different lighting and distances.
2. Manually annotated blink events.
3. Swept EAR thresholds in the range **0.18–0.30** and `blink_consec_frames` from **2–4**.
4. Chose parameters that:
   - Remove noise from **partial squints** or minor camera motion.
   - Still detect real blinks with **high precision**, prioritizing fewer false warnings.

### 3.2 Confidence Score Dynamics

Key parameters in `VideoProcessor`:

- `max_confidence = 100.0`
- `min_confidence = 20.0`
- `score_decay = 1.4`
- `score_recovery = 1.0`

And behavioural rules:

- Excessive head movement, looking away, or rapid blinking:
  - Trigger **warnings** and **larger confidence penalties**.
- Calm behaviour across multiple frames:
  - Triggers **gradual recovery** up to `max_confidence`.

**Tuning process:**

- Ran playback of recorded sessions and visualised confidence vs. time.
- Adjusted:
  - **Decay multipliers** for specific behaviours (e.g. excessive head movement gets a larger penalty).
  - **Recovery rate** so that:
    - A user who corrects their behaviour sees confidence climb back within several seconds.
    - But not so fast that the score becomes meaningless.

Outcome:
- Confidence score feels **stable**, not too “jumpy”, but still reacts clearly to sustained bad habits.

### 3.3 Mood & Engagement Coefficients

In `_analyze_expression`, the mood score is a weighted combination of:

- Smile ratio vs. neutral baseline
- Brow gap vs. neutral baseline
- Head pose (pitch, yaw)
- Gaze deviation

Each term has a **hand‑tuned weight**:

- Smile ratio multiplier – controls how much a smile boosts engagement.
- Brow gap multiplier – indicates tension vs. relaxed expression.
- Pose penalty (deg × factor) – discourages looking far away from the camera.
- Gaze penalty – heavily penalises looking away from screen for too long.

**Tuning process:**

1. Captured a small set of clips labelled by humans as **Engaged**, **Neutral**, or **Tense**.
2. Computed metrics for each frame and adjusted:
   - Base mood offset.
   - Each weighting coefficient.
3. Target behaviour:
   - Engaged users: mood score typically **> 70**.
   - Neutral users: around **40–70**.
   - Very tense / disengaged users: **< 40**.

This is a **rule‑based model**, which makes it **explainable**:

- You can say *why* the mood is low (e.g. “gaze deviation is high” or “brows are tense”) instead of returning a black‑box probability.

### 3.4 Micro‑Expression and Movement Cooldowns

- `microexpression_cooldown = 25` frames
  - At ~25 FPS, ≈ 1 second.
  - After detecting a sudden expression change, we wait 25 frames before flagging another.
- `movement_cooldown = 15` frames
  - Prevents over‑counting continuous head movement as many separate events.

These cooldowns were tuned to:

- Provide **salient events** (micro‑expression detected) rather than noisy, repeated triggers.
- Keep event detections interpretable on a time axis.

---

## 4. Backend API & Socket Endpoints

### 4.1 Socket Events

- **`video_frame` (client → server)**  
  Payload: `{ "image": "<base64-encoded-frame>" }`

- **`analysis` (server → client)**  
  Example fields:
  - `confidence_score`
  - `blink_count`
  - `head_pitch`, `head_yaw`
  - `gaze_deviation`
  - `mood_score`, `mood_label`
  - `mouth_activity`
  - `microexpression` (when detected)
  - `warning` (e.g. “Maintain eye contact with the camera.”)

### 4.2 REST Endpoints

- `GET /api/questions`
  - Returns the list of interview questions, keywords, and sample answers.

- `POST /api/questions`
  - Adds new custom questions with associated keywords.

- `POST /api/transcript`
  - Input: user’s spoken answer transcript + `questionId`.
  - Output:
    - Keyword **match_score**
    - **sample_score**: similarity vs. sample answer
    - **novelty_score**: how original / diverse the wording is
    - Missing keywords

This ties the **verbal content** of the answer to the **non‑verbal behaviour** captured by the CV pipeline.

---

## 5. How to Run the Project

### 5.1 Prerequisites

- Python 3.10+ (recommended)
- Node.js 18+ and npm
- A webcam

### 5.2 Backend Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r requirements.txt
python app.py
```

Backend will listen on **`http://127.0.0.1:5000`**.

### 5.3 Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open the printed **`http://localhost:5173`** (or alternative port if 5173 is busy).

---

## 6. Possible Extensions

- Adaptive, per‑user calibration of:
  - Blink threshold
  - Baseline mood coefficients
  - Gaze deviation tolerance (for users with glasses, different setups)
- Audio analysis:
  - Sentiment and prosody analysis
  - Filler word detection (“um”, “uh”, etc.)
- Deep‑learning based emotion estimation:
  - Combine rule‑based features with a lightweight CNN/transformer model for more nuanced emotion labels.
- Session analytics:
  - Historical plots of confidence, mood, and gaze per question.
  - Comparison across multiple interview practice sessions.

---

## 7. Summary

This project demonstrates an **end‑to‑end Computer Vision system**:

- Real‑time webcam ingestion (frontend).
- Robust landmark extraction (MediaPipe FaceMesh).
- Hand‑crafted, interpretable geometric features (OpenCV + NumPy).
- Hyperparameter‑tuned scores for **engagement**, **mood**, **confidence**, and **activity**.
- A modern UI that provides **actionable feedback** for interview preparation.


