'use client';

import { useEffect, useState } from 'react';

export function useAnimationFrameRate(): number | null {
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    let frames = 0;
    let startedAt = 0;
    let frameId = 0;
    let active = true;

    const tick = (now: number) => {
      if (!active) return;
      if (document.visibilityState === 'hidden') {
        frames = 0;
        startedAt = now;
      } else {
        if (startedAt === 0) startedAt = now;
        frames += 1;
        const elapsed = now - startedAt;
        if (elapsed >= 1_000) {
          setFps(Math.round((frames * 1_000) / elapsed));
          frames = 0;
          startedAt = now;
        }
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(frameId);
    };
  }, []);

  return fps;
}
