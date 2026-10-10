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
