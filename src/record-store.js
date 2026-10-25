import { RECORD_KEY, emptyRecord, normalizeRecord } from "./record.js";
export class StaleRecordError extends Error {
  constructor() {
    super(
      "Another tab changed this record. Reload the saved version before saving this draft.",
    );
    this.name = "StaleRecordError";
  }
}
export function createRecordStore(
  storage = globalThis.localStorage,
  locks = globalThis.navigator?.locks,
) {
  function read() {
    const token = storage.getItem(RECORD_KEY);
    return {
      record:
        token === null ? emptyRecord() : normalizeRecord(JSON.parse(token)),
      token,
    };
  }
  async function replace(record, expectedToken) {
    if (!locks?.request)
      throw new Error(
        "Safe saving is unavailable in this browser. Use an updated browser with HTTPS, localhost, or the standalone file.",
      );
    return locks.request("careloop-record-write", { mode: "exclusive" }, () => {
      const current = read();
      if (current.token !== expectedToken) throw new StaleRecordError();
      const candidate = normalizeRecord(record);
      candidate.revision = current.record.revision + 1;
      const token = JSON.stringify(candidate);
      try {
        storage.setItem(RECORD_KEY, token);
      } catch (error) {
        throw new Error(
          "Changes could not be saved. Browser storage may be full or unavailable.",
        );
      }
      return { record: candidate, token };
    });
  }
  return { read, replace };
}
