import { useEffect, useRef, useState } from "react";

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

export function useSpeechRecognition({ onResult, autoStart = false } = {}) {
  const recognitionRef = useRef(null);
  const [isSupported] = useState(Boolean(SpeechRecognition));
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((res) => res[0].transcript)
        .join(" ");
      setTranscript(text);
      onResult?.(text);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  }, [onResult]);

  useEffect(() => {
    if (autoStart && isSupported && recognitionRef.current && !isListening) {
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, isSupported]);

  const start = () => {
    if (!recognitionRef.current) return;
    recognitionRef.current.start();
    setIsListening(true);
  };

  const stop = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const resetTranscript = () => setTranscript("");

  return {
    isSupported,
    isListening,
    transcript,
    start,
    stop,
    resetTranscript
  };
}

