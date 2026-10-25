// Complete the real first-visit flow before testing another part of the app.
export async function finishFirstVisit(page, patientName = "Nguyen Thi Hoa") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#setup-dialog").waitFor({ state: "visible" });
  await page.locator('[data-setup-action="next"]').click();
  await page.locator("#setup-patient-name").fill(patientName);
  await page.locator("#setup-patient-name").press("Enter");
  await page.locator("#setup-team-host").waitFor();
  await page.locator('[data-setup-action="skip"]').click();
  await page.locator("#setup-discharge-host").waitFor();
  await page.locator('[data-setup-action="skip"]').click();
  await page.locator("#setup-dialog").waitFor({ state: "hidden" });
}
