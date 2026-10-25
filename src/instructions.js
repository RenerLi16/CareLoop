// Reads structured English lines. Unsupported wording is retained for review.
export function parseInstructions(
  text,
  today = new Date().toLocaleDateString("en-CA"),
) {
  const meds = [],
    followups = [],
    flags = [],
    unread = [];
  let section = "";
  const rows = String(text).replace(/\r/g, "").split("\n");
  for (const raw of rows) {
    const line = raw.trim().replace(/^[-•]\s*/, "");
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
      const visit = line.match(/^(.+?)\s+in\s+(\d+)\s+days?\.?$/i);
      if (visit)
        followups.push({
          id: "f" + followups.length,
          who: visit[1],
          days: Number(visit[2]),
        });
      else unread.push("Follow-up: " + line);
      continue;
    }
    // The existing monitoring controls do not express arbitrary monitoring rules.
    if (section === "monitoring") {
      unread.push("Monitoring: " + line);
      continue;
    }
    if (section !== "meds") continue;
    const medication = line.match(
      /^(.+?)\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|units?))\b\s*(.*)$/i,
    );
    if (!medication) {
      unread.push(line);
      continue;
    }
    let rest = medication[3],
      freq = "",
      meal = "any",
      mealTarget = "any",
      gapH = null,
      gapTarget = "";
    const issues = [];
    const frequencies = [
      ...rest.matchAll(
        /\b(once daily|twice daily|three times daily|every (?:6|8|12) hours|at bedtime|in the morning|every morning)\b/gi,
      ),
    ].map((m) => m[0].toLowerCase().replace("every morning", "in the morning"));
    const unique = [...new Set(frequencies)];
    const countOf = (value) =>
      value === "twice daily"
        ? 2
        : value === "three times daily"
          ? 3
          : value.startsWith("every ")
            ? 24 / Number(value.match(/\d+/)[0])
            : 1;
    const exact = unique.filter((f) => /^every /.test(f));
    const fixed = unique.filter(
      (f) => f === "at bedtime" || f === "in the morning",
    );
    if (!unique.length)
      issues.push("Choose the frequency from the original instruction.");
    else if (
      new Set(unique.map(countOf)).size > 1 ||
      exact.length > 1 ||
      fixed.length > 1 ||
      (fixed.length && exact.length)
    )
      issues.push(
        "Timing phrases conflict or cannot be represented together. Review and select the intended frequency.",
      );
    else freq = fixed[0] || exact[0] || unique[0];
    rest = rest.replace(
      /\b(once daily|twice daily|three times daily|every (?:6|8|12) hours|at bedtime|in the morning|every morning)\b/gi,
      "",
    );
    const foods = [
      ...rest.matchAll(
        /\b(with|before|after)\s+(food|meals|breakfast|lunch|dinner)\b/gi,
      ),
    ];
    if (foods.length) {
      const rules = [
        ...new Set(
          foods.map(
            (m) =>
              m[1].toLowerCase() +
              ":" +
              (/food|meals/i.test(m[2]) ? "any" : m[2].toLowerCase()),
          ),
        ),
      ];
      if (rules.length > 1)
        issues.push("Multiple food rules need manual review.");
      else [meal, mealTarget] = rules[0].split(":");
      rest = rest.replace(
        /\b(with|before|after)\s+(food|meals|breakfast|lunch|dinner)\b/gi,
        "",
      );
    }
    const gap = rest.match(
      /\bat least\s+(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s+apart(?:\s+from\s+([^.;]+))?/i,
    );
    if (gap) {
      gapH = Number(gap[1]);
      gapTarget = (gap[2] || "").trim();
      rest = rest.replace(gap[0], "");
    }
    const leftover = rest
      .replace(/\bby mouth\b/gi, "")
      .replace(/[\s,.;:]+/g, " ")
      .trim();
    if (leftover) issues.push("Unsupported wording: " + leftover);
    meds.push({
      id: "m" + meds.length,
      drug: medication[1].trim(),
      dose: medication[2].trim(),
      freq,
      meal,
      mealTarget,
      gapH,
      gapTarget,
      source: line,
      issue: issues.join(" "),
    });
  }
  const name = String(text).match(
    /Patient:\s*(.+?)(?=\s+Age:|\s+Discharged:|\r?\n|$)/i,
  );
  const age = String(text).match(/\bAge:\s*(\d+)/i);
  const date = String(text).match(/\bDischarged:\s*(\d{4}-\d{2}-\d{2})/i);
  return {
    patient: {
      name: name?.[1].trim() || "",
      age: age?.[1] || "",
      dischargeDate: date?.[1] || today,
      lang: "en",
    },
    meds,
    followups,
    flags,
    unread,
  };
}
