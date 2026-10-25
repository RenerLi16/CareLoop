import { protectFile, unlockFile, MAX_FILE_BYTES } from "./file-protection.js";
import { BACKUP_FORMAT, validateBackup, emptyRecord } from "./record.js";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
export function createRecovery({ snapshot, replace, notify, afterChange }) {
  let dialog,
    selected,
    baseline,
    working = false,
    epoch = 0;
  const summary = (record) =>
    `<dl class="backup-summary"><dt>Patient</dt><dd>${escape(record.patient?.name || "No plan")}</dd><dt>Tasks</dt><dd>${record.tasks.length}</dd><dt>Recorded</dt><dd>${record.tasks.filter((t) => t.status !== "todo").length}</dd><dt>Caregivers</dt><dd>${record.team.filter((p) => !p.archived).length}</dd></dl>`;
  const controls = (label) =>
    `<p id="recovery-error" role="alert"></p><div class="dialog-actions"><button class="act" type="submit">${label}</button><button class="ghost" type="button" data-recovery="cancel">Cancel</button></div>`;
  const pass = (label, name) =>
    `<label class="field">${label}<input type="password" name="${name}" required maxlength="256" autocomplete="off"></label>`;
  function close() {
    epoch++;
    selected = null;
    baseline = null;
    working = false;
    if (dialog) {
      dialog.close();
      dialog.remove();
      dialog = null;
    }
  }
  function show(html) {
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "recovery-dialog";
      dialog.setAttribute("aria-labelledby", "recovery-title");
      document.body.append(dialog);
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        const kind = dialog.querySelector("form")?.dataset.recoveryForm;
        if (working && ["restore", "delete"].includes(kind)) return;
        close();
      });
      dialog.addEventListener("click", (event) => {
        const action =
          event.target.closest("[data-recovery]")?.dataset.recovery;
        if (action === "cancel") close();
        if (action === "backup" && !working) openExport();
      });
      dialog.addEventListener("submit", submit);
      dialog.showModal();
    }
    dialog.innerHTML = html;
  }
  function openExport() {
    close();
    const current = snapshot();
    if (!current.record.patient) {
      notify("Save a care plan before making a backup.");
      return;
    }
    selected = {
      format: BACKUP_FORMAT,
      createdAt: new Date().toISOString(),
      record: current.record,
    };
    show(
      `<form data-recovery-form="export"><h2 id="recovery-title">Save encrypted backup</h2>${summary(current.record)}${pass("Passphrase (at least 12 characters)", "passphrase")}${pass("Repeat passphrase", "repeat")}<p class="small">Keep the passphrase. CareLoop cannot recover it.</p>${controls("Encrypt and download")}</form>`,
    );
  }
  async function openImport(file) {
    close();
    if (!file || file.size > MAX_FILE_BYTES) {
      notify("Choose a CareLoop backup under 7 MB.");
      return;
    }
    const operation = ++epoch;
    baseline = snapshot();
    try {
      const value = JSON.parse(await file.text());
      if (operation !== epoch) return;
      selected = value;
      show(
        `<form data-recovery-form="unlock"><h2 id="recovery-title">Unlock backup</h2>${pass("Backup passphrase", "passphrase")}${controls("Unlock and review")}</form>`,
      );
    } catch (error) {
      if (operation === epoch)
        notify("This file is not a readable CareLoop backup.");
    }
  }
  function openDelete() {
    close();
    baseline = snapshot();
    show(
      `<form data-recovery-form="delete"><h2 id="recovery-title">Delete this care record?</h2>${summary(baseline.record)}<p>Deletes the plan and records in this browser. Downloaded backups remain.</p><button type="button" class="ghost" data-recovery="backup">Save a backup first</button><label class="ck"><input type="checkbox" name="understood" required>I understand this cannot be undone without a backup.</label><label class="field">Type DELETE<input name="confirmation" required pattern="DELETE" autocomplete="off"></label>${controls("Delete record")}</form>`,
    );
  }
  async function submit(event) {
    event.preventDefault();
    if (working) return;
    const form = event.target,
      data = new FormData(form),
      kind = form.dataset.recoveryForm,
      operation = epoch;
    working = true;
    for (const control of dialog.querySelectorAll("button,input"))
      control.disabled = true;
    try {
      if (kind === "export") {
        if (data.get("passphrase") !== data.get("repeat"))
          throw new Error("The passphrases do not match.");
        const encrypted = await protectFile(selected, data.get("passphrase"));
        if (operation !== epoch) return;
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(encrypted)], { type: "application/json" }),
          ),
          link = document.createElement("a");
        link.href = url;
        link.download =
          "careloop-backup-" + new Date().toISOString().slice(0, 10) + ".json";
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        close();
        notify("Encrypted backup downloaded.");
      } else if (kind === "unlock") {
        const payload = await unlockFile(selected, data.get("passphrase"));
        if (operation !== epoch) return;
        const record = validateBackup(payload);
        selected = record;
        show(
          `<form data-recovery-form="restore"><h2 id="recovery-title">Review before restoring</h2><div class="restore-columns"><section><h3>Backup</h3>${summary(record)}</section><section><h3>Current record</h3>${summary(baseline.record)}</section></div><label class="ck"><input type="checkbox" name="understood" required>Replace this browser’s saved record and drafts.</label><label class="field">Type RESTORE<input name="confirmation" required pattern="RESTORE" autocomplete="off"></label>${controls("Restore this backup")}</form>`,
        );
      } else if (kind === "restore" || kind === "delete") {
        const word = kind === "restore" ? "RESTORE" : "DELETE";
        if (data.get("confirmation") !== word || !data.has("understood"))
          throw new Error("Complete the confirmation first.");
        await replace(
          kind === "restore" ? selected : emptyRecord(),
          baseline.token,
        );
        if (operation !== epoch) return;
        close();
        afterChange();
        notify(
          kind === "restore" ? "Backup restored." : "Care record deleted.",
        );
      }
    } catch (error) {
      if (operation === epoch && dialog) {
        const target = dialog.querySelector("#recovery-error");
        target.textContent = error.message;
        target.tabIndex = -1;
        target.focus();
      }
    } finally {
      if (operation === epoch && dialog) {
        working = false;
        for (const control of dialog.querySelectorAll("button,input"))
          control.disabled = false;
      }
    }
  }
  return { openExport, openImport, openDelete };
}
