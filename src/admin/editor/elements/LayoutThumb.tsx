/** Sketches of the ready-made layouts, drawn like wireframes. */
export function LayoutThumb({ id }: { id: string }) {
  const line = (x: number, y: number, w: number, o = 1) => <rect x={x} y={y} width={w} height="3" rx="1.5" opacity={o} />;
  const body = (() => {
    switch (id) {
      case 'split':
        return (
          <>
            {line(8, 14, 26)}
            {line(8, 22, 34, 0.45)}
            {line(8, 28, 30, 0.45)}
            <rect x="8" y="36" width="16" height="6" rx="3" className="acc" />
            <rect x="50" y="10" width="42" height="36" rx="4" className="img" />
          </>
        );
      case 'cards':
        return [10, 39, 68].map((x) => (
          <g key={x}>
            <rect x={x} y="12" width="23" height="32" rx="3" className="card" />
            <circle cx={x + 6} cy="19" r="2.5" className="acc" />
            {line(x + 3, 26, 14)}
            {line(x + 3, 32, 17, 0.45)}
          </g>
        ));
      case 'cta':
        return (
          <>
            {line(26, 14, 48)}
            {line(32, 22, 36, 0.45)}
            <rect x="30" y="32" width="18" height="7" rx="3.5" className="acc" />
            <rect x="52" y="32" width="18" height="7" rx="3.5" className="ghost" />
          </>
        );
      case 'stats':
        return [10, 31, 52, 73].map((x) => (
          <g key={x}>
            <rect x={x} y="18" width="14" height="9" rx="2" className="acc" />
            {line(x, 32, 16, 0.45)}
          </g>
        ));
      case 'latest':
        return (
          <>
            {line(10, 7, 28)}
            {[10, 39, 68].map((x) => (
              <g key={x}>
                <rect x={x} y="14" width="23" height="14" rx="2" className="img" />
                {line(x, 32, 18)}
                {line(x, 38, 22, 0.45)}
                {line(x, 43, 14, 0.45)}
              </g>
            ))}
          </>
        );
      case 'faq':
        return (
          <>
            {line(10, 7, 30)}
            {[15, 26, 37].map((y, i) => (
              <g key={y}>
                <rect x="10" y={y} width="80" height="0.8" opacity="0.4" />
                {line(10, y + 4, i === 0 ? 40 : 32)}
                <path d={`M86 ${y + 4.5}h4${i === 0 ? '' : `M88 ${y + 2.5}v4`}`} className="plus" />
              </g>
            ))}
            {line(10, 47, 52, 0.45)}
          </>
        );
      case 'slides':
        return (
          <>
            <rect x="4" y="8" width="14" height="30" rx="3" className="img" opacity="0.5" />
            <rect x="22" y="8" width="56" height="30" rx="3" className="img" />
            <rect x="82" y="8" width="14" height="30" rx="3" className="img" opacity="0.5" />
            <rect x="42" y="45" width="8" height="3" rx="1.5" className="acc" />
            <circle cx="54" cy="46.5" r="1.5" opacity="0.4" />
            <circle cx="59" cy="46.5" r="1.5" opacity="0.4" />
          </>
        );
      case 'tabbed':
        return (
          <>
            {[10, 32, 54].map((x, i) => (
              <rect key={x} x={x} y="10" width="18" height="3" rx="1.5" opacity={i === 0 ? 1 : 0.45} />
            ))}
            <rect x="10" y="17" width="18" height="1.5" className="acc" />
            <rect x="10" y="18" width="80" height="0.6" opacity="0.4" />
            {line(10, 26, 46)}
            {line(10, 33, 64, 0.45)}
            {line(10, 39, 58, 0.45)}
          </>
        );
      case 'ticker':
        return (
          <>
            {[2, 30, 58, 86].map((x) => (
              <rect key={x} x={x} y="20" width="20" height="5" rx="2.5" opacity={x < 10 || x > 80 ? 0.35 : 1} />
            ))}
            <path d="M40 34h20M56 31l4 3-4 3" className="plus" />
          </>
        );
      case 'collage':
        return (
          <>
            <path d="M58 6c10 0 22 6 24 16s-4 22-14 24-24-2-26-12 6-28 16-28z" className="acc" opacity="0.35" />
            <rect x="56" y="12" width="22" height="30" rx="3" className="img" transform="rotate(4 67 27)" />
            {line(8, 20, 40)}
            {line(8, 27, 32)}
            <path d="M8 38c3-3 6-3 9 0s6 3 9 0" className="plus" />
            <rect x="8" y="44" width="16" height="6" rx="3" className="acc" />
          </>
        );
      case 'cover':
        return (
          <>
            <rect x="6" y="8" width="88" height="40" rx="4" className="dark" />
            <rect x="12" y="28" width="40" height="4" rx="2" className="light" />
            <rect x="12" y="36" width="28" height="3" rx="1.5" className="light" opacity="0.6" />
          </>
        );
      default:
        return (
          <>
            <rect x="10" y="10" width="80" height="36" rx="4" className="dash" />
            <path d="M50 22v12M44 28h12" className="plus" />
          </>
        );
    }
  })();
  return (
    <svg viewBox="0 0 100 56" className="lt" aria-hidden="true">
      {body}
    </svg>
  );
}
