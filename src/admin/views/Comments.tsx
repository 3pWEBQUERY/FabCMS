import { useState } from 'react';
import { api } from '../lib/api';
import { useApi, formatDate } from '../lib/hooks';
import { Link } from '../lib/router';
import { Empty, PageHead, Segmented, Skeleton } from '../ui/kit';
import { Icon } from '../ui/icons';
import { AnimatePresence, motion } from 'motion/react';

interface Comment {
  id: string;
  name: string;
  email: string;
  body: string;
  status: 'pending' | 'approved' | 'spam';
  created_at: string;
  entry_title: string;
  entry_slug: string;
  entry_id: string;
}

export function Comments() {
  const [status, setStatus] = useState<Comment['status']>('pending');
  const { data, setData } = useApi<{ comments: Comment[] }>(`/api/comments?status=${status}`);
  const act = async (c: Comment, next: Comment['status'] | 'delete') => {
    setData((d) => (d ? { comments: d.comments.filter((x) => x.id !== c.id) } : d));
    if (next === 'delete') await api.del(`/api/comments/${c.id}`);
    else await api.patch(`/api/comments/${c.id}`, { status: next });
  };
  return (
    <div className="page narrow">
      <PageHead
        back={
          <Link to="/inhalte" className="crumb">
            <Icon name="chevronLeft" size="s" /> Inhalte
          </Link>
        }
        title="Kommentare"
        sub="Nichts erscheint, bevor du es freigibst."
        actions={
          <Segmented
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'pending', label: 'Warten' },
              { value: 'approved', label: 'Freigegeben' },
              { value: 'spam', label: 'Spam' },
            ]}
          />
        }
      />
      {!data ? (
        <Skeleton />
      ) : !data.comments.length ? (
        <section className="card">
          <Empty title={status === 'pending' ? 'Alles erledigt' : 'Nichts hier'} />
        </section>
      ) : (
        <div className="stack">
          <AnimatePresence initial={false}>
            {data.comments.map((c) => (
              <motion.article key={c.id} className="card card-pad stack tight" layout exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}>
                <div className="row between">
                  <strong>{c.name}</strong>
                  <span className="xsmall faint">{formatDate(c.created_at, true)}</span>
                </div>
                <p style={{ whiteSpace: 'pre-wrap' }}>{c.body}</p>
                <p className="xsmall muted">
                  zu «{c.entry_title}»{c.email ? ` · ${c.email}` : ''}
                </p>
                <div className="row wrap">
                  {c.status !== 'approved' && (
                    <button className="btn go s" onClick={() => void act(c, 'approved')}>
                      <Icon name="check" size="s" /> Freigeben
                    </button>
                  )}
                  {c.status !== 'spam' && (
                    <button className="btn s" onClick={() => void act(c, 'spam')}>
                      Spam
                    </button>
                  )}
                  {c.status === 'approved' && (
                    <button className="btn s" onClick={() => void act(c, 'pending')}>
                      Zurückziehen
                    </button>
                  )}
                  <button className="btn ghost danger s" onClick={() => void act(c, 'delete')}>
                    Löschen
                  </button>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
