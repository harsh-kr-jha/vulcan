"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const VIDEO_URL = "https://zxdefgavgwfxastwmmjm.supabase.co/storage/v1/object/public/assets/ion.mp4";
const FADE_DURATION_MS = 900;

function CrossfadeVideos() {
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([null, null]);
  const frontIndex = useRef<0 | 1>(0);
  const incomingIndex = useRef<0 | 1>(1);
  const transitioning = useRef(false);
  const completionTimer = useRef<number | null>(null);
  const animationFrame = useRef<number | null>(null);
  const mounted = useRef(true);
  const [visibleIndex, setVisibleIndex] = useState<0 | 1>(0);
  const [failed, setFailed] = useState(false);

  const finishDissolve = useCallback(() => {
    if (!transitioning.current) return;
    const outgoing = frontIndex.current;
    const incoming = incomingIndex.current;
    const outgoingPlayer = videoRefs.current[outgoing];

    if (completionTimer.current !== null) {
      window.clearTimeout(completionTimer.current);
      completionTimer.current = null;
    }
    outgoingPlayer?.pause();
    frontIndex.current = incoming;
    transitioning.current = false;
  }, []);

  const startDissolve = useCallback(async (playerIndex: 0 | 1) => {
    const outgoing = videoRefs.current[playerIndex];
    if (
      !outgoing
      || playerIndex !== frontIndex.current
      || transitioning.current
      || !Number.isFinite(outgoing.duration)
      || outgoing.duration <= 1
      || outgoing.currentTime < outgoing.duration - 1
    ) return;

    const standbyIndex = (playerIndex === 0 ? 1 : 0) as 0 | 1;
    const standby = videoRefs.current[standbyIndex];
    if (!standby || !standby.paused) return;

    transitioning.current = true;
    incomingIndex.current = standbyIndex;
    try {
      standby.currentTime = 0;
      await standby.play();
    } catch {
      transitioning.current = false;
      setFailed(true);
      return;
    }
    if (!mounted.current) return;

    animationFrame.current = window.requestAnimationFrame(() => {
      setVisibleIndex(standbyIndex);
      completionTimer.current = window.setTimeout(finishDissolve, FADE_DURATION_MS + 120);
    });
  }, [finishDissolve]);

  useEffect(() => {
    mounted.current = true;
    const players = videoRefs.current;
    const onVisibilityChange = () => {
      if (document.hidden) {
        players.forEach((player) => player?.pause());
      } else {
        const active = transitioning.current ? incomingIndex.current : frontIndex.current;
        void players[active]?.play().catch(() => setFailed(true));
        if (transitioning.current) void players[frontIndex.current]?.play().catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (completionTimer.current !== null) window.clearTimeout(completionTimer.current);
      if (animationFrame.current !== null) window.cancelAnimationFrame(animationFrame.current);
      players.forEach((player) => player?.pause());
    };
  }, []);

  if (failed) return null;

  return (
    <div className="fixed inset-0 z-0 h-[100svh] w-screen overflow-hidden bg-[#04070f]" aria-hidden="true">
      {([0, 1] as const).map((index) => (
        <video
          key={index}
          ref={(element) => { videoRefs.current[index] = element; }}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[900ms] ease-linear ${visibleIndex === index ? "opacity-100" : "opacity-0"}`}
          src={VIDEO_URL}
          autoPlay={index === 0}
          muted
          playsInline
          preload="auto"
          onError={() => setFailed(true)}
          onTimeUpdate={() => void startDissolve(index)}
          onTransitionEnd={(event) => {
            if (event.propertyName === "opacity" && transitioning.current && index === incomingIndex.current) {
              finishDissolve();
            }
          }}
          tabIndex={-1}
        />
      ))}
    </div>
  );
}

export function IonVideoBackground() {
  const [motion, setMotion] = useState<"pending" | "full" | "reduce">("pending");

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotion(preference.matches ? "reduce" : "full");
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  if (motion !== "full") return null;
  return <CrossfadeVideos />;
}
