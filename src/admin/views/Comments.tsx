import { useState } from 'react';
import { api } from '../lib/api';
import { useApi, formatDate } from '../lib/hooks';
import { Link } from '../lib/router';
import { t } from '../lib/i18n';
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
  /** Product reviews have stars. */
  rating: number | null;
  verified: boolean;
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
            <Icon name="chevronLeft" size="s" /> {t('Inhalte')}
          </Link>
        }
        title={t('Kommentare & Bewertungen')}
        sub={t('Nichts erscheint, bevor du es freigibst.')}
        actions={
          <Segmented
            label={t('Status')}
            value={status}
            onChange={setStatus}
            options={[
              { value: 'pending', label: t('Warten') },
              { value: 'approved', label: t('Freigegeben') },
              { value: 'spam', label: t('Spam') },
            ]}
          />
        }
      />
      {!data ? (
        <Skeleton />
      ) : !data.comments.length ? (
        <section className="card">
          <Empty title={status === 'pending' ? t('Alles erledigt') : t('Nichts hier')} />
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
                {c.rating !== null && (
                  <p className="row" style={{ gap: '0.5rem' }}>
                    <span className="rv-stars-admin" role="img" aria-label={t('{n} von 5 Sternen', { n: c.rating })}>
                      {'★'.repeat(c.rating) + '☆'.repeat(5 - c.rating)}
                    </span>
                    {c.verified && (
                      <span className="badge ok">
                        <Icon name="check" size="s" /> {t('Kauf bestätigt')}
                      </span>
                    )}
                  </p>
                )}
                {c.body && <p style={{ whiteSpace: 'pre-wrap' }}>{c.body}</p>}
                <p className="xsmall muted">
                  {c.rating !== null ? t('Bewertung zu «{title}»', { title: c.entry_title }) : t('zu «{title}»', { title: c.entry_title })}
                  {c.email ? ` · ${c.email}` : ''}
                </p>
                <div className="row wrap">
                  {c.status !== 'approved' && (
                    <button className="btn go s" onClick={() => void act(c, 'approved')}>
                      <Icon name="check" size="s" /> {t('Freigeben')}
                    </button>
                  )}
                  {c.status !== 'spam' && (
                    <button className="btn s" onClick={() => void act(c, 'spam')}>
                      {t('Spam')}
                    </button>
                  )}
                  {c.status === 'approved' && (
                    <button className="btn s" onClick={() => void act(c, 'pending')}>
                      {t('Zurückziehen')}
                    </button>
                  )}
                  <button className="btn ghost danger s" onClick={() => void act(c, 'delete')}>
                    {t('Löschen')}
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
