"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface RateLimitAlertProps {
  retryAfterSeconds: number;
  onRetry?: () => void;
}

export function RateLimitAlert({
  retryAfterSeconds: initialSeconds,
  onRetry,
}: RateLimitAlertProps) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (initialSeconds <= 0) {
      setSecondsLeft(0);
      return;
    }

    let remaining = initialSeconds;
    setSecondsLeft(remaining);

    timerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        setSecondsLeft(0);
      } else {
        setSecondsLeft(remaining);
      }
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [initialSeconds]);

  const handleRetry = useCallback(() => {
    if (onRetry) onRetry();
  }, [onRetry]);

  if (secondsLeft > 0) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
      >
        <p className="font-medium">Too many requests</p>
        <p className="mt-1">
          Please wait {secondsLeft} second{secondsLeft !== 1 ? "s" : ""} before
          trying again.
        </p>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
    >
      <p className="font-medium">You can try again now</p>
      {onRetry && (
        <button
          type="button"
          onClick={handleRetry}
          className="mt-2 text-sm font-medium text-green-700 underline hover:text-green-900"
        >
          Retry
        </button>
      )}
    </div>
  );
}
