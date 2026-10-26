// Keep every care event at its clock position; stack nearby boxes within a group.
export function layoutMedicineTimeline(chart) {
  if (!chart?.isConnected || !chart.clientWidth) return;
  const width = chart.clientWidth;
  const boxes = [...chart.querySelectorAll(".medicine-box")];
  const laneStep = Math.max(110, ...boxes.map((box) => box.offsetHeight)) + 20;
  const groups = [
    ...new Set(boxes.map((box) => Number(box.dataset.lane))),
  ].sort((a, b) => a - b);
  let rows = 0;
  for (const group of groups) {
    const ends = [];
    const items = boxes
      .filter((box) => Number(box.dataset.lane) === group)
      .sort((a, b) => Number(a.dataset.minute) - Number(b.dataset.minute));
    for (const box of items) {
      const anchor = (Number(box.dataset.minute) / 1440) * width;
      const left = Math.max(
        8,
        Math.min(width - box.offsetWidth - 8, anchor - box.offsetWidth / 2),
      );
      let sublane = ends.findIndex((end) => end + 12 <= left);
      if (sublane < 0) sublane = ends.length;
      ends[sublane] = left + box.offsetWidth;
      box.style.left = `${left}px`;
      box.style.top = `${88 + (rows + sublane) * laneStep}px`;
      box.style.setProperty("--anchor-offset", `${anchor - left}px`);
    }
    rows += ends.length;
  }
  chart.style.height = `${112 + Math.max(1, rows) * laneStep}px`;
}
const medicineTimelineObserver = new ResizeObserver((entries) => {
  for (const { target } of entries) {
    if (!target.isConnected) medicineTimelineObserver.unobserve(target);
    else layoutMedicineTimeline(target);
  }
});
export function observeMedicineTimeline(chart) {
  if (!chart) return;
  medicineTimelineObserver.observe(chart);
  layoutMedicineTimeline(chart);
  document.fonts.ready.then(() => layoutMedicineTimeline(chart));
}
