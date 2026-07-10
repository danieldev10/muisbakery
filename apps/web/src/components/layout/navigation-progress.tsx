"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function findNavigableAnchor(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest<HTMLAnchorElement>("a[href]");
}

function shouldTrackNavigation(anchor: HTMLAnchorElement, event: MouseEvent) {
  if (event.button !== 0 || isModifiedClick(event)) {
    return false;
  }

  if (anchor.target && anchor.target !== "_self") {
    return false;
  }

  if (anchor.hasAttribute("download")) {
    return false;
  }

  const href = anchor.getAttribute("href");

  if (!href || href.startsWith("#")) {
    return false;
  }

  const nextUrl = new URL(anchor.href);

  if (nextUrl.origin !== window.location.origin) {
    return false;
  }

  return (
    nextUrl.pathname !== window.location.pathname ||
    nextUrl.search !== window.location.search
  );
}

const minimumVisibleMs = 650;
const completionFadeMs = 320;

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const startedRef = useRef(false);
  const startedAtRef = useRef(0);
  const hideTimerRef = useRef<number | null>(null);
  const failsafeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    function clearTimers() {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }

      if (failsafeTimerRef.current) {
        window.clearTimeout(failsafeTimerRef.current);
        failsafeTimerRef.current = null;
      }
    }

    function startProgress() {
      clearTimers();
      startedRef.current = true;
      startedAtRef.current = Date.now();
      setVisible(true);
      setProgress(18);

      window.requestAnimationFrame(() => {
        setProgress(72);
      });

      failsafeTimerRef.current = window.setTimeout(() => {
        setProgress(100);
        hideTimerRef.current = window.setTimeout(() => {
          startedRef.current = false;
          setVisible(false);
          setProgress(0);
        }, completionFadeMs);
      }, 8000);
    }

    function handleDocumentClick(event: MouseEvent) {
      const anchor = findNavigableAnchor(event.target);

      if (!anchor || !shouldTrackNavigation(anchor, event)) {
        return;
      }

      startProgress();
    }

    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("popstate", startProgress);

    return () => {
      clearTimers();
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("popstate", startProgress);
    };
  }, []);

  useEffect(() => {
    if (!startedRef.current) {
      return;
    }

    const elapsed = Date.now() - startedAtRef.current;
    const completeDelay = Math.max(180, minimumVisibleMs - elapsed);
    const completeTimer = window.setTimeout(() => {
      setProgress(100);
      hideTimerRef.current = window.setTimeout(() => {
        startedRef.current = false;
        setVisible(false);
        setProgress(0);
      }, completionFadeMs);
    }, completeDelay);

    return () => {
      window.clearTimeout(completeTimer);
    };
  }, [routeKey]);

  return (
    <div
      aria-hidden="true"
      className={
        visible
          ? "fixed inset-x-0 top-0 z-[80] h-2 bg-[var(--brand-tint-strong)]"
          : "pointer-events-none fixed inset-x-0 top-0 z-[80] h-2 bg-transparent opacity-0"
      }
    >
      <div
        className="h-full rounded-r-full bg-[var(--brand-burgundy)] shadow-[0_0_18px_rgba(143,38,54,0.55)] transition-[width,opacity] duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
