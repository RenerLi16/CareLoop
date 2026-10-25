# CareLoop bedside data handling

CareLoop is an account-free care planner for one device. The app does not upload the patient’s care record. It saves that record in the browser used on the bedside tablet.

## On the device

The local record includes the patient’s nickname, entered discharge text, medication and timing fields, caregiver labels, tasks, measurements, notes, and activity history. It is stored in IndexedDB for this browser/profile and app address. Unsaved drafts remain in the open page and are not included in backups until published.

The working record is not separately encrypted by CareLoop. There is no sign-in or verified caregiver identity. Anyone able to use this browser can access or change the record. Use the device’s screen lock. Browser/OS backups and device-management policies are outside the app’s control.

Offline app files are stored in a separate cache. That cache contains only a fixed list of interface files, code, icons, the manifest, and fictional sample text. It does not contain exported backups, runtime care records, or arbitrary requested URLs.

## Network requests

Initial loading and app updates request static app files from the app host. The host may receive ordinary connection details such as IP address and browser information, and may retain its own access logs. The application has no patient-data API or upload handler, sends no patient data in its app requests, and uses no external analytics or AI services.

Offline use requires the app files to have finished downloading. An installed/cached copy can work without a server connection. Browser storage protection is optional and browser-controlled; it cannot prevent a user clearing site data or losing the device.

## Files and notifications

Encrypted backups are created locally with a passphrase chosen at download time. The file contains the saved care record and history; the outer protected envelope contains encryption settings and ciphertext rather than patient details. CareLoop does not save the passphrase and cannot recover it. Anyone with both the file and passphrase can read it.

The app can also import older unencrypted bedside backups. It labels those files as unencrypted and requires a reviewed, confirmed replacement. The old server-app backup format is not automatically imported.

Calendar export is optional and produces a separate file containing care details. Importing that file into a cloud calendar may copy the details outside the device. Those calendar copies do not automatically follow later edits or deletion in CareLoop.

Page notifications use a generic message without patient or medication names. They require permission and an open, awake page and do not guarantee alarms when the device is locked or the app is closed.

## Deletion and limits

Confirmed deletion removes the active local profile, caregiver entries, plan, tasks, and activity in this browser. An empty version marker remains to prevent stale-tab writes. Open tabs receive a local change notice and discard stale record screens.

This is logical deletion, not secure wiping of recoverable storage blocks. It does not remove downloaded backups, external calendar entries, OS/browser backups, or the previous server database if one exists on the development computer. The bedside app does not read that old database.

Clearing browser data, private-browsing cleanup, storage eviction, a lost device, or a forgotten backup passphrase can make records unrecoverable. Keep a private, tested encrypted backup. These statements describe the implementation; they are not an independent security audit, regulatory certification, or clinical validation.
