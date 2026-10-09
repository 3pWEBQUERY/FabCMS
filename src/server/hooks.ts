import { getQuickJS, shouldInterruptAfterDeadline, type QuickJSWASMModule } from 'quickjs-emscripten';
import { badRequest } from './lib/http';
import { getSettings } from './settings';
import type { HookEvent, ServerHook } from '../shared/hooks';

/**
 * Hooks run in QuickJS compiled to WebAssembly: a separate JavaScript engine
 * with its own heap. The code sees only the event as plain data and
 * `console.log` – no require, no fetch, no file system, no process, no
 * timers. Each run gets a fresh runtime (nothing survives between calls),
 * 50 ms of CPU and 16 MB of memory.
 */

export const HOOK_TIME_MS = 50;
const HOOK_MEMORY = 16 * 1024 * 1024;
const MAX_CODE = 20_000;
const MAX_PAYLOAD = 1024 * 1024;

let engine: Promise<QuickJSWASMModule> | null = null;
const quickjs = () => (engine ??= getQuickJS());

export interface HookRun {
  ok: boolean;
  /** The event after the hook (mutated or returned). */
  result: Record<string, unknown> | null;
  /** Message for the user: thrown error, timeout, syntax error. */
  error: string | null;
  logs: string[];
  ms: number;
}

/** Evaluates source in a fresh sandbox; the last expression must be a string. */
async function evaluate(source: string, timeMs: number, logs: string[]): Promise<{ value: string } | { error: string }> {
  const runtime = (await quickjs()).newRuntime();
  runtime.setMemoryLimit(HOOK_MEMORY);
  runtime.setMaxStackSize(512 * 1024);
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + timeMs));
  const vm = runtime.newContext();
  try {
    const log = vm.newFunction('log', (...args) => {
      if (logs.length < 50)
        logs.push(
          args
            .map((a) => (vm.typeof(a) === 'string' ? vm.getString(a) : JSON.stringify(vm.dump(a))))
            .join(' ')
            .slice(0, 2000),
        );
    });
    const con = vm.newObject();
    for (const k of ['log', 'info', 'warn', 'error']) vm.setProp(con, k, log);
    vm.setProp(vm.global, 'console', con);
    log.dispose();
    con.dispose();
    const res = vm.evalCode(source, 'hook.js');
    if (res.error) {
      const err = vm.dump(res.error) as { name?: string; message?: string } | string;
      res.error.dispose();
      if (typeof err === 'string') return { error: err };
      if (err?.message === 'interrupted') return { error: `Abgebrochen nach ${timeMs} ms.` };
      return { error: `${err?.name && err.name !== 'Error' ? `${err.name}: ` : ''}${err?.message ?? 'Fehler'}` };
    }
    const value = vm.typeof(res.value) === 'string' ? vm.getString(res.value) : '';
    res.value.dispose();
    return { value };
  } catch (e) {
    // Out of memory and similar end up here.
    return { error: (e as Error).message || 'Der Hook ist abgestürzt.' };
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}

export async function runHook(code: string, event: Record<string, unknown>, timeMs = HOOK_TIME_MS): Promise<HookRun> {
  const started = performance.now();
  const logs: string[] = [];
  const done = (r: Omit<HookRun, 'logs' | 'ms'>): HookRun => ({ ...r, logs, ms: Math.round((performance.now() - started) * 10) / 10 });
  if (code.length > MAX_CODE) return done({ ok: false, result: null, error: `Der Code ist länger als ${MAX_CODE / 1000}k Zeichen.` });
  const payload = JSON.stringify(event);
  if (payload.length > MAX_PAYLOAD) return done({ ok: false, result: null, error: 'Die Daten sind zu gross für einen Hook.' });
  const r = await evaluate(
    `${code}
;(function () {
  if (typeof hook !== 'function') throw new Error('Der Code braucht eine Funktion «hook(event)».');
  const event = JSON.parse(${JSON.stringify(payload)});
  const r = hook(event);
  if (r && typeof r.then === 'function') throw new Error('hook darf nicht async sein – es gibt nichts zu warten.');
  return JSON.stringify(r && typeof r === 'object' ? r : event);
})()`,
    timeMs,
    logs,
  );
  if ('error' in r) return done({ ok: false, result: null, error: r.error });
  const parsed = JSON.parse(r.value || 'null') as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return done({ ok: false, result: null, error: 'hook muss das event (ein Objekt) zurückgeben oder nichts.' });
  return done({ ok: true, result: parsed as Record<string, unknown>, error: null });
}

/** Checks code before it is saved: it must load and define hook(). */
export async function checkHookCode(code: string): Promise<string | null> {
  if (code.length > MAX_CODE) return `Der Code ist länger als ${MAX_CODE / 1000}k Zeichen.`;
  const r = await evaluate(
    `${code}
;typeof hook === 'function' ? 'ok' : 'missing'`,
    200,
    [],
  );
  if ('error' in r) return r.error;
  return r.value === 'ok' ? null : 'Der Code braucht eine Funktion «hook(event)».';
}

async function hooksFor(event: HookEvent, collection?: string): Promise<ServerHook[]> {
  const s = await getSettings();
  return (s.hooks ?? []).filter((h) => h.active && h.event === event && (!collection || !h.collection || h.collection === collection));
}

function report(h: ServerHook, r: HookRun) {
  for (const l of r.logs) console.log(`[hook ${h.name}] ${l}`);
}

/** Entry hooks: returns the (possibly changed) data; throws 400 with the hook's message to reject. */
export async function entryHooks(event: 'entry.beforeSave' | 'entry.beforePublish', input: { collection: string; slug: string; data: Record<string, unknown>; isNew?: boolean }) {
  let data = input.data;
  for (const h of await hooksFor(event, input.collection)) {
    const r = await runHook(h.code, { ...input, data });
    report(h, r);
    if (!r.ok) throw badRequest(`${r.error}`, { hook: h.name });
    if (event === 'entry.beforeSave' && r.result?.data && typeof r.result.data === 'object' && !Array.isArray(r.result.data)) data = r.result.data as Record<string, unknown>;
  }
  return data;
}

/** Form hooks: changed fields, a rejection message for the visitor, or spam. */
export async function formHooks(input: {
  form: { id: string; name: string };
  fields: Record<string, string>;
  page: string;
}): Promise<{ fields: Record<string, string>; reject: string | null; spam: boolean }> {
  let fields = input.fields;
  for (const h of await hooksFor('form.beforeSubmit')) {
    const r = await runHook(h.code, { ...input, fields, spam: false });
    report(h, r);
    if (!r.ok) return { fields, reject: r.error, spam: false };
    if (r.result?.spam === true) return { fields, reject: null, spam: true };
    const f = r.result?.fields;
    if (f && typeof f === 'object' && !Array.isArray(f))
      fields = Object.fromEntries(Object.keys(fields).map((k) => [k, String((f as Record<string, unknown>)[k] ?? '').slice(0, 5000)]));
  }
  return { fields, reject: null, spam: false };
}
