import base64
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, Optional

import cv2
import mediapipe as mp
import numpy as np


def _decode_base64_frame(data: str) -> np.ndarray:
    bytes_data = base64.b64decode(data.split(",")[-1])
    array = np.frombuffer(bytes_data, dtype=np.uint8)
    frame = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("Unable to decode frame")
    return frame


def _euclidean_distance(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.linalg.norm(a - b))


EYE_LANDMARKS = {
    "left": [33, 160, 158, 133, 153, 144],
    "right": [362, 385, 387, 263, 373, 380],
}
IRIS_LANDMARKS = {"left": 468, "right": 473}
NOSE_TIP = 1
LEFT_EAR = 234
RIGHT_EAR = 454
MOUTH_LANDMARKS = {"left": 61, "right": 291, "top": 13, "bottom": 14}
BROW_LANDMARKS = {
    "left": 105,
    "right": 334,
    "eye_left": 33,
    "eye_right": 263,
}


def _eye_aspect_ratio(points: np.ndarray) -> float:
    # points order: [p1, p2, p3, p4, p5, p6]
    vertical = _euclidean_distance(points[1], points[5]) + _euclidean_distance(
        points[2], points[4]
    )
    horizontal = _euclidean_distance(points[0], points[3])
    if horizontal == 0:
        return 0.0
    return vertical / (2.0 * horizontal)


@dataclass
class VideoMetrics:
    blink_count: int = 0
    confidence_score: float = 100.0
    last_warning: Optional[str] = None
    head_movement_score: float = 0.0
    gaze_deviation_score: float = 0.0
    head_movement_events: int = 0
    mood_score: float = 70.0
    mood_label: str = "Neutral"
    microexpression: Optional[str] = None
    mouth_activity_score: float = 0.0


@dataclass
class VideoProcessor:
    blink_threshold: float = 0.25
    blink_consec_frames: int = 3
    max_confidence: float = 100.0
    min_confidence: float = 20.0
    score_decay: float = 1.4
    score_recovery: float = 1.0
    recent_ear: Deque[float] = field(default_factory=lambda: deque(maxlen=12))
    consecutive_blink_frames: int = 0
    calm_frames: int = 0
    movement_cooldown: int = 0
    metrics: VideoMetrics = field(default_factory=VideoMetrics)
    last_smile_ratio: float = 0.0
    microexpression_cooldown: int = 0

    def __post_init__(self):
        self.face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=False,
            refine_landmarks=True,
            max_num_faces=1,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

    def reset_state(self):
        self.metrics = VideoMetrics()
        self.recent_ear.clear()
        self.consecutive_blink_frames = 0
        self.calm_frames = 0
        self.movement_cooldown = 0
        self.last_smile_ratio = 0.0
        self.microexpression_cooldown = 0

    def process_frame(self, base64_frame: str) -> Dict:
        frame = _decode_base64_frame(base64_frame)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.face_mesh.process(rgb)

        if not results.multi_face_landmarks:
            self.metrics.confidence_score = max(
                self.min_confidence, self.metrics.confidence_score - self.score_decay
            )
            return self._build_response(warning="Face not detected")

        face_landmarks = results.multi_face_landmarks[0]
        h, w, _ = frame.shape
        points = np.array(
            [
                [lm.x * w, lm.y * h, lm.z * w]
                for lm in face_landmarks.landmark
            ],
            dtype=np.float32,
        )

        ear_left = self._compute_eye_ratio(points, "left")
        ear_right = self._compute_eye_ratio(points, "right")
        ear = (ear_left + ear_right) / 2.0
        self.recent_ear.append(ear)

        self._track_blinks(ear)
        head_pitch, head_yaw = self._estimate_head_pose(points)
        gaze_deviation = self._estimate_gaze(points)
        (
            mood_score,
            mood_label,
            microexpression,
            mouth_activity,
        ) = self._analyze_expression(points, head_pitch, head_yaw, gaze_deviation)
        self.metrics.mood_score = mood_score
        self.metrics.mood_label = mood_label
        if microexpression:
            self.metrics.microexpression = microexpression
        self.metrics.mouth_activity_score = mouth_activity

        warning = self._update_confidence(head_pitch, head_yaw, gaze_deviation)

        return self._build_response(
            head_pitch=head_pitch,
            head_yaw=head_yaw,
            gaze=gaze_deviation,
            mood_score=mood_score,
            mood_label=mood_label,
            mouth_activity=mouth_activity,
            warning=warning,
        )

    def _compute_eye_ratio(self, points: np.ndarray, eye: str) -> float:
        idx = EYE_LANDMARKS[eye]
        return _eye_aspect_ratio(points[idx])

    def _track_blinks(self, ear: float):
        if ear < self.blink_threshold:
            self.consecutive_blink_frames += 1
        else:
            if self.consecutive_blink_frames >= self.blink_consec_frames:
                self.metrics.blink_count += 1
            self.consecutive_blink_frames = 0

    def _estimate_head_pose(self, points: np.ndarray) -> tuple[float, float]:
        nose = points[NOSE_TIP]
        left_ear = points[LEFT_EAR]
        right_ear = points[RIGHT_EAR]

        ear_vec = right_ear - left_ear
        yaw = np.degrees(np.arctan2(ear_vec[1], ear_vec[0]))

        nose_to_center = nose - ((left_ear + right_ear) / 2)
        pitch = np.degrees(np.arctan2(nose_to_center[2], nose_to_center[1]))
        return pitch, yaw

    def _estimate_gaze(self, points: np.ndarray) -> float:
        iris_left = points[IRIS_LANDMARKS["left"]]
        iris_right = points[IRIS_LANDMARKS["right"]]
        left_eye = points[EYE_LANDMARKS["left"]]
        right_eye = points[EYE_LANDMARKS["right"]]

        def _gaze_ratio(eye_pts, iris):
            left_corner = eye_pts[0]
            right_corner = eye_pts[3]
            horizontal_range = _euclidean_distance(left_corner, right_corner)
            dist_left = _euclidean_distance(iris, left_corner)
            if horizontal_range == 0:
                return 0.5
            return dist_left / horizontal_range

        left_ratio = _gaze_ratio(left_eye, iris_left)
        right_ratio = _gaze_ratio(right_eye, iris_right)
        deviation = abs(((left_ratio + right_ratio) / 2) - 0.5)
        self.metrics.gaze_deviation_score = deviation
        return deviation

    def _analyze_expression(
        self, points: np.ndarray, pitch: float, yaw: float, gaze: float
    ) -> tuple[float, str, Optional[str], float]:
        mouth_left = points[MOUTH_LANDMARKS["left"]]
        mouth_right = points[MOUTH_LANDMARKS["right"]]
        mouth_top = points[MOUTH_LANDMARKS["top"]]
        mouth_bottom = points[MOUTH_LANDMARKS["bottom"]]
        eye_left = points[BROW_LANDMARKS["eye_left"]]
        eye_right = points[BROW_LANDMARKS["eye_right"]]
        brow_left = points[BROW_LANDMARKS["left"]]
        brow_right = points[BROW_LANDMARKS["right"]]

        mouth_width = _euclidean_distance(mouth_left, mouth_right)
        mouth_height = _euclidean_distance(mouth_top, mouth_bottom)
        smile_ratio = mouth_width / max(mouth_height, 1e-6)
        mouth_activity_ratio = mouth_height / max(mouth_width, 1e-6)

        inter_ocular = _euclidean_distance(eye_left, eye_right)
        brow_gap = (
            _euclidean_distance(brow_left, eye_left)
            + _euclidean_distance(brow_right, eye_right)
        ) / (2 * max(inter_ocular, 1e-6))

        base_mood = 60.0
        mood_score = base_mood + (smile_ratio - 2.5) * 12
        mood_score += (brow_gap - 0.05) * 50
        mood_score -= (abs(pitch) + abs(yaw)) * 0.5
        mood_score -= gaze * 70
        mood_score = max(0.0, min(100.0, mood_score))

        if mood_score > 70:
            mood_label = "Engaged"
        elif mood_score < 40:
            mood_label = "Tense"
        else:
            mood_label = "Neutral"

        microexpression = None
        if self.microexpression_cooldown > 0:
            self.microexpression_cooldown -= 1

        if abs(smile_ratio - self.last_smile_ratio) > 1.0 and self.microexpression_cooldown == 0:
            microexpression = "Detected sudden facial change"
            self.microexpression_cooldown = 25

        lip_activity_score = max(
            0.0, min(100.0, (mouth_activity_ratio - 0.06) * 1600)
        )

        self.last_smile_ratio = smile_ratio
        return round(mood_score, 1), mood_label, microexpression, round(lip_activity_score, 1)

    def _update_confidence(self, pitch: float, yaw: float, gaze: float) -> Optional[str]:
        warning = None
        excessive_head = abs(pitch) > 15 or abs(yaw) > 20
        looking_away = gaze > 0.2
        rapid_blink = (
            len(self.recent_ear) == self.recent_ear.maxlen
            and sum(ear < self.blink_threshold for ear in self.recent_ear) > 4
        )

        if self.movement_cooldown > 0:
            self.movement_cooldown -= 1

        if excessive_head:
            warning = "Too much head movement detected."
            if self.movement_cooldown == 0:
                self.metrics.head_movement_events += 1
                self.movement_cooldown = 15
        elif looking_away:
            warning = "Maintain eye contact with the camera."
        elif rapid_blink:
            warning = "Blinking rapidly detected."

        if warning:
            self.calm_frames = 0
            penalty_multiplier = 1.0
            if excessive_head:
                penalty_multiplier = 1.5
            elif rapid_blink:
                penalty_multiplier = 1.2
            self.metrics.confidence_score = max(
                self.min_confidence,
                self.metrics.confidence_score - (self.score_decay * penalty_multiplier),
            )
            self.metrics.last_warning = warning
        else:
            self.calm_frames = min(self.calm_frames + 1, 20)
            recovery_boost = self.score_recovery * (1 + self.calm_frames / 20)
            self.metrics.confidence_score = min(
                self.max_confidence, self.metrics.confidence_score + recovery_boost
            )
            if self.metrics.confidence_score == self.max_confidence:
                self.metrics.last_warning = None

        return warning

    def _build_response(
        self,
        head_pitch: float | None = None,
        head_yaw: float | None = None,
        gaze: float | None = None,
        mood_score: float | None = None,
        mood_label: Optional[str] = None,
        mouth_activity: float | None = None,
        warning: Optional[str] = None,
    ) -> Dict:
        warning = warning or self.metrics.last_warning
        payload = {
            "confidence_score": round(self.metrics.confidence_score, 1),
            "blink_count": self.metrics.blink_count,
            "warning": warning,
            "movement_alerts": self.metrics.head_movement_events,
        }
        if head_pitch is not None:
            payload["head_pitch"] = round(float(head_pitch), 2)
        if head_yaw is not None:
            payload["head_yaw"] = round(float(head_yaw), 2)
        if gaze is not None:
            payload["gaze_deviation"] = round(float(gaze), 3)
        if mood_score is not None:
            payload["mood_score"] = round(float(mood_score), 1)
        if mood_label is not None:
            payload["mood_label"] = mood_label
        if self.metrics.microexpression:
            payload["microexpression"] = self.metrics.microexpression
            if self.microexpression_cooldown < 10:
                self.metrics.microexpression = None
        if mouth_activity is not None:
            payload["mouth_activity"] = mouth_activity
        return payload

