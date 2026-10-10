import { Fragment, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { t, tl } from '../lib/i18n';
import { useSession } from '../lib/session';
import { Icon } from '../ui/icons';
import { Dialog, Field, Menu, Select, Toggle, confirm } from '../ui/kit';
import { useToast } from '../ui/toast';
import type { Capability } from '../../shared/roles';

export interface RoleInfo {
  id: string;
  builtin: boolean;
  name: string;
  help: string;
  caps: Capability[];
  werkbank: boolean;
  users: number;
  editable?: boolean;
}
export interface RolesData {
  capabilities: { cap: Capability; label: string; group: string }[];
  roles: RoleInfo[];
  /** Roles whose people must sign in with a second factor. */
  require2fa?: string[];
}

export function useRoles() {
  return useApi<RolesData>('/api/roles');
}

/** Name of a role as people read it: built-ins translated, own roles as named. */
export const roleName = (r: RoleInfo) => (r.builtin ? tl(r.name) : r.name);

/**
 * Who may do what, in one table: the built-in roles for reference, own roles
 * with a checkbox per right. Each click saves; the server refuses rights you
 * don't hold yourself.
 */
export function RightsMatrix({ data, onChange }: { data: RolesData; onChange: () => void }) {
  const { caps: mine, user } = useSession();
  const toast = useToast();
  const [editing, setEditing] = useState<RoleInfo | 'new' | null>(null);
  const [removing, setRemoving] = useState<RoleInfo | null>(null);
  // Ticks show at once; the fresh list from the server replaces them.
  const [local, setLocal] = useState<Record<string, Partial<RoleInfo>>>({});
  useEffect(() => setLocal({}), [data]);
  const roles = data.roles.filter((r) => r.id !== 'member').map((r) => ({ ...r, ...local[r.id] }));
  const groups = [...new Set(data.capabilities.map((c) => c.group))];
  const grantable = (cap: Capability) => cap !== 'data.sql' && (user.role === 'owner' || mine.includes(cap));

  const save = async (r: RoleInfo, patch: Partial<Pick<RoleInfo, 'name' | 'help' | 'caps' | 'werkbank'>>) => {
    setLocal((l) => ({ ...l, [r.id]: { ...l[r.id], ...patch } }));
    try {
      await api.put(`/api/roles/${r.id}`, patch);
      onChange();
    } catch (e) {
      setLocal(({ [r.id]: _gone, ...rest }) => rest);
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const toggle = (r: RoleInfo, cap: Capability, on: boolean) => void save(r, { caps: on ? [...r.caps, cap] : r.caps.filter((c) => c !== cap) });
  /** Nobody has it: a confirmation is enough. Otherwise the people need another role first. */
  const remove = async (r: RoleInfo) => {
    if (r.users) return setRemoving(r);
    if (!(await confirm({ title: t('Rolle «{name}» löschen?', { name: r.name }), confirm: t('Löschen'), danger: true }))) return;
    try {
      await api.del(`/api/roles/${r.id}`);
      toast(t('Rolle «{name}» gelöscht.', { name: r.name }));
      onChange();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('Rechte der Rollen')}</h2>
        <button className="btn s" onClick={() => setEditing('new')}>
          <Icon name="plus" size="s" /> {t('Rolle anlegen')}
        </button>
      </div>
      <div className="rm-scroll">
        <table className="rm">
          <thead>
            <tr>
              <th className="rm-cap">{t('Recht')}</th>
              {roles.map((r) => (
                <th key={r.id} className={r.builtin ? 'builtin' : 'own'}>
                  <span className="rm-role">
                    <span className="ellipsis" title={r.help ? (r.builtin ? tl(r.help) : r.help) : undefined}>
                      {roleName(r)}
                    </span>
                    {!r.builtin && r.editable && (
                      <Menu
                        trigger={
                          <button className="btn ghost s icon-only" aria-label={t('Rolle {name} bearbeiten', { name: r.name })}>
                            <Icon name="more" size="s" />
                          </button>
                        }
                        items={[
                          { label: t('Umbenennen'), icon: 'pen', onSelect: () => setEditing(r) },
                          { label: t('Löschen'), icon: 'trash', danger: true, onSelect: () => void remove(r) },
                        ]}
                      />
                    )}
                  </span>
                  <span className="xsmall muted">{r.users === 1 ? t('1 Person') : t('{n} Personen', { n: r.users })}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g}>
                <tr className="rm-group">
                  <th colSpan={roles.length + 1}>{tl(g)}</th>
                </tr>
                {data.capabilities
                  .filter((c) => c.group === g)
                  .map((c) => (
                    <tr key={c.cap}>
                      <th className="rm-cap">
                        {tl(c.label)}
                        <code>{c.cap}</code>
                      </th>
                      {roles.map((r) => {
                        const has = r.caps.includes(c.cap);
                        if (r.builtin || !r.editable)
                          return (
                            <td key={r.id} className="rm-fixed">
                              {has ? <Icon name="check" size="s" /> : <span className="faint">–</span>}
                            </td>
                          );
                        return (
                          <td key={r.id}>
                            <input
                              type="checkbox"
                              checked={has}
                              disabled={!grantable(c.cap) && !has}
                              title={!grantable(c.cap) ? t('Dieses Recht hast du selbst nicht.') : undefined}
                              aria-label={t('{role}: {right}', { role: r.name, right: tl(c.label) })}
                              onChange={(e) => toggle(r, c.cap, e.target.checked)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </Fragment>
            ))}
            <tr className="rm-group">
              <th colSpan={roles.length + 1}>{t('Modus')}</th>
            </tr>
            <tr>
              <th className="rm-cap">{t('Werkbank nutzen')}</th>
              {roles.map((r) =>
                r.builtin || !r.editable ? (
                  <td key={r.id} className="rm-fixed">
                    {r.werkbank ? <Icon name="check" size="s" /> : <span className="faint">–</span>}
                  </td>
                ) : (
                  <td key={r.id}>
                    <input
                      type="checkbox"
                      checked={r.werkbank}
                      aria-label={t('{role}: Werkbank nutzen', { role: r.name })}
                      onChange={(e) => void save(r, { werkbank: e.target.checked })}
                    />
                  </td>
                ),
              )}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="xsmall muted card-pad">{t('Eingebaute Rollen sind fest. Eigene Rollen bekommen genau die Rechte, die du ankreuzt – nie mehr, als du selbst hast.')}</p>
      <RoleDialog
        data={data}
        role={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChange();
        }}
      />
      <RemoveRole
        data={data}
        role={removing}
        onClose={() => setRemoving(null)}
        onDone={() => {
          setRemoving(null);
          onChange();
        }}
      />
    </section>
  );
}

function RoleDialog({ data, role, onClose, onSaved }: { data: RolesData; role: RoleInfo | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const { caps: mine, user } = useSession();
  const toast = useToast();
  const isNew = role === 'new';
  const [form, setForm] = useState({ name: '', help: '', from: 'author', werkbank: false });
  const [prev, setPrev] = useState<typeof role>(null);
  if (role !== prev) {
    setPrev(role);
    if (role) setForm(role === 'new' ? { name: '', help: '', from: 'author', werkbank: false } : { name: role.name, help: role.help, from: '', werkbank: role.werkbank });
  }
  const submit = async () => {
    try {
      if (isNew) {
        const base = data.roles.find((r) => r.id === form.from);
        // Start from another role's rights – only those you may hand out.
        const caps = (base?.caps ?? []).filter((c) => c !== 'data.sql' && (user.role === 'owner' || mine.includes(c)));
        await api.post('/api/roles', { name: form.name, help: form.help, caps, werkbank: form.werkbank });
      } else if (role) await api.put(`/api/roles/${role.id}`, { name: form.name, help: form.help });
      onSaved();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  return (
    <Dialog open={role !== null} onOpenChange={(o) => !o && onClose()} title={isNew ? t('Rolle anlegen') : t('Rolle bearbeiten')}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={t('Name')} htmlFor="role-name">
          <input
            id="role-name"
            className="input"
            value={form.name}
            maxLength={60}
            placeholder={t('z. B. Shop-Team')}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
          />
        </Field>
        <Field label={t('Wofür')} htmlFor="role-help" help={t('Erscheint bei der Auswahl der Rolle.')}>
          <input id="role-help" className="input" value={form.help} maxLength={200} onChange={(e) => setForm({ ...form, help: e.target.value })} />
        </Field>
        {isNew && (
          <>
            <Field label={t('Rechte übernehmen von')} help={t('Danach kreuzt du in der Tabelle an, was dazukommt oder wegfällt.')}>
              <Select
                value={form.from}
                onChange={(v) => setForm({ ...form, from: v })}
                options={[
                  { value: 'none', label: t('Keine – leer beginnen') },
                  ...data.roles.filter((r) => r.id !== 'owner' && r.id !== 'member').map((r) => ({ value: r.id, label: roleName(r) })),
                ]}
              />
            </Field>
            <Toggle checked={form.werkbank} onChange={(v) => setForm({ ...form, werkbank: v })} label={t('Darf die Werkbank nutzen')} />
          </>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('Abbrechen')}
          </button>
          <button className="btn primary" disabled={!form.name.trim()}>
            {isNew ? t('Anlegen') : t('Sichern')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function RemoveRole({ data, role, onClose, onDone }: { data: RolesData; role: RoleInfo | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [to, setTo] = useState('author');
  const run = async () => {
    if (!role) return;
    try {
      await api.del(`/api/roles/${role.id}?moveTo=${encodeURIComponent(to)}`);
      toast(t('Rolle «{name}» gelöscht.', { name: role.name }));
      onDone();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  return (
    <Dialog open={role !== null} onOpenChange={(o) => !o && onClose()} title={t('Rolle «{name}» löschen', { name: role?.name ?? '' })}>
      <div className="stack">
        <p className="small">{t('{n} Personen haben diese Rolle. Welche bekommen sie stattdessen?', { n: role?.users ?? 0 })}</p>
        <Select
          label={t('Neue Rolle')}
          value={to}
          onChange={setTo}
          options={data.roles.filter((r) => r.id !== role?.id && r.id !== 'owner').map((r) => ({ value: r.id, label: roleName(r) }))}
        />
        <div className="dialog-actions">
          <button className="btn ghost" onClick={onClose}>
            {t('Abbrechen')}
          </button>
          <button className="btn danger" onClick={() => void run()}>
            {t('Löschen und umstellen')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Which roles must sign in with a second factor. People without one are
 * asked to set it up at their next click; until then they can do nothing else.
 */
export function TwoFactorPolicy({ data, missing, onChange }: { data: RolesData; missing: (role: string) => number; onChange: () => void }) {
  const { user: me } = useSession();
  const toast = useToast();
  const required = new Set(data.require2fa ?? []);
  const toggle = async (r: RoleInfo, on: boolean) => {
    if (
      on &&
      r.id === me.role &&
      missing(r.id) &&
      !(await confirm({
        title: t('Auch für deine eigene Rolle?'),
        message: t('Du hast selbst noch keinen zweiten Faktor. Nova fragt dich gleich danach, ihn einzurichten.'),
        confirm: t('Einschalten'),
      }))
    )
      return;
    try {
      const next = on ? [...required, r.id] : [...required].filter((x) => x !== r.id);
      await api.put('/api/security/2fa', { roles: next });
      onChange();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('Zwei-Faktor-Pflicht')}</h2>
      </div>
      <div className="form-section">
        <p className="small muted">{t('Wer eine dieser Rollen hat, meldet sich mit Passwort und Code aus einer App an – oder mit einem Passkey.')}</p>
        {data.roles
          .filter((r) => r.id !== 'member')
          .map((r) => (
            <Toggle
              key={r.id}
              checked={required.has(r.id)}
              disabled={r.id === 'owner' && me.role !== 'owner'}
              onChange={(v) => void toggle(r, v)}
              label={roleName(r)}
              help={required.has(r.id) && missing(r.id) ? t('Ohne zweiten Faktor: {n} – wird beim nächsten Klick zur Einrichtung geführt.', { n: missing(r.id) }) : undefined}
            />
          ))}
      </div>
    </section>
  );
}
