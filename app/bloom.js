// The bloom timeline along the bottom of the yard: a play button and a month slider. Sliding or playing it
// switches on the bloom view, where every plant in flower that month is ringed in its flower color, so the
// gaps (places and months with nothing blooming) stand out. The month buttons at the top stay in step with it.

import { MONTHS, MONTH_NAMES, stateFor } from "./data.js";

export const inBloom = (sp, m) => stateFor(sp, m) === "bloom";

// How many plants flower in each month, Jan..Dec.
export function bloomCounts(plants, species) {
  return MONTHS.map((_, m) => plants.filter((p) => inBloom(species.get(p.speciesId), m)).length);
}

const PLAY = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>`;
const PAUSE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>`;

export function createBloomBar(el, { counts, onScrub, onPlay, onOff }) {
  const height = (n) => `${n ? 12 + (88 * n) / Math.max(1, ...counts) : 0}%`;
  // The bars and letters sit over the slider's stops, which run from half a thumb in from each end.
  const at = (i) => `left:calc(var(--thumb) / 2 + ${i} / 11 * (100% - var(--thumb)))`;
  el.innerHTML = `
    <div class="bloomhead">
      <span class="bloomlabel" aria-live="polite"></span>
      <button type="button" class="bloomoff" aria-label="Stop showing blooms" hidden>✕</button>
    </div>
    <div class="bloomrow">
      <button type="button" class="bloomplay"></button>
      <div class="bloomtrack">
        <div class="bloombars" aria-hidden="true">${counts.map((n, i) =>
          `<i style="${at(i)}; height:${height(n)}"></i>`).join("")}</div>
        <input type="range" min="0" max="11" step="1" aria-label="Month to show blooms for">
        <div class="bloomticks" aria-hidden="true">${MONTHS.map((m, i) => `<span style="${at(i)}">${m[0]}</span>`).join("")}</div>
      </div>
    </div>`;
  const q = (s) => el.querySelector(s);
  const slider = q("input");
  slider.addEventListener("input", () => onScrub(Number(slider.value)));
  q(".bloomplay").onclick = onPlay;
  q(".bloomoff").onclick = onOff;

  return {
    // After a plant is finished, brought back or changes kind.
    setCounts(next) {
      counts = next;
      el.querySelectorAll(".bloombars i").forEach((b, i) => (b.style.height = height(counts[i])));
    },
    update({ month, on, playing }) {
      const n = counts[month];
      slider.value = month;
      slider.setAttribute("aria-valuetext", `${MONTH_NAMES[month]}, ${n} in bloom`);
      el.classList.toggle("on", on);
      el.querySelectorAll(".bloombars i").forEach((b, i) => b.classList.toggle("now", i === month));
      q(".bloomlabel").innerHTML = on
        ? n ? `<b>${n} ${n === 1 ? "plant" : "plants"}</b> in bloom in ${MONTH_NAMES[month]}` : `Nothing in bloom in ${MONTH_NAMES[month]}`
        : `<b>Bloom timeline</b> · play or slide`;
      q(".bloomoff").hidden = !on;
      const play = q(".bloomplay");
      play.innerHTML = playing ? PAUSE : PLAY;
      play.setAttribute("aria-label", playing ? "Pause" : "Play through the year's blooms");
    },
  };
}
