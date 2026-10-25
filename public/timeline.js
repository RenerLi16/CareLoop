// One lane per medicine, with boxes centered on the actual clock position.
export function layoutMedicineTimeline(chart) {
  if (!chart?.isConnected || !chart.clientWidth) return;
  const width = chart.clientWidth;
  const boxes = [...chart.querySelectorAll(".medicine-box")];
  const laneStep = Math.max(110, ...boxes.map((box) => box.offsetHeight)) + 20;
  chart.style.height = `${82 + Number(chart.style.getPropertyValue("--lanes")) * laneStep}px`;
  for (const box of boxes) {
    const anchor = (Number(box.dataset.minute) / 1440) * width;
    const boxWidth = box.offsetWidth;
    box.style.left = `${Math.max(8, Math.min(width - boxWidth - 8, anchor - boxWidth / 2))}px`;
    box.style.top = `${58 + Number(box.dataset.lane) * laneStep}px`;
    box.style.setProperty(
      "--anchor-offset",
      `${anchor - Math.max(8, Math.min(width - boxWidth - 8, anchor - boxWidth / 2))}px`,
    );
  }
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
