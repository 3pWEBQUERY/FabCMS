/**
 * Confetti – only for the very first publish. Paper snippets in calm colours,
 * 1.6 s, respects reduced motion.
 */
export function celebrate() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  document.body.append(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const colors = ['#1b1a17', '#2b59c3', '#2e7a4d', '#b8730f', '#c4381b', '#e4e1da'];
  const parts = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 160,
    y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 13 - 4,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.35,
    w: 5 + Math.random() * 5,
    h: 8 + Math.random() * 8,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  const frame = (t: number) => {
    const age = t - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.38;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 1100) / 500);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.scale(1, Math.cos(p.r * 2));
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (age < 1600) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
