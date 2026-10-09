import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';

type Kind = 'info' | 'bad' | 'notice';

interface Toast {
  id: number;
  message: string;
  kind: Kind;
  icon?: string;
  ms: number;
  action?: { label: string; run: () => void };
}

type Push = (message: string, opts?: { kind?: Kind; icon?: string; action?: Toast['action']; ms?: number }) => void;
const Ctx = createContext<Push>(() => {});
let seq = 0;

const DEFAULT_ICON: Record<Kind, string> = { info: 'check', bad: 'alert', notice: 'bell' };

/** One toast: counts down, pauses while hovered or focused, can be closed. */
function ToastItem({ t, onClose }: { t: Toast; onClose: () => void }) {
  const [paused, setPaused] = useState(false);
  const left = useRef(t.ms);
  const started = useRef(Date.now());
  useEffect(() => {
    if (paused) return;
    started.current = Date.now();
    const timer = setTimeout(onClose, left.current);
    return () => {
      clearTimeout(timer);
      left.current -= Date.now() - started.current;
    };
  }, [paused, onClose]);
  return (
    <motion.div
      layout
      className={`toast ${t.kind}`}
      role={t.kind === 'bad' ? 'alert' : 'status'}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon name={t.icon ?? DEFAULT_ICON[t.kind]} size="s" className="toast-icon" />
      <span className="toast-msg">{t.message}</span>
      {t.action && (
        <button
          className="toast-action"
          onClick={() => {
            t.action!.run();
            onClose();
          }}
        >
          {t.action.label}
        </button>
      )}
      <button className="toast-x" aria-label="Schliessen" onClick={onClose}>
        <Icon name="x" size="s" />
      </button>
      {!paused && <span className="toast-timer" style={{ animationDuration: `${t.ms}ms` }} aria-hidden="true" />}
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const close = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback<Push>((message, opts = {}) => {
    const id = ++seq;
    const kind = opts.kind ?? 'info';
    const ms = opts.ms ?? (kind === 'bad' ? 7000 : kind === 'notice' ? 6500 : 3800);
    setToasts((t) => [...t.slice(-2), { id, message, kind, icon: opts.icon, ms, action: opts.action }]);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <ToastItem key={t.id} t={t} onClose={() => close(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
