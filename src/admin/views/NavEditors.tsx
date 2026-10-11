import { Reorder, useDragControls } from 'motion/react';
import { t } from '../lib/i18n';
import { Field, Toggle } from '../ui/kit';
import { PageLinkInput } from '../ui/PageLinkInput';
import { Icon } from '../ui/icons';
import { shortId } from '../../shared/text';
import type { NavItem, SiteSettings } from '../../shared/types';

/*
 * Main menu, header button and footer columns – the same editors in
 * Einstellungen → Menü & Fusszeile and in the page editor, where a click on
 * the header or footer opens them.
 */

function NavRow({ item, onChange, onRemove, depth }: { item: NavItem; onChange: (n: NavItem) => void; onRemove: () => void; depth: number }) {
  const controls = useDragControls();
  return (
    <Reorder.Item value={item} dragListener={false} dragControls={controls} style={{ listStyle: 'none' }} whileDrag={{ scale: 1.01, zIndex: 4 }}>
      <div className="row nav-row" style={{ marginLeft: depth * 24, padding: '0.25rem 0' }}>
        <span className="grip" onPointerDown={(e) => controls.start(e)} aria-hidden="true">
          <Icon name="grip" size="s" />
        </span>
        <input
          className="input"
          style={{ maxWidth: '12rem' }}
          value={item.label}
          placeholder={t('Beschriftung')}
          onChange={(e) => onChange({ ...item, label: e.target.value })}
          aria-label={t('Beschriftung')}
        />
        <PageLinkInput className="input grow mono" value={item.href} placeholder={t('/seite')} onChange={(v) => onChange({ ...item, href: v })} aria-label={t('Ziel')} />
        {depth === 0 && (
          <button
            className="btn ghost s"
            onClick={() => onChange({ ...item, children: [...(item.children ?? []), { id: shortId(), label: '', href: '' }] })}
            title={t('Untermenü-Punkt')}
          >
            + {t('Unterpunkt')}
          </button>
        )}
        <button className="btn ghost s icon-only" aria-label={t('Entfernen')} onClick={onRemove}>
          <Icon name="x" size="s" />
        </button>
      </div>
      {depth === 0 && item.children && item.children.length > 0 && (
        <Reorder.Group axis="y" values={item.children} onReorder={(c) => onChange({ ...item, children: c })} style={{ padding: 0, margin: 0 }}>
          {item.children.map((c) => (
            <NavRow
              key={c.id}
              item={c}
              depth={1}
              onChange={(nc) => onChange({ ...item, children: item.children!.map((x) => (x.id === c.id ? nc : x)) })}
              onRemove={() => onChange({ ...item, children: item.children!.filter((x) => x.id !== c.id) })}
            />
          ))}
        </Reorder.Group>
      )}
    </Reorder.Item>
  );
}

/** The main menu: drag to order, one level of sub-items. */
export function MenuEditor({ nav, onChange }: { nav: NavItem[]; onChange: (n: NavItem[]) => void }) {
  return (
    <>
      <Reorder.Group axis="y" values={nav} onReorder={onChange} style={{ padding: 0, margin: 0 }}>
        {nav.map((n) => (
          <NavRow key={n.id} item={n} depth={0} onChange={(nn) => onChange(nav.map((x) => (x.id === n.id ? nn : x)))} onRemove={() => onChange(nav.filter((x) => x.id !== n.id))} />
        ))}
      </Reorder.Group>
      <button className="btn s" style={{ justifySelf: 'start' }} onClick={() => onChange([...nav, { id: shortId(), label: '', href: '' }])}>
        <Icon name="plus" size="s" /> {t('Menüpunkt')}
      </button>
    </>
  );
}

/** The button at the right of the menu, and whether the header stays on top. */
export function HeaderOptions({ header, onChange }: { header: SiteSettings['header']; onChange: (h: SiteSettings['header']) => void }) {
  return (
    <>
      <div className="grid-2">
        <Field label={t('Knopf rechts im Menü')} help={t('z. B. «Tisch reservieren»')}>
          <input
            className="input"
            value={header.cta?.label ?? ''}
            onChange={(e) => onChange({ ...header, cta: e.target.value || header.cta?.href ? { label: e.target.value, href: header.cta?.href ?? '' } : null })}
          />
        </Field>
        <Field label={t('Ziel des Knopfs')}>
          <PageLinkInput className="input mono" value={header.cta?.href ?? ''} onChange={(v) => onChange({ ...header, cta: { label: header.cta?.label ?? '', href: v } })} />
        </Field>
      </div>
      <Toggle checked={header.sticky} onChange={(v) => onChange({ ...header, sticky: v })} label={t('Kopfzeile beim Scrollen oben behalten')} />
    </>
  );
}

/** Text and link columns of the footer. */
export function FooterEditor({ footer, onChange }: { footer: SiteSettings['footer']; onChange: (f: SiteSettings['footer']) => void }) {
  return (
    <>
      <Field label={t('Text')}>
        <textarea className="textarea" style={{ minHeight: '4rem' }} value={footer.text} onChange={(e) => onChange({ ...footer, text: e.target.value })} />
      </Field>
      {footer.columns.map((col, i) => (
        <div key={i} className="repeat-item" style={{ padding: '0.75rem' }}>
          <div className="row">
            <input
              className="input"
              value={col.title}
              placeholder={t('Spaltentitel')}
              onChange={(e) => onChange({ ...footer, columns: footer.columns.map((c, j) => (j === i ? { ...c, title: e.target.value } : c)) })}
            />
            <button className="btn ghost s icon-only" aria-label={t('Spalte entfernen')} onClick={() => onChange({ ...footer, columns: footer.columns.filter((_, j) => j !== i) })}>
              <Icon name="trash" size="s" />
            </button>
          </div>
          {col.links.map((l, k) => (
            <div key={k} className="row nav-row" style={{ marginTop: '0.4rem' }}>
              <input
                className="input"
                value={l.label}
                placeholder={t('Beschriftung')}
                onChange={(e) =>
                  onChange({
                    ...footer,
                    columns: footer.columns.map((c, j) => (j === i ? { ...c, links: c.links.map((x, m) => (m === k ? { ...x, label: e.target.value } : x)) } : c)),
                  })
                }
              />
              <PageLinkInput
                className="input mono"
                value={l.href}
                placeholder={t('/seite')}
                aria-label={t('Ziel')}
                onChange={(v) =>
                  onChange({
                    ...footer,
                    columns: footer.columns.map((c, j) => (j === i ? { ...c, links: c.links.map((x, m) => (m === k ? { ...x, href: v } : x)) } : c)),
                  })
                }
              />
            </div>
          ))}
          <button
            className="btn ghost s"
            style={{ marginTop: '0.4rem' }}
            onClick={() => onChange({ ...footer, columns: footer.columns.map((c, j) => (j === i ? { ...c, links: [...c.links, { label: '', href: '' }] } : c)) })}
          >
            + {t('Link')}
          </button>
        </div>
      ))}
      <button className="btn s" style={{ justifySelf: 'start' }} onClick={() => onChange({ ...footer, columns: [...footer.columns, { title: '', links: [] }] })}>
        <Icon name="plus" size="s" /> {t('Spalte')}
      </button>
    </>
  );
}

/** The social media links: a name and an address per row. */
export function SocialEditor({ social, onChange }: { social: SiteSettings['social']; onChange: (s: SiteSettings['social']) => void }) {
  const put = (i: number, patch: Partial<SiteSettings['social'][number]>) => onChange(social.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <>
      {social.map((l, i) => (
        <div key={i} className="row nav-row">
          <input className="input" value={l.label} placeholder={t('z. B. Instagram')} aria-label={t('Beschriftung')} onChange={(e) => put(i, { label: e.target.value })} />
          <input className="input mono" value={l.href} placeholder="https://" aria-label={t('Ziel')} onChange={(e) => put(i, { href: e.target.value })} />
          <button className="btn ghost s icon-only" aria-label={t('Entfernen')} onClick={() => onChange(social.filter((_, j) => j !== i))}>
            <Icon name="x" size="s" />
          </button>
        </div>
      ))}
      <button className="btn s" style={{ justifySelf: 'start' }} onClick={() => onChange([...social, { label: '', href: '' }])}>
        <Icon name="plus" size="s" /> {t('Social-Link')}
      </button>
    </>
  );
}
