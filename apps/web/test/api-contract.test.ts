import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The web app calls database functions by name with named arguments. A typo
 * would only fail at run time against Supabase, so check every call against
 * the functions the migrations create.
 */
const root = join(__dirname, '..', '..', '..');
const sql = readdirSync(join(root, 'supabase', 'migrations'))
  .sort()
  .map((f) => readFileSync(join(root, 'supabase', 'migrations', f), 'utf8'))
  .join('\n');

const functions = new Map<string, { params: string[]; required: string[] }>();
for (const m of sql.matchAll(/create (?:or replace )?function public\.(app_\w+)\(([\s\S]*?)\)\s*returns/g)) {
  const params = m[2]!.split(',').map((p) => p.trim()).filter(Boolean);
  functions.set(m[1]!, {
    params: params.map((p) => p.split(/\s+/)[0]!),
    required: params.filter((p) => !/\bdefault\b/i.test(p)).map((p) => p.split(/\s+/)[0]!),
  });
}

function callsIn(file: string): Array<{ fn: string; args: string[] }> {
  const src = readFileSync(join(__dirname, '..', file), 'utf8');
  const calls: Array<{ fn: string; args: string[] }> = [];
  for (const m of src.matchAll(/(?:call(?:<[^>]*>)?|\.rpc)\(\s*'(app_\w+)'\s*(?:,\s*\{([^;]*?)\}\s*(?=\)+\s*(?:;|\{)))?/g)) {
    const args = [...(m[2] ?? '').matchAll(/\b(p_\w+)\s*:/g)].map((a) => a[1]!);
    calls.push({ fn: m[1]!, args });
  }
  return calls;
}

describe('database API calls', () => {
  const calls = ['lib/data/supabase.ts', 'lib/session.ts', 'app/account/password/actions.ts'].flatMap(callsIn);

  it('finds the functions and the calls', () => {
    expect(functions.size).toBeGreaterThan(25);
    expect(calls.length).toBeGreaterThan(25);
  });

  it.each(calls.map((c) => [c.fn, c.args] as const))('%s is called with its parameters', (fn, args) => {
    const def = functions.get(fn);
    expect(def, `${fn} is not created by any migration`).toBeDefined();
    expect(args.filter((a) => !def!.params.includes(a)), 'unknown arguments').toEqual([]);
    expect(def!.required.filter((p) => !args.includes(p)), 'missing arguments').toEqual([]);
  });
});
