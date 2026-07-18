"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/providers/i18n-provider";

interface RateLimitAlertProps {
  retryAfterSeconds: number;
  onRetry?: () => void;
}

export function RateLimitAlert({
  retryAfterSeconds: initialSeconds,
  onRetry,
}: RateLimitAlertProps) {
  const { t, locale } = useI18n();
  const currentLocale = locale ?? "en";
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLongWait = secondsLeft > 120;

  function formatLongWaitDuration(totalSeconds: number) {
    const totalMinutes = Math.ceil(totalSeconds / 60);
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;
    const numberFormat = new Intl.NumberFormat(currentLocale);
    const parts: string[] = [];

    if (days > 0) {
      parts.push(
        `${numberFormat.format(days)} ${
          days === 1 ? t("auth.durationDay") : t("auth.durationDays")
        }`,
      );
    }
    if (hours > 0) {
      parts.push(
        `${numberFormat.format(hours)} ${
          hours === 1 ? t("auth.durationHour") : t("auth.durationHours")
        }`,
      );
    }
    if (minutes > 0 || parts.length === 0) {
      parts.push(
        `${numberFormat.format(minutes)} ${
          minutes === 1 ? t("auth.durationMinute") : t("auth.durationMinutes")
        }`,
      );
    }

    return parts
      .slice(0, 2)
      .join(currentLocale.startsWith("ar") ? " و" : " ");
  }

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
        <p className="font-medium">{t("auth.rateLimitTitle")}</p>
        <p className="mt-1">
          {isLongWait
            ? t("auth.rateLimitLongWait", {
                duration: formatLongWaitDuration(secondsLeft),
              })
            : t("auth.rateLimitCountdown", {
                seconds: String(secondsLeft),
              })}
        </p>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
    >
      <p className="font-medium">{t("auth.rateLimitReady")}</p>
      {onRetry && (
        <button
          type="button"
          onClick={handleRetry}
          className="mt-2 text-sm font-medium text-green-700 underline hover:text-green-900"
        >
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}
