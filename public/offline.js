const listeners = new Set();
let registration, pendingInstall, starting;
const status = {
  supported: "serviceWorker" in navigator && window.isSecureContext,
  preparing: false,
  ready: false,
  error: "",
  updateReady: false,
  installed:
    window.matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true,
  canInstall: false,
  persistence: "checking",
  networkOffline: !navigator.onLine,
};
const emit = () => listeners.forEach((listener) => listener(getDeviceStatus()));
export const getDeviceStatus = () => ({ ...status });
export function onDeviceStatus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  pendingInstall = event;
  status.canInstall = true;
  emit();
});
window.addEventListener("appinstalled", () => {
  pendingInstall = null;
  status.installed = true;
  status.canInstall = false;
  emit();
});
for (const name of ["online", "offline"])
  window.addEventListener(name, () => {
    status.networkOffline = !navigator.onLine;
    emit();
  });

function shellStatus(worker) {
  if (!worker) return Promise.resolve({ ready: false });
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(
        new Error(
          "Offline readiness could not be verified. Try preparing the app again.",
        ),
      );
    }, 5000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data);
    };
    worker.postMessage({ type: "SHELL_STATUS" }, [channel.port2]);
  });
}
async function refreshOfflineStatus() {
  try {
    const shell = await shellStatus(navigator.serviceWorker.controller);
    status.ready = shell.ready === true;
    status.updateReady = Boolean(registration?.waiting);
    status.preparing = Boolean(registration?.installing) && !status.ready;
    if (status.ready) status.error = "";
  } catch (error) {
    status.ready = false;
    status.preparing = false;
    status.error = error.message;
  }
  emit();
}
async function readPersistence() {
  try {
    status.persistence = navigator.storage?.persisted
      ? (await navigator.storage.persisted())
        ? "granted"
        : "not-granted"
      : "unavailable";
  } catch {
    status.persistence = "unavailable";
  }
  emit();
}
export async function requestStorageProtection() {
  if (!navigator.storage?.persist) {
    status.persistence = "unavailable";
    emit();
    return false;
  }
  try {
    const granted = await navigator.storage.persist();
    status.persistence = granted ? "granted" : "not-granted";
    emit();
    return granted;
  } catch {
    status.persistence = "unavailable";
    emit();
    return false;
  }
}
export async function installApp() {
  if (!pendingInstall) return false;
  const prompt = pendingInstall;
  pendingInstall = null;
  status.canInstall = false;
  emit();
  await prompt.prompt();
  const choice = await prompt.userChoice;
  // Acceptance alone is not proof that the OS installed the app; appinstalled confirms it.
  return choice.outcome === "accepted";
}
export async function checkForUpdates() {
  if (!registration) return prepareOffline();
  try {
    await registration.update();
  } catch {
    throw new Error(
      "The update check needs a connection to the app host. Your local care record is still available.",
    );
  }
  await refreshOfflineStatus();
}
export async function prepareOffline() {
  if (starting) return starting;
  if (!status.supported) {
    status.error =
      "Offline installation needs a supported browser and HTTPS. Localhost works for development on this computer; an ordinary HTTP tablet/LAN address does not.";
    status.preparing = false;
    emit();
    await readPersistence();
    return;
  }
  starting = (async () => {
    status.preparing = true;
    status.error = "";
    emit();
    try {
      registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      function watchWorker(worker) {
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "redundant" && !status.ready) {
            status.error =
              "Offline files could not be prepared. Keep the connection available and try again.";
            status.preparing = false;
            emit();
          } else refreshOfflineStatus();
        });
      }
      registration.addEventListener("updatefound", () => {
        watchWorker(registration.installing);
        refreshOfflineStatus();
      });
      watchWorker(registration.installing);
      await refreshOfflineStatus();
    } catch {
      if (navigator.serviceWorker.controller) await refreshOfflineStatus();
      status.preparing = false;
      if (!status.ready)
        status.error =
          "Offline files could not be prepared. Reconnect to the app host and try again.";
      emit();
    }
    await readPersistence();
  })();
  try {
    await starting;
  } finally {
    starting = null;
  }
}
if (status.supported)
  navigator.serviceWorker.addEventListener(
    "controllerchange",
    refreshOfflineStatus,
  );
