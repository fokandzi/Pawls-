// Minimal `bun:test` surface for running the hermetic suites under Node
// (describe/test/expect/hooks/mock.module). mock.module is a no-op here: the
// runner already redirects src/db.ts to the PGlite test database at resolve
// time, which is the only module the hermetic suites mock.
import { isDeepStrictEqual, inspect } from "node:util";

const stack = [];

function current() {
  return stack[stack.length - 1] ?? null;
}
function newSuite(name, parent) {
  return { name, parent, beforeAll: [], afterAll: [], beforeEach: [], afterEach: [], children: [] };
}
export const root = newSuite("", null);
stack.push(root);

export function describe(name, fn) {
  const s = newSuite(name, current());
  current().children.push({ kind: "suite", suite: s });
  stack.push(s);
  try {
    fn();
  } finally {
    stack.pop();
  }
}
export function test(name, fn) {
  current().children.push({ kind: "test", name, fn });
}
test.skip = (name) => current().children.push({ kind: "skip", name });
describe.skip = (name) => current().children.push({ kind: "skip", name });
export const it = test;
export const beforeAll = (fn) => current().beforeAll.push(fn);
export const afterAll = (fn) => current().afterAll.push(fn);
export const beforeEach = (fn) => current().beforeEach.push(fn);
export const afterEach = (fn) => current().afterEach.push(fn);
export const mock = Object.assign(() => {}, { module: () => {} });

const fmt = (v) => inspect(v, { depth: 4, breakLength: 120 });

function matchers(actual, negate) {
  const check = (pass, msg) => {
    if (pass === negate) throw new Error((negate ? "not " : "") + msg);
  };
  return {
    toBe: (e) => check(Object.is(actual, e), `expected ${fmt(actual)} to be ${fmt(e)}`),
    toEqual: (e) =>
      check(
        isDeepStrictEqual(JSON.parse(JSON.stringify(actual ?? null)), JSON.parse(JSON.stringify(e ?? null))),
        `expected ${fmt(actual)} to equal ${fmt(e)}`,
      ),
    toStrictEqual: (e) => check(isDeepStrictEqual(actual, e), `expected ${fmt(actual)} to strictly equal ${fmt(e)}`),
    toBeTruthy: () => check(!!actual, `expected ${fmt(actual)} to be truthy`),
    toBeFalsy: () => check(!actual, `expected ${fmt(actual)} to be falsy`),
    toBeNull: () => check(actual === null, `expected ${fmt(actual)} to be null`),
    toBeUndefined: () => check(actual === undefined, `expected ${fmt(actual)} to be undefined`),
    toBeDefined: () => check(actual !== undefined, `expected value to be defined`),
    toContain: (e) => check(actual?.includes?.(e) ?? false, `expected ${fmt(actual)} to contain ${fmt(e)}`),
    toMatch: (re) => check(new RegExp(re).test(String(actual)), `expected ${fmt(actual)} to match ${re}`),
    toHaveLength: (n) => check(actual?.length === n, `expected length ${actual?.length} to be ${n}`),
    toBeGreaterThan: (n) => check(actual > n, `expected ${actual} > ${n}`),
    toBeGreaterThanOrEqual: (n) => check(actual >= n, `expected ${actual} >= ${n}`),
    toBeLessThan: (n) => check(actual < n, `expected ${actual} < ${n}`),
    toBeLessThanOrEqual: (n) => check(actual <= n, `expected ${actual} <= ${n}`),
    toThrow: (re) => {
      let threw = false;
      let err;
      try {
        actual();
      } catch (e) {
        threw = true;
        err = e;
      }
      check(threw && (!re || new RegExp(re).test(String(err?.message ?? err))), `expected function to throw ${re ?? ""}`);
    },
  };
}
export function expect(actual) {
  const m = matchers(actual, false);
  m.not = matchers(actual, true);
  return m;
}

async function runSuite(suite, prefix, hooks, out) {
  const name = suite.name ? (prefix ? `${prefix} > ${suite.name}` : suite.name) : prefix;
  const each = { before: [...hooks.before, ...suite.beforeEach], after: [...suite.afterEach, ...hooks.after] };
  try {
    for (const h of suite.beforeAll) await h();
  } catch (e) {
    out.push({ name: `${name} (beforeAll)`, ok: false, error: e });
    return;
  }
  for (const child of suite.children) {
    if (child.kind === "suite") await runSuite(child.suite, name, each, out);
    else if (child.kind === "skip") out.push({ name: `${name} > ${child.name}`, skipped: true });
    else {
      const full = name ? `${name} > ${child.name}` : child.name;
      try {
        for (const h of each.before) await h();
        await child.fn();
        for (const h of each.after) await h();
        out.push({ name: full, ok: true });
      } catch (e) {
        out.push({ name: full, ok: false, error: e });
      }
    }
  }
  for (const h of suite.afterAll) await h();
}

export async function runAll() {
  const out = [];
  await runSuite(root, "", { before: [], after: [] }, out);
  return out;
}
