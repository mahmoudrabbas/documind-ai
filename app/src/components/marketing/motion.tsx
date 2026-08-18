"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

type RevealState = {
  revealed: boolean;
  reducedMotion: boolean;
};

/** One-shot marketing reveal with a no-motion fallback and observer cleanup. */
export function useRevealOnView(ref: RefObject<Element | null>): RevealState {
  const [revealed, setRevealed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const revealedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const reveal = () => {
      if (revealedRef.current) return;
      revealedRef.current = true;
      setRevealed(true);
    };
    const syncMotion = () => {
      const reduced = Boolean(media?.matches);
      setReducedMotion(reduced);
      if (reduced) reveal();
    };

    syncMotion();
    if (media?.matches || typeof IntersectionObserver === "undefined") {
      reveal();
      return;
    }

    const element = ref.current;
    if (!element) {
      reveal();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          reveal();
          observer.disconnect();
        }
      },
      { threshold: 0, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(element);
    media?.addEventListener?.("change", syncMotion);

    return () => {
      observer.disconnect();
      media?.removeEventListener?.("change", syncMotion);
    };
  }, [ref]);

  return { revealed, reducedMotion };
}
