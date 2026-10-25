import { test } from "node:test";
import assert from "node:assert/strict";
import {
  protectFile,
  unlockFile,
  PROTECTED_FORMAT,
} from "../src/file-protection.js";
const passphrase = "four private bedside words";
const payload = {
  patient: "Private patient 測試",
  drugs: ["Example A 10 mg"],
  history: ["completed"],
};
test("a protected file round-trips Unicode without disclosing names, doses, or passphrase in its envelope", async () => {
  const file = await protectFile(payload, passphrase);
  const json = JSON.stringify(file);
  assert.equal(file.format, PROTECTED_FORMAT);
  assert.equal(file.kdf.iterations, 600000);
  for (const secret of [payload.patient, payload.drugs[0], passphrase])
    assert.ok(!json.includes(secret));
  assert.deepEqual(await unlockFile(file, passphrase), payload);
});
test("each export has a fresh random salt, IV and ciphertext", async () => {
  const a = await protectFile(payload, passphrase),
    b = await protectFile(payload, passphrase);
  assert.notEqual(a.kdf.salt, b.kdf.salt);
  assert.notEqual(a.cipher.iv, b.cipher.iv);
  assert.notEqual(a.data, b.data);
});
test("wrong passphrases and authenticated-data corruption cannot decrypt a file", async () => {
  const file = await protectFile(payload, passphrase);
  await assert.rejects(
    unlockFile(file, "wrong passphrase"),
    /Could not unlock/,
  );
  const bytes = Buffer.from(file.data, "base64");
  bytes[2] ^= 1;
  await assert.rejects(
    unlockFile({ ...file, data: bytes.toString("base64") }, passphrase),
    /Could not unlock/,
  );
});
test("unsupported or malicious settings are rejected before doing an expensive key derivation", async () => {
  const file = await protectFile(payload, passphrase);
  for (const invalid of [
    { ...file, format: "other" },
    { ...file, kdf: { ...file.kdf, iterations: 2 ** 31 } },
    { ...file, kdf: { ...file.kdf, salt: "bad!" } },
    { ...file, cipher: { ...file.cipher, iv: "AAAA" } },
    { ...file, data: "AAAA" },
  ])
    await assert.rejects(
      unlockFile(invalid, passphrase),
      /format|settings|truncated/,
    );
});
test("short, whitespace-only and oversized passphrases are refused on export", async () => {
  for (const invalid of ["short", " ".repeat(20), "a".repeat(257)])
    await assert.rejects(protectFile(payload, invalid), /passphrase/);
});
test("passphrase spaces are meaningful and are never silently trimmed", async () => {
  const phrase = "  correct private words  ",
    file = await protectFile(payload, phrase);
  assert.deepEqual(await unlockFile(file, phrase), payload);
  await assert.rejects(unlockFile(file, phrase.trim()), /Could not unlock/);
});
test("file-size bounds are checked before encryption and oversized encoded files are rejected", async () => {
  await assert.rejects(
    protectFile({ data: "x".repeat(5000000) }, passphrase),
    /5 MB/,
  );
  const file = {
    format: PROTECTED_FORMAT,
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: 600000,
      salt: Buffer.alloc(16).toString("base64"),
    },
    cipher: {
      name: "AES-GCM",
      iv: Buffer.alloc(12).toString("base64"),
      tagLength: 128,
    },
    data: "A".repeat(7000004),
  };
  await assert.rejects(unlockFile(file, passphrase), /format/);
});
