export async function clickTab(page, id) {
  if (["import", "tasks", "about"].includes(id)) {
    const more = page.locator("#moreNav");
    if (!(await more.evaluate((element) => element.open)))
      await more.locator("summary").click();
  }
  await page.locator(`nav [data-t="${id}"]`).click();
}
export async function buildAndSave(page) {
  await page.locator("#btnGenerate").click();
  if (await page.locator("#plan-preview").isVisible())
    await page.locator("#btnSavePlan").click();
}
