import { emptyRecord, changeRecord } from "/care-record.js";

const DB_NAME = "careloop-bedside";
const STORE = "records";
let connection;
const channel =
  typeof BroadcastChannel === "function"
    ? new BroadcastChannel("careloop-bedside-updates")
    : null;
const listeners = new Set();
if (channel)
  channel.onmessage = () => listeners.forEach((listener) => listener());

function openDatabase() {
  if (!globalThis.indexedDB)
    return Promise.reject(
      new Error(
        "This browser cannot save care records. Try a regular browser window with site storage enabled.",
      ),
    );
  if (!connection)
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onerror = () => {
        connection = null;
        reject(
          new Error(
            "Local storage could not be opened. Check your browser’s site-storage settings.",
          ),
        );
      };
      request.onblocked = () => {
        connection = null;
        reject(
          new Error(
            "Close other CareLoop tabs, then reopen this page to update local storage.",
          ),
        );
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          connection = null;
        };
        resolve(database);
      };
    });
  return connection;
}
function saveError(error) {
  if (error?.name === "QuotaExceededError")
    return new Error(
      "Not saved: this device’s browser storage is full. Free space or export a backup before retrying.",
    );
  return new Error(
    "Not saved: local storage is unavailable. Keep this page open and try again.",
  );
}
export async function loadRecord() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get("current");
    tx.oncomplete = () => {
      const record = request.result ?? emptyRecord();
      if (
        record.schemaVersion !== 1 ||
        !Number.isSafeInteger(record.version) ||
        !Array.isArray(record.tasks) ||
        !Array.isArray(record.team) ||
        !Array.isArray(record.audit) ||
        !("profile" in record)
      ) {
        reject(
          new Error(
            "The saved record has an unsupported format. It has not been replaced. Keep this browser’s data and restore from a compatible backup.",
          ),
        );
        return;
      }
      resolve(record);
    };
    tx.onabort = () => reject(saveError(tx.error));
    tx.onerror = () => {};
  });
}
export async function saveChange(command, expectedVersion) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE),
      request = store.get("current");
    let next, problem;
    request.onsuccess = () => {
      try {
        next = changeRecord(
          request.result ?? emptyRecord(),
          command,
          expectedVersion,
        );
        store.put(next, "current");
      } catch (error) {
        problem = error.status ? error : saveError(error);
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      channel?.postMessage({ version: next.version });
      resolve(next);
    };
    tx.onabort = () => reject(problem ?? saveError(tx.error));
    tx.onerror = () => {};
  });
}
export function onRecordChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
