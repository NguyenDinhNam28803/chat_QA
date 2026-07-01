'use client';
import { useEffect, useRef } from 'react';

/** Auto-rotating globe (cobe) with markers on major news regions. */
export function Globe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let phi = 0;
    let globe: { destroy: () => void } | undefined;
    let cancelled = false;

    void (async () => {
      // cobe is browser/WebGL-only — load it in the effect, not at import time.
      const createGlobe = (await import('cobe')).default;
      if (cancelled || !canvasRef.current) return;

      const opts = {
        devicePixelRatio: 2,
        width: 800,
        height: 800,
        phi: 0,
        theta: 0.2,
        // White globe (light ocean) with dark land dots.
        dark: 0,
        diffuse: 1.1,
        mapSamples: 40000, // denser dots so continents are recognizable
        mapBrightness: 1.5,
        baseColor: [0.1, 0.1, 0.12] as [number, number, number], // near-black land dots
        markerColor: [1, 0.42, 0] as [number, number, number],
        glowColor: [0.86, 0.88, 0.92] as [number, number, number],
        markers: [
          { location: [16.05, 108.2] as [number, number], size: 0.11 }, // Việt Nam
          { location: [38.9, -77.0] as [number, number], size: 0.05 }, // Washington
          { location: [51.5, -0.12] as [number, number], size: 0.05 }, // London
          { location: [39.9, 116.4] as [number, number], size: 0.05 }, // Bắc Kinh
          { location: [35.68, 139.7] as [number, number], size: 0.05 }, // Tokyo
          { location: [48.85, 2.35] as [number, number], size: 0.04 }, // Paris
        ],
        onRender: (state: Record<string, number>) => {
          state.phi = phi;
          phi += 0.004;
        },
      };

      globe = createGlobe(
        canvasRef.current,
        opts as unknown as Parameters<typeof createGlobe>[1],
      );
    })();

    return () => {
      cancelled = true;
      globe?.destroy();
    };
  }, []);

  return (
    <div className="flex items-center justify-center py-1">
      <div className="rounded-full ring-1 ring-black/5">
        <canvas
          ref={canvasRef}
          style={{ width: 400, height: 400, maxWidth: '100%', aspectRatio: '1' }}
        />
      </div>
    </div>
  );
}
