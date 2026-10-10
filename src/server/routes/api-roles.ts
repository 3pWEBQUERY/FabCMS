import type { Hono } from 'hono';
import { z } from 'zod';
import { sql } from '../db';
import { audit, requireCap, type AppEnv } from '../auth';
import { getSettings } from '../settings';
import { createRole, deleteRole, ensureRoles, updateRole } from '../roles';
import { CAP_INFO, ROLE_CAPS, ROLE_LABELS, ROLE_ORDER, capsOf, customRole, modesOf } from '../../shared/roles';

const roleInput = z.object({
  name: z.string().trim().min(1, 'Die Rolle braucht einen Namen.').max(60),
  help: z.string().max(200).optional(),
  caps: z.array(z.string().max(40)).max(60),
  werkbank: z.boolean().optional(),
});

/** Built-in and own roles with their rights – the rights matrix of the Werkbank. */
export function rolesApi(app: Hono<AppEnv>) {
  app.get('/api/roles', async (c) => {
    const me = requireCap(c, 'users.manage');
    await ensureRoles();
    const settings = await getSettings();
    const counts = await sql`select role, count(*)::int as n from users group by role`;
    const n = (id: string) => counts.find((r) => r.role === id)?.n ?? 0;
    const custom = await sql`select id from roles order by name`;
    const mine = new Set(capsOf(me.role));
    return c.json({
      capabilities: CAP_INFO,
      roles: [
        ...ROLE_ORDER.map((id) => ({
          id,
          builtin: true,
          name: ROLE_LABELS[id].name,
          help: ROLE_LABELS[id].help,
          caps: ROLE_CAPS[id],
          werkbank: modesOf(id, settings.roleModes).includes('werkbank'),
          users: n(id),
        })),
        ...custom.map(({ id }) => {
          const r = customRole(id as string)!;
          return { ...r, builtin: false, users: n(r.id), editable: me.role === 'owner' || r.caps.every((x) => mine.has(x)) };
        }),
      ],
    });
  });

  app.post('/api/roles', async (c) => {
    const me = requireCap(c, 'users.manage');
    const body = roleInput.parse(await c.req.json());
    const role = await createRole(me.role, body);
    await audit(c, 'role.create', 'role', role.id, { caps: role.caps });
    return c.json({ role });
  });

  app.put('/api/roles/:id', async (c) => {
    const me = requireCap(c, 'users.manage');
    const body = roleInput.partial().parse(await c.req.json());
    const role = await updateRole(me.role, c.req.param('id'), body);
    await audit(c, 'role.update', 'role', role.id, body);
    return c.json({ role });
  });

  app.delete('/api/roles/:id', async (c) => {
    const me = requireCap(c, 'users.manage');
    const moveTo = c.req.query('moveTo') || undefined;
    const moved = await deleteRole(me.role, c.req.param('id'), moveTo);
    await audit(c, 'role.delete', 'role', c.req.param('id'), { moved, moveTo });
    return c.json({ ok: true, moved });
  });
}
