// Keep each point at its true time; alternate name labels and add lanes as needed.
export function layoutMedicineTimeline(chart) {
  if (!chart?.isConnected || !chart.clientWidth) return;
  const pins = [...chart.querySelectorAll(".pin")];
  const width = chart.clientWidth;
  const labelWidth = Math.min(170, width - 20);
  for (const pin of pins)
    pin.querySelector(".lb").style.width = labelWidth + "px";
  const step =
    Math.max(48, ...pins.map((pin) => pin.querySelector(".lb").offsetHeight)) +
    14;
  const lanes = [[], []];
  const placements = pins.map((pin, index) => {
    const anchor = (Number(pin.dataset.minute) / 1440) * width;
    const left = Math.max(
      8,
      Math.min(width - labelWidth - 8, anchor - labelWidth / 2),
    );
    const side = index % 2;
    let lane = lanes[side].findIndex((end) => end + 12 <= left);
    if (lane < 0) lane = lanes[side].length;
    lanes[side][lane] = left + labelWidth;
    return { pin, anchor, left, side, lane };
  });
  const axis = 24 + lanes[0].length * step;
  chart.style.height = axis + 40 + lanes[1].length * step + 24 + "px";
  chart.querySelector(".timeline-axis").style.top = axis + 5 + "px";
  for (const { pin, anchor, left, side, lane } of placements) {
    const label = pin.querySelector(".lb");
    const top = side
      ? axis + 26 + lane * step
      : axis - 20 - label.offsetHeight - lane * step;
    pin.style.left = anchor + "px";
    pin.dataset.side = side ? "below" : "above";
    pin.querySelector(".dot").style.top = axis + "px";
    label.style.left = left - anchor + "px";
    label.style.top = top + "px";
    const line = pin.querySelector(".pin-stem");
    line.style.top = (side ? axis + 10 : top + label.offsetHeight) + "px";
    line.style.height =
      Math.max(0, side ? top - axis - 10 : axis - top - label.offsetHeight) +
      "px";
  }
}
const timelineSizes = new WeakMap();
const medicineTimelineObserver = new ResizeObserver((entries) => {
  for (const { target } of entries) {
    if (!target.isConnected) {
      medicineTimelineObserver.unobserve(target);
      continue;
    }
    if (timelineSizes.get(target) !== target.clientWidth) {
      timelineSizes.set(target, target.clientWidth);
      layoutMedicineTimeline(target);
    }
  }
});
export function observeMedicineTimeline(chart) {
  if (!chart) return;
  medicineTimelineObserver.observe(chart);
  layoutMedicineTimeline(chart);
  document.fonts.ready.then(() => layoutMedicineTimeline(chart));
}
