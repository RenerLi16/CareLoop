export const FREQUENCIES = [
  "once daily",
  "twice daily",
  "three times daily",
  "every 6 hours",
  "every 8 hours",
  "every 12 hours",
  "in the morning",
  "at bedtime",
];
export const DEFAULT_PREFS = {
  breakfast: "08:00",
  lunch: "12:00",
  dinner: "18:00",
  morning: "08:00",
  bedtime: "22:00",
};
export const minutes = (t) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(t || "")
    ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
    : NaN;
export const clock = (n) =>
  `${String(Math.floor((((n % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String(((n % 60) + 60) % 60).padStart(2, "0")}`;
export const validDate = (s) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s || "") &&
  !isNaN(Date.parse(s)) &&
  new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
export function addDays(s, n) {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const distance = (a, b) => Math.min(Math.abs(a - b), 1440 - Math.abs(a - b));
const uid = () => globalThis.crypto.randomUUID();

// Parsing is deliberately conservative: unsupported lines survive for human review.
export function parseDischarge(text) {
  const meds = [],
    followups = [],
    flags = [],
    unresolved = [];
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^MEDICATIONS\s*:?$/i.test(line)) {
      section = "meds";
      continue;
    }
    if (/^FOLLOW[ -]?UP\s*:?$/i.test(line)) {
      section = "followups";
      continue;
    }
    if (/^MONITORING\s*:?$/i.test(line)) {
      section = "monitoring";
      continue;
    }
    if (/^(CALL THE DOCTOR IF|GO TO EMERGENCY IF)\s*:?$/i.test(line)) {
      section = "flags";
      continue;
    }
    if (section === "flags") {
      flags.push(line);
      continue;
    }
    if (section === "followups") {
      const m = line.match(/^(.+?)\s+in\s+(\d+)\s+days?\.?$/i);
      if (m)
        followups.push({
          id: uid(),
          provider: m[1],
          days: Number(m[2]),
          confirmed: false,
          date: "",
          time: "",
          source: line,
        });
      else
        unresolved.push({
          text: line,
          reason: "Follow-up wording needs manual entry.",
        });
    }
    if (section === "meds") {
      const clean = line.replace(/^[-•]\s*/, "");
      const m = clean.match(
        /^(.+?)\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|units?))\b\s*(.*)$/i,
      );
      if (!m) {
        unresolved.push({
          text: line,
          reason: "Medication name or dose could not be read.",
        });
        continue;
      }
      let rest = m[3].replace(/[.;]$/, "").trim(),
        freq = "";
      const frequency = FREQUENCIES.find((f) =>
        new RegExp(`\\b${f}\\b`, "i").test(rest),
      );
      if (frequency) {
        freq = frequency;
        rest = rest.replace(new RegExp(`\\b${frequency}\\b`, "i"), "");
      }
      const morningAlias = rest.match(/\bevery morning\b/i);
      if (!freq && morningAlias) {
        freq = "in the morning";
        rest = rest.replace(morningAlias[0], "");
      }
      let meal = "any",
        mealTarget = "any";
      const mealMatch = rest.match(
        /\b(with food|with meals|before food|before meals|before breakfast|after food|after meals|with breakfast|with lunch|with dinner|before lunch|before dinner|after breakfast|after lunch|after dinner)\b/i,
      );
      if (mealMatch) {
        meal = /^with/i.test(mealMatch[0])
          ? "with"
          : /^before/i.test(mealMatch[0])
            ? "before"
            : "after";
        mealTarget =
          mealMatch[0].match(/breakfast|lunch|dinner/i)?.[0].toLowerCase() ||
          "any";
        rest = rest.replace(mealMatch[0], "");
      }
      let gapTarget = "",
        gapHours = "";
      const gap = rest.match(
        /\bat least\s+(\d+(?:\.\d+)?)\s+hours?\s+apart from\s+(.+?)(?=[.;]|$)/i,
      );
      if (gap) {
        gapHours = Number(gap[1]);
        gapTarget = gap[2].trim();
        rest = rest.replace(gap[0], "");
      }
      const unknown = rest.replace(/[\s,.;:]+/g, " ").trim();
      const issue = !freq
        ? "Frequency was not recognized."
        : unknown
          ? `Unsupported instruction: ${unknown}`
          : "";
      meds.push({
        id: uid(),
        drug: m[1].trim(),
        dose: m[2],
        freq,
        meal,
        mealTarget,
        gapTarget,
        gapHours,
        source: line,
        issue,
        reviewed: false,
        startDate: "",
        endDate: "",
      });
    }
    if (section === "monitoring")
      unresolved.push({
        text: line,
        reason: "Review and select the monitoring tasks below.",
      });
  }
  if (!meds.length)
    unresolved.push({
      text: "",
      reason:
        "No medications found. Enter them manually; no sample drugs have been added.",
    });
  return { meds, followups, flags, unresolved };
}

export function validatePlan(plan) {
  const errors = [];
  if ((plan.unresolved || []).some((u) => !u.resolved))
    errors.push("Review and acknowledge every unsupported instruction.");
  if (!plan.patient?.trim()) errors.push("Enter the patient name.");
  if (!validDate(plan.startDate)) errors.push("Enter a valid plan start date.");
  if (!plan.timeZone) errors.push("Choose a time zone.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: plan.timeZone }).format();
  } catch {
    errors.push("Choose a valid time zone.");
  }
  if (!plan.meds?.length || plan.meds.length > 15)
    errors.push("Enter between 1 and 15 medications.");
  const names = new Set(),
    ids = new Set();
  for (const m of plan.meds || []) {
    if (!m.id || ids.has(m.id)) errors.push("Medication IDs must be unique.");
    ids.add(m.id);
    if (!m.drug?.trim() || !m.dose?.trim())
      errors.push("Every medication needs a name and dose.");
    if (names.has(m.drug?.trim().toLowerCase()))
      errors.push(`Combine or distinguish duplicate entries for ${m.drug}.`);
    names.add(m.drug?.trim().toLowerCase());
    if (!FREQUENCIES.includes(m.freq))
      errors.push(`Select a supported frequency for ${m.drug}.`);
    if (!["any", "with", "before", "after"].includes(m.meal))
      errors.push(`Select a meal rule for ${m.drug}.`);
    if (
      m.mealTarget &&
      !["any", "breakfast", "lunch", "dinner"].includes(m.mealTarget)
    )
      errors.push(`Select a valid meal for ${m.drug}.`);
    if (!m.reviewed)
      errors.push(
        `Review and confirm ${m.drug} against the original instructions.`,
      );
    if (
      (m.startDate && !validDate(m.startDate)) ||
      (m.endDate && !validDate(m.endDate))
    )
      errors.push(`Check dates for ${m.drug}.`);
    if (m.startDate && m.endDate && m.endDate < m.startDate)
      errors.push(`End date precedes start date for ${m.drug}.`);
    if (m.gapTarget) {
      const target = plan.meds.find(
        (x) => x.drug?.toLowerCase() === m.gapTarget.toLowerCase(),
      );
      if (!target || target.id === m.id)
        errors.push(
          `Choose a different, existing medication for ${m.drug}'s spacing rule.`,
        );
      if (
        !Number.isFinite(Number(m.gapHours)) ||
        Number(m.gapHours) <= 0 ||
        Number(m.gapHours) > 24
      )
        errors.push(
          `Enter a spacing requirement between 0 and 24 hours for ${m.drug}.`,
        );
    } else if (
      m.gapHours !== "" &&
      m.gapHours != null &&
      Number(m.gapHours) !== 0
    )
      errors.push(`Choose which medication ${m.drug} must be separated from.`);
  }
  for (const k of Object.keys(DEFAULT_PREFS))
    if (!Number.isFinite(minutes(plan.prefs?.[k])))
      errors.push(`Enter a valid ${k} time.`);
  for (const f of plan.followups || []) {
    if (
      !f.provider?.trim() ||
      !Number.isInteger(Number(f.days)) ||
      Number(f.days) < 0 ||
      Number(f.days) > 365
    )
      errors.push(
        "Follow-ups need a provider and a deadline from 0 to 365 days.",
      );
    if (
      f.confirmed &&
      (!validDate(f.date) || !Number.isFinite(minutes(f.time)))
    )
      errors.push("Confirmed appointments need an actual date and time.");
  }
  return errors;
}

function options(m, prefs) {
  const meals = ["breakfast", "lunch", "dinner"]
    .filter(
      (k) => !m.mealTarget || m.mealTarget === "any" || m.mealTarget === k,
    )
    .map((k) => minutes(prefs[k]));
  const mealOK = (t) =>
    m.meal === "any" ||
    meals.some((x) =>
      m.meal === "with"
        ? distance(t, x) <= 30
        : m.meal === "before"
          ? (x - t + 1440) % 1440 >= 15 && (x - t + 1440) % 1440 <= 60
          : (t - x + 1440) % 1440 >= 15 && (t - x + 1440) % 1440 <= 60,
    );
  const exact = m.freq.match(/^every (\d+) hours$/),
    count = exact
      ? 24 / Number(exact[1])
      : m.freq === "twice daily"
        ? 2
        : m.freq === "three times daily"
          ? 3
          : 1;
  if (m.freq === "in the morning" || m.freq === "at bedtime") {
    const t = minutes(prefs[m.freq === "at bedtime" ? "bedtime" : "morning"]);
    return mealOK(t) ? [[t]] : [];
  }
  let candidates = [];
  if (exact) {
    // Shift the whole group, so every prescribed interval survives rescheduling.
    const step = Number(exact[1]) * 60;
    for (let t = 0; t < step; t += 15) {
      const group = Array.from({ length: count }, (_, i) => t + i * step);
      if (group.every(mealOK)) candidates.push(group);
    }
  } else {
    const grid = Array.from({ length: 57 }, (_, i) => 420 + i * 15).filter(
      mealOK,
    );
    function choose(start, group) {
      if (group.length === count) {
        candidates.push(group);
        return;
      }
      for (let i = start; i < grid.length; i++) {
        if (group.length && grid[i] - group.at(-1) < 240) continue;
        choose(i + 1, [...group, grid[i]]);
      }
    }
    choose(0, []);
  }
  const ideals =
    count === 1
      ? [minutes(prefs.morning)]
      : count === 2
        ? [minutes(prefs.breakfast), minutes(prefs.dinner)]
        : meals;
  const score = (a) =>
    a.reduce((s, t, i) => s + distance(t, ideals[i] ?? ideals[0]), 0);
  return candidates.sort((a, b) => score(a) - score(b));
}
export function spacingRules(meds) {
  return meds
    .filter((m) => m.gapTarget)
    .map((m) => ({
      a: m.id,
      b: meds.find((x) => x.drug.toLowerCase() === m.gapTarget.toLowerCase())
        ?.id,
      hours: Number(m.gapHours),
      source:
        m.source ||
        `${m.drug}: at least ${m.gapHours} hours from ${m.gapTarget}`,
    }));
}
export function compilePlan(plan) {
  const errors = validatePlan(plan);
  if (errors.length) return { ok: false, errors, times: {} };
  const rules = spacingRules(plan.meds),
    groups = plan.meds
      .map((m) => ({ m, choices: options(m, plan.prefs) }))
      .sort((a, b) => a.choices.length - b.choices.length);
  const missing = groups.filter((g) => !g.choices.length);
  if (missing.length)
    return {
      ok: false,
      times: {},
      errors: missing.map(
        (g) =>
          `${g.m.drug}: its frequency, fixed time and meal rule cannot fit the chosen meal times. Review the instructions or preferences.`,
      ),
    };
  let visited = 0,
    limited = false;
  const placed = {};
  function search(i) {
    if (i === groups.length) return true;
    if (++visited > 150000) {
      limited = true;
      return false;
    }
    const { m, choices } = groups[i];
    for (const group of choices) {
      let fits = true;
      for (const r of rules) {
        const other = r.a === m.id ? r.b : r.b === m.id ? r.a : null;
        if (
          other &&
          placed[other] &&
          group.some((t) =>
            placed[other].some((x) => distance(t, x) < r.hours * 60),
          )
        ) {
          fits = false;
          break;
        }
      }
      if (fits) {
        placed[m.id] = group;
        if (search(i + 1)) return true;
        delete placed[m.id];
      }
      if (limited) return false;
    }
    return false;
  }
  if (!search(0))
    return {
      ok: false,
      times: {},
      errors: [
        limited
          ? "The search limit was reached. This plan needs manual review; no schedule was published."
          : "No schedule satisfies the supported rules together. Review the following rules before publishing.",
        ...rules.map(
          (r) =>
            `${plan.meds.find((m) => m.id === r.a).drug} / ${plan.meds.find((m) => m.id === r.b).drug}: at least ${r.hours} hours apart.`,
        ),
      ],
    };
  return {
    ok: true,
    errors: [],
    times: Object.fromEntries(
      Object.entries(placed).map(([k, v]) => [k, v.map(clock)]),
    ),
    rules,
  };
}

// Convert a patient-local wall clock into an instant, including daylight-saving changes.
export function zonedISO(date, time, timeZone) {
  const [y, m, d] = date.split("-").map(Number),
    [h, min] = time.split(":").map(Number);
  const desired = Date.UTC(y, m - 1, d, h, min);
  let guess = desired;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 4; i++) {
    const p = Object.fromEntries(
      formatter.formatToParts(new Date(guess)).map((x) => [x.type, x.value]),
    );
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    if (wall === desired) return new Date(guess).toISOString();
    guess += desired - wall;
  }
  throw new Error(
    `${date} ${time} does not exist in ${timeZone} because the clock changes. Review this task's time.`,
  );
}
export function generateTasks(plan, compiled) {
  if (!compiled.ok)
    throw new Error("Resolve the schedule before generating tasks.");
  const tasks = [];
  const push = (t) =>
    tasks.push({
      ...t,
      dueAt: zonedISO(t.date, t.time, plan.timeZone),
      status: "todo",
      who: "",
      actualAt: null,
      note: "",
      archived: false,
    });
  for (let day = 0; day < 30; day++) {
    const date = addDays(plan.startDate, day);
    for (const m of plan.meds) {
      if (
        date < (m.startDate || plan.startDate) ||
        (m.endDate && date > m.endDate)
      )
        continue;
      (compiled.times[m.id] || []).forEach((time, slot) =>
        push({
          id: `${date}:${m.id}:${slot}`,
          date,
          time,
          kind: "med",
          medId: m.id,
          label: `${m.drug} · ${m.dose}`,
          source: m.source,
        }),
      );
    }
    for (const kind of ["weight", "symptoms"])
      if (plan.monitoring?.[kind])
        push({
          id: `${date}:${kind}`,
          date,
          time: kind === "weight" ? "08:30" : "19:00",
          kind,
          label: kind === "weight" ? "Record weight" : "Record symptoms",
        });
  }
  for (const f of plan.followups || [])
    push({
      id: `followup:${f.id}`,
      date: f.confirmed ? f.date : addDays(plan.startDate, Number(f.days)),
      time: f.confirmed ? f.time : "09:00",
      kind: "visit",
      label: f.confirmed
        ? `Appointment: ${f.provider}`
        : `Book follow-up: ${f.provider} (due today)`,
      source: f.source,
    });
  tasks.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  // Wall-clock repetition alone is insufficient over a daylight-saving transition.
  // Reject a plan that cannot retain its stated elapsed-time requirements.
  for (const m of plan.meds) {
    const exact = m.freq.match(/^every (\d+) hours$/);
    if (!exact) continue;
    const doses = tasks.filter((t) => t.medId === m.id);
    for (let i = 1; i < doses.length; i++)
      if (
        Date.parse(doses[i].dueAt) - Date.parse(doses[i - 1].dueAt) !==
        Number(exact[1]) * 3600000
      )
        throw new Error(
          `${m.drug}: a clock change breaks the exact ${exact[1]}-hour interval. This plan needs manual review; it has not been published.`,
        );
  }
  for (const rule of spacingRules(plan.meds)) {
    const a = tasks.filter((t) => t.medId === rule.a),
      b = tasks.filter((t) => t.medId === rule.b);
    if (
      a.some((x) =>
        b.some(
          (y) =>
            Math.abs(Date.parse(x.dueAt) - Date.parse(y.dueAt)) <
            rule.hours * 3600000,
        ),
      )
    )
      throw new Error(
        `A date or clock change breaks the spacing rule: ${rule.source}. Review this plan before publishing.`,
      );
  }
  return tasks;
}
export function mergeTasks(oldTasks, newTasks) {
  const fresh = new Map(newTasks.map((t) => [t.id, t]));
  const out = [];
  for (const old of oldTasks) {
    const next = fresh.get(old.id);
    if (old.status !== "todo") {
      out.push(old);
      fresh.delete(old.id);
    } else if (next) {
      out.push({ ...next, who: old.who, note: old.note });
      fresh.delete(old.id);
    } else out.push({ ...old, archived: true });
  }
  return [...out, ...fresh.values()].sort((a, b) =>
    a.dueAt.localeCompare(b.dueAt),
  );
}
export function reconcilePlan(previous, incoming) {
  const next = structuredClone(incoming);
  const old = previous?.meds || [];
  for (const med of next.meds) {
    const match =
      old.find((m) => m.id === med.id) ||
      old.find(
        (m) => m.drug.trim().toLowerCase() === med.drug.trim().toLowerCase(),
      );
    if (match) med.id = match.id;
  }
  for (const followup of next.followups || []) {
    const matches = (previous?.followups || []).filter(
      (f) =>
        f.provider.trim().toLowerCase() ===
        followup.provider.trim().toLowerCase(),
    );
    if (matches.length === 1) followup.id = matches[0].id;
  }
  return next;
}
export function logWarnings(tasks, plan) {
  if (!plan) return [];
  const done = tasks
      .filter((t) => t.kind === "med" && t.status === "done" && t.actualAt)
      .sort((a, b) => a.actualAt.localeCompare(b.actualAt)),
    out = [];
  for (let i = 0; i < done.length; i++)
    for (let j = i + 1; j < done.length; j++) {
      const a = done[i],
        b = done[j],
        gap = (Date.parse(b.actualAt) - Date.parse(a.actualAt)) / 3600000;
      if (a.medId === b.medId) {
        const m = plan.meds.find((m) => m.id === a.medId);
        const exact = m?.freq.match(/^every (\d+) hours$/);
        const need = exact ? Number(exact[1]) : 1;
        if (gap < need)
          out.push({
            a: a.id,
            b: b.id,
            message: exact
              ? `${a.label}: two entries are ${gap.toFixed(1)}h apart; the recorded instruction requires ${need}h.`
              : `${a.label}: two entries within one hour. Check for a duplicate log. This is a review prompt, not a clinical dosing threshold.`,
          });
      } else
        for (const r of spacingRules(plan.meds))
          if (
            ((r.a === a.medId && r.b === b.medId) ||
              (r.a === b.medId && r.b === a.medId)) &&
            gap < r.hours
          )
            out.push({
              a: a.id,
              b: b.id,
              message: `${a.label} / ${b.label}: logged ${gap.toFixed(1)}h apart; the entered rule requires ${r.hours}h.`,
              source: r.source,
            });
    }
  return out;
}
const escapeICS = (s) =>
  String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
export function toICS(tasks) {
  const stamp = (s) => s.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CareLoop//Care plan//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const t of tasks.filter((t) => !t.archived && t.status === "todo"))
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeICS(t.id)}@careloop`,
      `DTSTAMP:${stamp(new Date().toISOString())}`,
      `DTSTART:${stamp(t.dueAt)}`,
      `DTEND:${stamp(new Date(Date.parse(t.dueAt) + 900000).toISOString())}`,
      `SUMMARY:${escapeICS(t.label)}`,
      `DESCRIPTION:${escapeICS(t.source || "Check the current CareLoop plan before acting.")}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT15M",
      "ACTION:DISPLAY",
      "DESCRIPTION:CareLoop task in 15 minutes",
      "END:VALARM",
      "END:VEVENT",
    );
  lines.push("END:VCALENDAR");
  // RFC 5545 lines are folded at 75 UTF-8 octets, without breaking a character.
  return (
    lines
      .map((line) => {
        let result = "",
          size = 0;
        for (const c of line) {
          const n = new TextEncoder().encode(c).length;
          if (size + n > 75) {
            result += "\r\n ";
            size = 1;
          }
          result += c;
          size += n;
        }
        return result;
      })
      .join("\r\n") + "\r\n"
  );
}
