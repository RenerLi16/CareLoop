import { makeBackup, validateBackup, BACKUP_FORMAT } from "/care-record.js";
import {
  protectFile,
  unlockFile,
  PROTECTED_FORMAT,
  MAX_FILE_BYTES,
} from "/file-protection.js";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const summary = (record) =>
  record?.profile
    ? `<dl class="recovery-summary"><div><dt>Patient</dt><dd>${esc(record.profile.patient)}</dd></div><div><dt>Plan starts</dt><dd>${esc(record.plan?.startDate || record.profile.startDate)}</dd></div><div><dt>Care tasks</dt><dd>${record.tasks.length}</dd></div><div><dt>Completed / skipped</dt><dd>${record.tasks.filter((t) => t.status === "done").length} / ${record.tasks.filter((t) => t.status === "skipped").length}</dd></div><div><dt>Caregiver labels</dt><dd>${record.team.filter((p) => !p.archived).length}</dd></div></dl>`
    : "<p>No bedside record is set up in this browser.</p>";
const password = (name, label, creating = false) =>
  `<label>${label}<input type="password" name="${name}" ${creating ? 'minlength="12"' : ""} maxlength="256" required autocomplete="${creating ? "new-password" : "current-password"}"></label>`;
export function createRecovery({
  getLatest,
  save,
  download,
  onComplete,
  toast,
}) {
  let dialog,
    working = false,
    epoch = 0,
    selected = null,
    expectedVersion;
  function cancel() {
    epoch++;
    selected = null;
    dialog?.close();
    dialog?.remove();
    dialog = null;
  }
  function show(content) {
    cancel();
    dialog = document.createElement("dialog");
    dialog.id = "recovery-dialog";
    dialog.setAttribute("aria-labelledby", "recovery-title");
    dialog.innerHTML = content;
    document.body.append(dialog);
    dialog.addEventListener("cancel", (event) => {
      if (working) event.preventDefault();
    });
    const owned = dialog;
    dialog.addEventListener("close", () => {
      if (dialog === owned) {
        epoch++;
        selected = null;
        dialog = null;
      }
      owned.remove();
    });
    dialog.addEventListener("click", (event) => {
      const action = event.target.closest("[data-recovery-action]")?.dataset
        .recoveryAction;
      if (working || !action) return;
      if (action === "cancel") cancel();
      if (action === "export")
        openExport().catch((error) => toast(error.message, true));
    });
    dialog.addEventListener("submit", submit);
    dialog.showModal();
    return dialog;
  }
  const footer = (label) =>
    `<p class="alert" id="recovery-error" role="alert" tabindex="-1" hidden></p><div class="actions"><button type="submit" class="primary">${label}</button><button type="button" class="secondary" data-recovery-action="cancel">Cancel</button></div>`;
  async function openExport() {
    const record = await getLatest();
    if (!record.profile)
      throw new Error("There is no saved bedside record to back up yet.");
    show(
      `<form data-recovery-form="export"><h2 id="recovery-title">Save an encrypted backup</h2><p>Includes saved records only. Unsaved changes are excluded.</p>${summary(record)}${password("passphrase", "Backup passphrase (at least 12 characters)", true)}${password("repeat", "Repeat backup passphrase", true)}<p class="notice">Keep your passphrase. CareLoop cannot recover it.</p>${footer("Encrypt and download")}</form>`,
    );
    selected = makeBackup(record);
  }
  async function openImport(file) {
    if (!file || file.size > MAX_FILE_BYTES)
      throw new Error("Choose a CareLoop backup under 7 MB.");
    const baseline = await getLatest();
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new Error(
        "This file is not valid backup JSON. Nothing was changed.",
      );
    }
    if (parsed?.format === PROTECTED_FORMAT) {
      show(
        `<form data-recovery-form="unlock"><h2 id="recovery-title">Unlock backup for review</h2><p>Review the backup before replacing your record.</p>${password("passphrase", "Backup passphrase")}${footer("Unlock and review")}</form>`,
      );
      selected = parsed;
      expectedVersion = baseline.version;
    } else {
      if (parsed?.format !== BACKUP_FORMAT)
        throw new Error(
          "This is not a supported bedside backup. Nothing was changed.",
        );
      showPreview(parsed, baseline, baseline.version, true);
    }
  }
  function showPreview(backup, current, version, plain) {
    const record = validateBackup(backup);
    const date = new Date(backup.exportedAt).toLocaleString();
    show(
      `<form data-recovery-form="restore"><h2 id="recovery-title">Review before restoring</h2><p>Created ${esc(date)}.</p>${plain ? '<p class="notice">Unencrypted backup: anyone with the file can read it.</p>' : ""}<div class="restore-comparison"><section><h3>Backup to restore</h3>${summary(record)}</section><section><h3>Currently on this device</h3>${summary(current)}</section></div><label class="check"><input type="checkbox" name="understood" required>I understand this replaces the saved bedside record and current drafts. I have kept any current data I need.</label><label>Type RESTORE to replace the record<input name="confirmation" required autocomplete="off" pattern="RESTORE"></label>${footer("Replace with this backup")}</form>`,
    );
    selected = { ...backup, record };
    expectedVersion = version;
  }
  async function openDelete() {
    const record = await getLatest();
    if (!record.profile)
      throw new Error("There is no bedside record to delete.");
    show(
      `<form data-recovery-form="delete"><h2 id="recovery-title">Delete this browser’s care record?</h2>${summary(record)}<p>Deletes all care records and unsaved changes in this browser. Downloaded files, calendars, and other backups remain.</p><button type="button" class="secondary" data-recovery-action="export">Save an encrypted backup first</button><p class="muted">Check your backup downloaded before deleting.</p><label class="check"><input type="checkbox" name="understood" required>I understand this cannot be undone here without a backup.</label><label>Type DELETE to confirm<input name="confirmation" required autocomplete="off" pattern="DELETE"></label>${footer("Delete this browser’s record")}</form>`,
    );
    expectedVersion = record.version;
  }
  async function submit(event) {
    event.preventDefault();
    if (working) return;
    const form = event.target,
      kind = form.dataset.recoveryForm,
      data = new FormData(form),
      token = epoch;
    const buttons = [...form.querySelectorAll("button")];
    working = true;
    buttons.forEach((button) => (button.disabled = true));
    const error = form.querySelector("#recovery-error");
    error.hidden = true;
    try {
      if (kind === "export") {
        if (data.get("passphrase") !== data.get("repeat"))
          throw new Error("The two backup passphrases do not match.");
        validateBackup(selected);
        const encrypted = await protectFile(selected, data.get("passphrase"));
        if (token !== epoch) return;
        download(
          `careloop-backup-${new Date().toISOString().slice(0, 10)}.json`,
          JSON.stringify(encrypted),
          "application/json",
        );
        form.reset();
        cancel();
        toast(
          "Encrypted download started. Check the saved file and keep its passphrase separately.",
        );
      }
      if (kind === "unlock") {
        const decrypted = await unlockFile(selected, data.get("passphrase"));
        if (token !== epoch) return;
        form.reset();
        const current = await getLatest();
        if (token !== epoch) return;
        showPreview(decrypted, current, expectedVersion, false);
      }
      if (kind === "restore" || kind === "delete") {
        const word = kind === "restore" ? "RESTORE" : "DELETE";
        if (data.get("confirmation") !== word || !data.has("understood"))
          throw new Error(`Acknowledge the change and type ${word} exactly.`);
        await save(
          kind === "restore"
            ? { type: "restore", backup: selected }
            : { type: "reset", confirm: "DELETE" },
          expectedVersion,
        );
        if (token !== epoch) return;
        cancel();
        await onComplete(kind);
        toast(
          kind === "restore"
            ? "Backup restored."
            : "This browser’s care record was deleted.",
        );
      }
    } catch (problem) {
      if (token !== epoch) return;
      error.textContent =
        problem.status === 409
          ? "The saved record changed in another tab. Cancel and reopen this backup or deletion screen to review the latest record. Nothing was replaced."
          : problem.message;
      error.hidden = false;
      error.focus();
    } finally {
      working = false;
      for (const button of buttons)
        if (button.isConnected) button.disabled = false;
    }
  }
  return { openExport, openImport, openDelete, cancel };
}
