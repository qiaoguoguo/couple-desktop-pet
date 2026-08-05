import { useEffect, useMemo, useState } from "react";

interface TypewriterTextProps {
  text: string;
  intervalMs?: number;
  disabled?: boolean;
}

export function TypewriterText({
  text,
  intervalMs = 35,
  disabled = false,
}: TypewriterTextProps) {
  const characters = useMemo(() => Array.from(text), [text]);
  const reducedMotion = usePrefersReducedMotion();
  const shouldShowImmediately =
    disabled || reducedMotion || characters.length <= 1;
  const [visibleCount, setVisibleCount] = useState(() =>
    shouldShowImmediately ? characters.length : Math.min(1, characters.length),
  );

  useEffect(() => {
    setVisibleCount(
      shouldShowImmediately ? characters.length : Math.min(1, characters.length),
    );
  }, [characters.length, shouldShowImmediately, text]);

  useEffect(() => {
    if (shouldShowImmediately || visibleCount >= characters.length) {
      return;
    }

    const timer = window.setTimeout(() => {
      setVisibleCount((count) => Math.min(count + 1, characters.length));
    }, intervalMs);

    return () => window.clearTimeout(timer);
  }, [characters.length, intervalMs, shouldShowImmediately, visibleCount]);

  return <>{characters.slice(0, visibleCount).join("")}</>;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return false;
    }

    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);

    media.addEventListener?.("change", update);

    return () => media.removeEventListener?.("change", update);
  }, []);

  return reduced;
}
