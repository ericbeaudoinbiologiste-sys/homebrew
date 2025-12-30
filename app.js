// --- Helpers ---
const kgToLb = kg => kg * 2.20462;
const lToGal = l => l / 3.78541;
const round = (x, n=3) => Number.isFinite(x) ? Number(x.toFixed(n)) : NaN;

function readNumber(id) {
  const v = document.getElementById(id).value;
  if (v === "" || v === null || v === undefined) return NaN;
  return Number(v);
}

// --- Core calculations ---
function computeOG(volumeFinalL, efficiency01, fermentables) {
  const gal = lToGal(volumeFinalL);
  if (!(gal > 0) || !(efficiency01 > 0)) return NaN;

  // Σ(PPG * lb) * eff / gal = points
  const points = fermentables.reduce((acc, f) => {
    const lb = kgToLb(f.kg);
    return acc + (f.ppg * lb);
  }, 0) * efficiency01 / gal;

  return 1 + (points / 1000);
}

function estimateBoilGravity(og, volFinalL, volPreboilL) {
  if (!Number.isFinite(og)) return NaN;
  if (!(volPreboilL > 0) || !(volFinalL > 0)) return og; // fallback simple
  return 1 + (og - 1) * (volFinalL / volPreboilL);
}

function tinsethUtilization(gBoil, timeMin) {
  if (!(timeMin > 0) || !Number.isFinite(gBoil)) return 0;
  const bigness = 1.65 * Math.pow(0.000125, (gBoil - 1));
  const boilTime = (1 - Math.exp(-0.04 * timeMin)) / 4.15;
  return bigness * boilTime;
}

// Métrique pratique : IBU_add ≈ (AA * g * 1000 * U) / (V_l * 10)
function computeIBU(volumeL, gBoil, hopAdds) {
  if (!(volumeL > 0) || !Number.isFinite(gBoil)) return NaN;
  const ibu = hopAdds.reduce((acc, h) => {
    const U = tinsethUtilization(gBoil, h.timeMin);
    const add = (h.aa * h.g * 1000 * U) / (volumeL * 10);
    return acc + add;
  }, 0);
  return ibu;
}

function estimateFG(og, attenuation01) {
  if (!Number.isFinite(og) || !(attenuation01 > 0)) return NaN;
  return 1 + (og - 1) * (1 - attenuation01);
}

function computeABV(og, fg) {
  if (!Number.isFinite(og) || !Number.isFinite(fg)) return NaN;
  return (og - fg) * 131.25;
}

// --- UI state ---
function fermentableRow(data={name:"", kg:0, ppg:37}) {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    <input class="name" placeholder="ex: Pale" value="${data.name}">
    <input class="kg" type="number" step="0.01" placeholder="kg" value="${data.kg}">
    <input class="ppg" type="number" step="1" placeholder="PPG" value="${data.ppg}">
    <button class="del">✕</button>
  `;
  row.querySelector(".del").onclick = () => { row.remove(); recalc(); };
  row.querySelectorAll("input").forEach(i => i.oninput = recalc);
  return row;
}

function hopRow(data={name:"", g:0, aa:0.12, timeMin:60}) {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    <input class="name" placeholder="ex: Cascade" value="${data.name}">
    <input class="g" type="number" step="0.1" placeholder="g" value="${data.g}">
    <input class="aa" type="number" step="0.1" placeholder="AA%" value="${data.aa*100}">
    <input class="time" type="number" step="1" placeholder="min" value="${data.timeMin}">
    <button class="del">✕</button>
  `;
  row.querySelector(".del").onclick = () => { row.remove(); recalc(); };
  row.querySelectorAll("input").forEach(i => i.oninput = recalc);
  return row;
}

function readFermentables() {
  return [...document.querySelectorAll("#fermentables .row")].map(r => ({
    name: r.querySelector(".name").value.trim(),
    kg: Number(r.querySelector(".kg").value) || 0,
    ppg: Number(r.querySelector(".ppg").value) || 0
  })).filter(f => f.kg > 0 && f.ppg > 0);
}

function readHops() {
  return [...document.querySelectorAll("#hops .row")].map(r => ({
    name: r.querySelector(".name").value.trim(),
    g: Number(r.querySelector(".g").value) || 0,
    aa: (Number(r.querySelector(".aa").value) || 0) / 100,
    timeMin: Number(r.querySelector(".time").value) || 0
  })).filter(h => h.g > 0 && h.aa > 0 && h.timeMin >= 0);
}

function getRecipeFromUI() {
  return {
    volFinal: readNumber("volFinal"),
    volPreboil: readNumber("volPreboil"),
    eff: readNumber("eff"),
    att: readNumber("att"),
    fermentables: readFermentables(),
    hops: readHops()
  };
}

function setUIFromRecipe(rcp) {
  document.getElementById("volFinal").value = rcp.volFinal ?? 20;
  document.getElementById("volPreboil").value = Number.isFinite(rcp.volPreboil) ? rcp.volPreboil : "";
  document.getElementById("eff").value = rcp.eff ?? 72;
  document.getElementById("att").value = rcp.att ?? 75;

  const fBox = document.getElementById("fermentables");
  const hBox = document.getElementById("hops");
  fBox.innerHTML = "";
  hBox.innerHTML = "";

  (rcp.fermentables ?? []).forEach(f => fBox.appendChild(fermentableRow(f)));
  (rcp.hops ?? []).forEach(h => hBox.appendChild(hopRow(h)));

  if (fBox.children.length === 0) fBox.appendChild(fermentableRow({name:"Pale", kg:4.5, ppg:37}));
  if (hBox.children.length === 0) hBox.appendChild(hopRow({name:"Cascade", g:25, aa:0.06, timeMin:60}));

  recalc();
}

function recalc() {
  const r = getRecipeFromUI();
  const eff01 = (r.eff || 0) / 100;
  const att01 = (r.att || 0) / 100;

  const og = computeOG(r.volFinal, eff01, r.fermentables);
  const gBoil = estimateBoilGravity(og, r.volFinal, r.volPreboil);
  const ibu = computeIBU(r.volFinal, gBoil, r.hops);
  const fg = estimateFG(og, att01);
  const abv = computeABV(og, fg);

  document.getElementById("outOG").textContent  = Number.isFinite(og)  ? round(og, 3) : "—";
  document.getElementById("outIBU").textContent = Number.isFinite(ibu) ? round(ibu, 1) : "—";
  document.getElementById("outFG").textContent  = Number.isFinite(fg)  ? round(fg, 3) : "—";
  document.getElementById("outABV").textContent = Number.isFinite(abv) ? `${round(abv, 1)} %` : "—";
}

// --- Save/load (simple) ---
const KEY = "brew_quick_last_recipe";

function saveRecipe() {
  const r = getRecipeFromUI();
  localStorage.setItem(KEY, JSON.stringify(r));
}
function loadRecipe() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return;
  try { setUIFromRecipe(JSON.parse(raw)); } catch {}
}

// --- Init ---
document.getElementById("addFermentable").onclick = () => {
  document.getElementById("fermentables").appendChild(fermentableRow());
  recalc();
};
document.getElementById("addHop").onclick = () => {
  document.getElementById("hops").appendChild(hopRow());
  recalc();
};
["volFinal","volPreboil","eff","att"].forEach(id => {
  document.getElementById(id).oninput = recalc;
});
document.getElementById("save").onclick = saveRecipe;
document.getElementById("load").onclick = loadRecipe;

// first load
loadRecipe();
if (!localStorage.getItem(KEY)) {
  setUIFromRecipe({
    volFinal: 20,
    volPreboil: 27,
    eff: 72,
    att: 75,
    fermentables: [{name:"Pale", kg:4.5, ppg:37}],
    hops: [{name:"Cascade", g:25, aa:0.06, timeMin:60}]
  });
} else {
  recalc();
}
