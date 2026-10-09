import { LayoutGroup, motion } from 'motion/react';
import { useSession } from '../lib/session';
import { Tip } from '../ui/kit';
import { modKey } from '../lib/hooks';

/** Studio ⇄ Werkbank. Same data, two views. Hidden if the role only has one mode. */
export function ModeSwitch() {
  const { mode, setMode, user } = useSession();
  if (user.allowed_modes.length < 2) return null;
  return (
    <Tip label="Modus wechseln" keys={`${modKey} .`}>
      <div className="mode" role="group" aria-label="Arbeitsmodus">
        <LayoutGroup id="mode">
          {(['studio', 'werkbank'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => void setMode(m)}>
              {mode === m && <motion.span layoutId="mode-thumb" className="mode-thumb" style={{ inset: 0, position: 'absolute', zIndex: -1 }} transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
              {m === 'studio' ? 'Studio' : 'Werkbank'}
            </button>
          ))}
        </LayoutGroup>
      </div>
    </Tip>
  );
}
