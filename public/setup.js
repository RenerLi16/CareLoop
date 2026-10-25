export function createSetupWizard({
  snapshot,
  saveSetup,
  renderTeam,
  afterFinish,
}) {
  const dialog = document.querySelector("#setup-dialog");
  const stage = dialog.querySelector("#setup-stage");
  const progress = dialog.querySelector("#setup-progress");
  const error = dialog.querySelector("#setup-error");
  const teamEditor = document.querySelector("#caregiverEditor");
  const importer = document.querySelector("#p-import");
  const teamAnchor = document.createComment("Care team editor home");
  const importAnchor = document.createComment("Discharge editor home");
  teamEditor.before(teamAnchor);
  importer.before(importAnchor);
  let step = 0,
    transitioning = false;
  const labels = ["Welcome", "Patient", "Care team", "Discharge"];
  const arrow =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const mark =
    '<img src="/careloop-logo.png" alt="CareLoop logo" width="142" height="147">';
  const controls = (next, skip = false) =>
    `<div class="setup-actions"><button class="setup-back" type="button" data-setup-action="back">← Back</button><div>${skip ? '<button class="setup-skip" type="button" data-setup-action="skip">Skip for now</button>' : ""}${next ? `<button class="act setup-primary" type="button" data-setup-action="next">${next} ${arrow}</button>` : ""}</div></div>`;
  function restoreEditors() {
    teamAnchor.after(teamEditor);
    importAnchor.after(importer);
    importer.classList.toggle(
      "on",
      document.querySelector('nav [data-t="import"]')?.classList.contains("on"),
    );
  }
  function focusStep() {
    const target = stage.querySelector(
      step === 1 ? "#setup-patient-name" : "#setup-title",
    );
    target?.focus({ preventScroll: true });
  }
  function paint() {
    restoreEditors();
    error.textContent = "";
    stage.dataset.step = String(step);
    progress.innerHTML = labels
      .map(
        (label, index) =>
          `<li ${index === step ? 'aria-current="step"' : ""} class="${index <= step ? "reached" : ""}"><span class="setup-step-dot" aria-hidden="true"></span><span>${label}</span></li>`,
      )
      .join("");
    if (step === 0)
      stage.innerHTML = `<section class="setup-screen setup-welcome"><div class="setup-logo-art logo-crop">${mark}</div><h1 id="setup-title" class="setup-brand-title brand-name" data-no-translate tabindex="-1">CareLoop</h1><p class="setup-slogan" data-no-translate>Discharge to Routine</p><p class="setup-description">Bring medicines, daily care, and the people who help into one clear schedule.</p><div class="setup-preview" aria-hidden="true"><span class="setup-preview-dot"></span><div><b>One day at a time</b><span>A clear next step. A shared routine.</span></div><span class="setup-preview-check">✓</span></div><button class="act setup-primary setup-start" type="button" data-setup-action="next">Let’s get started ${arrow}</button></section>`;
    if (step === 1) {
      stage.innerHTML = `<section class="setup-screen"><p class="setup-eyebrow">First, a little introduction</p><h1 id="setup-title" tabindex="-1">Who are we caring for?</h1><p class="setup-description">Let’s make their care feel a little more personal.</p><form id="setup-name-form"><label class="setup-input-label" for="setup-patient-name">Patient’s name</label><div class="setup-name-field"><input id="setup-patient-name" name="patientName" maxlength="100" autocomplete="off" placeholder="Enter their name" required><button class="setup-name-next" type="submit" data-setup-action="name-next" aria-label="Continue to care team" disabled>${arrow}</button></div></form>${controls(null)}</section>`;
      const input = stage.querySelector("#setup-patient-name");
      input.value = snapshot().setup?.patientName || "";
      const updateArrow = () => {
        stage.querySelector(".setup-name-next").disabled =
          transitioning || !input.value.trim();
      };
      input.addEventListener("input", updateArrow);
      updateArrow();
      stage.querySelector("#setup-name-form").onsubmit = (event) => {
        event.preventDefault();
        void advance();
      };
    }
    if (step === 2) {
      stage.innerHTML = `<section class="setup-screen setup-team-screen"><p class="setup-eyebrow">Care works better together</p><h1 id="setup-title" tabindex="-1">Add your care team.</h1><p class="setup-description">Who will be helping? Add family, friends, or caregivers. You can always change this later.</p><div id="setup-team-host" class="setup-team-host"></div>${controls("Continue", true)}</section>`;
      stage.querySelector("#setup-team-host").append(teamEditor);
      renderTeam();
    }
    if (step === 3) {
      stage.innerHTML = `<section class="setup-screen setup-discharge-screen"><p class="setup-eyebrow">Make room for a routine</p><h1 id="setup-title" tabindex="-1">Add discharge instructions.</h1><p class="setup-description">Paste the summary, review the details, and build the first schedule. If you don’t have it handy, you can set this up later.</p>${controls(null, true)}<div id="setup-discharge-host"></div></section>`;
      stage.querySelector("#setup-discharge-host").append(importer);
      importer.classList.add("on");
    }
    stage.querySelectorAll("[data-setup-action]").forEach((button) => {
      if (button.dataset.setupAction === "name-next") return;
      button.onclick = () => {
        if (button.dataset.setupAction === "back") void move(step - 1);
        else if (button.dataset.setupAction === "skip" && step === 3)
          void complete();
        else void advance();
      };
    });
  }
  async function fade(out) {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) return;
    const animation = stage.animate(
      out
        ? [
            { opacity: 1, transform: "translateY(0)" },
            { opacity: 0, transform: "translateY(-8px)" },
          ]
        : [
            { opacity: 0, transform: "translateY(10px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
      {
        duration: out ? 150 : 230,
        easing: "cubic-bezier(.2,.7,.2,1)",
        fill: "both",
      },
    );
    const reduceMotion = () => {
      if (motion.matches) animation.finish();
    };
    motion.addEventListener("change", reduceMotion);
    try {
      await animation.finished;
    } finally {
      motion.removeEventListener("change", reduceMotion);
      animation.cancel();
    }
  }
  async function persist(nextStep, completed = false, patientName) {
    const current = snapshot();
    const profile = {
      step: nextStep,
      patientName: patientName ?? current.setup?.patientName ?? "",
      completed,
    };
    const saved = await saveSetup(profile);
    if (!saved)
      error.textContent =
        document.querySelector("#saveStatus").textContent ||
        "Your changes could not be saved. Please try again.";
    return saved;
  }
  function setWorking(value) {
    stage.setAttribute("aria-busy", String(value));
    stage.querySelectorAll("[data-setup-action]").forEach((button) => {
      button.disabled = value;
    });
    const nameButton = stage.querySelector(".setup-name-next");
    if (nameButton && !value)
      nameButton.disabled = !stage
        .querySelector("#setup-patient-name")
        .value.trim();
  }
  async function move(nextStep, patientName) {
    if (transitioning) return;
    transitioning = true;
    setWorking(true);
    try {
      if (!(await persist(nextStep, false, patientName))) return;
      await fade(true);
      step = nextStep;
      paint();
      dialog.scrollTo({ top: 0 });
      await fade(false);
      focusStep();
    } finally {
      transitioning = false;
      setWorking(false);
    }
  }
  async function advance() {
    if (step === 1) {
      const name = stage.querySelector("#setup-patient-name").value.trim();
      if (!name) return;
      await move(2, name);
    } else await move(step + 1);
  }
  function close(destination = "home") {
    restoreEditors();
    dialog.close();
    document.body.classList.remove("setup-active");
    afterFinish(destination);
    document
      .querySelector(`#p-${destination} h2`)
      ?.setAttribute("tabindex", "-1");
    document.querySelector(`#p-${destination} h2`)?.focus();
  }
  async function complete() {
    if (transitioning) return;
    transitioning = true;
    setWorking(true);
    try {
      if (!(await persist(3, true))) return;
      await fade(true);
      close();
    } finally {
      transitioning = false;
      setWorking(false);
    }
  }
  dialog.addEventListener("cancel", (event) => event.preventDefault());
  return {
    get active() {
      return dialog.open;
    },
    get step() {
      return step;
    },
    openIfNeeded() {
      const current = snapshot();
      if (current.patient || current.setup?.completed) return;
      step = current.setup?.step ?? 0;
      paint();
      dialog.showModal();
      document.body.classList.add("setup-active");
      void fade(false).then(focusStep);
    },
    finishAfterPlan() {
      if (dialog.open) close("schedule");
    },
    synchronize() {
      if (dialog.open && (snapshot().patient || snapshot().setup?.completed))
        close(snapshot().patient ? "schedule" : "home");
    },
  };
}
