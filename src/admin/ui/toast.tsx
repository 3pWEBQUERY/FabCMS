import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'bad';
  action?: { label: string; run: () => void };
}

const Ctx = createContext<(message: string, opts?: { kind?: 'info' | 'bad'; action?: Toast['action']; ms?: number }) => void>(() => {});
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, opts: { kind?: 'info' | 'bad'; action?: Toast['action']; ms?: number } = {}) => {
    const id = ++seq;
    setToasts((t) => [...t.slice(-2), { id, message, kind: opts.kind ?? 'info', action: opts.action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.ms ?? (opts.kind === 'bad' ? 7000 : 3800));
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              className={`toast ${t.kind === 'bad' ? 'bad' : ''}`}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            >
              <span>{t.message}</span>
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.run();
                    setToasts((x) => x.filter((y) => y.id !== t.id));
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
