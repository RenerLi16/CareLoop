import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecordStore, StaleRecordError } from "../src/record-store.js";
import { emptyRecord } from "../src/record.js";
function storage() {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
  };
}
function mutex() {
  let tail = Promise.resolve();
  return {
    request: (_name, _options, callback) => {
      const result = tail.then(callback);
      tail = result.catch(() => {});
      return result;
    },
  };
}
test("two simultaneous saves from the same revision cannot overwrite one another", async () => {
  const s = storage(),
    locks = mutex(),
    a = createRecordStore(s, locks),
    b = createRecordStore(s, locks),
    one = a.read(),
    two = b.read();
  one.record.team = [{ id: "a", name: "Lan", rel: "" }];
  two.record.team = [{ id: "b", name: "Minh", rel: "" }];
  const results = await Promise.allSettled([
    a.replace(one.record, one.token),
    b.replace(two.record, two.token),
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.ok(results[1].reason instanceof StaleRecordError);
  assert.equal(a.read().record.team[0].name, "Lan");
});
test("deletion keeps a revision tombstone so a stale tab cannot resurrect a record", async () => {
  const store = createRecordStore(storage(), mutex());
  const first = await store.replace(emptyRecord(), null);
  const deleted = await store.replace(emptyRecord(), first.token);
  assert.equal(deleted.record.revision, 2);
  await assert.rejects(
    store.replace(first.record, first.token),
    StaleRecordError,
  );
});
test("failed browser storage writes do not claim a new revision was saved", async () => {
  const s = storage(),
    store = createRecordStore(s, mutex());
  const first = await store.replace(emptyRecord(), null);
  s.setItem = () => {
    throw new Error("Full");
  };
  await assert.rejects(
    store.replace(emptyRecord(), first.token),
    /could not be saved/,
  );
  assert.equal(store.read().record.revision, 1);
});
test("unsupported saving environments fail closed rather than using an unsafe fallback", async () => {
  const store = createRecordStore(storage(), null);
  await assert.rejects(store.replace(emptyRecord(), null), /Safe saving/);
  assert.equal(store.read().token, null);
});
