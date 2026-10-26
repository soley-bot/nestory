import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const FIXTURE_UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const zero = '00000000-0000-0000-0000-000000000000';

// A case namespace is public synthetic test identity, never a credential.
export function concurrencyIdentityProfile(namespace, sources = []) {
  assert.match(namespace, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const ids = new Map();
  const emails = new Map();
  const digest = value => createHash('sha256').update(`${namespace}/${value}`).digest('hex');
  const id = value => {
    assert.match(value, new RegExp(`^${FIXTURE_UUID.source}$`, 'i'));
    if (value === zero) return value; // Supabase Auth's instance sentinel.
    const hash = digest(value.toLowerCase());
    const mapped = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    ids.set(value.toLowerCase(), mapped);
    return mapped;
  };
  const email = value => {
    const mapped = `ci-${digest(value.toLowerCase()).slice(0, 32)}@example.test`;
    emails.set(value.toLowerCase(), mapped);
    return mapped;
  };
  for (const source of sources) {
    for (const value of source.match(FIXTURE_UUID) ?? []) id(value);
    for (const value of source.match(/[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? []) email(value);
  }
  const suffix = namespace.replaceAll('-', '');
  const sql = source => source
    .replace(FIXTURE_UUID, value => ids.get(value.toLowerCase()) ?? value)
    .replace(/[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, value => emails.get(value.toLowerCase()) ?? value)
    .replaceAll("'@lease-rent.test'", `'@case-${suffix}.invalid'`)
    .replaceAll("'lease-rent-test'", `'lease-rent-${suffix}'`)
    .replaceAll("'nestory-sample-operations'", `'concurrency-${suffix}'`);
  return Object.freeze({ namespace, id, email, sql, mappedIds: () => [...new Set(ids.values())], assertApi(value) {
    const url = new URL(value);
    assert.equal(url.protocol, 'http:');
    assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'Concurrency fixture API must be loopback.');
    assert.equal(url.username + url.password + url.search + url.hash, '');
  } });
}
