"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Prefers an actual German voice when the browser has one installed, but
// falls back to whatever's available with lang="de-DE" set on the
// utterance -- most engines will still pronounce it reasonably well.
// Mobile OSes (iOS/Android) often ship both a compact, robotic-sounding
// default voice and a much better "enhanced"/"premium" one for the same
// language -- the compact one is what's picked without this, which is the
// usual source of a "weird" mobile voice. Prefer the better one when both
// are installed.
function pickGermanVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const germanVoices = voices.filter(
    (v) =>
      v.lang.toLowerCase() === "de-de" || v.lang.toLowerCase().startsWith("de"),
  );
  if (germanVoices.length === 0) return null;
  const enhanced = germanVoices.find((v) =>
    /enhanced|premium|neural/i.test(v.name),
  );
  return enhanced ?? germanVoices[0];
}

export function useSpeechSynthesis() {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // Resolved after mount rather than during render: the server has no
  // window, so checking during render would cause a hydration mismatch.
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);

    voiceRef.current = pickGermanVoice();
    // Chrome loads the voice list asynchronously -- it's often empty on
    // first call, so pick again once the browser finishes loading it.
    const handleVoicesChanged = () => {
      voiceRef.current = pickGermanVoice();
    };
    window.speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged);
    return () => {
      window.speechSynthesis.removeEventListener(
        "voiceschanged",
        handleVoicesChanged,
      );
      window.speechSynthesis.cancel();
    };
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (!text.trim()) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "de-DE";
    // Slightly slower than default (1.0) -- compact mobile voices in
    // particular slur consecutive words together at full speed.
    utterance.rate = 0.92;
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  return { supported, speaking, speak, stop };
}
