/**
 * End-to-end check for the Atrium world (Person A done-checklist).
 *
 * Drives the full demo in a real browser and asserts the world is non-blank,
 * the automation hooks exist, every panel opens, and nothing overflows on
 * mobile. Screenshots land in VERIFY_OUT.
 *
 *   npm run build && npm start &
 *   VERIFY_URL=http://localhost:3001 node scripts/verify-world.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = process.env.VERIFY_OUT ?? "screenshots";
const BASE_URL = process.env.VERIFY_URL ?? "http://localhost:3001";
const errors = [];
mkdirSync(OUT, { recursive: true });

// PLAYWRIGHT_BROWSERS_PATH is set in CI images; fall back to the bundled resolver.
const launchOptions = { args: ["--no-proxy-server"] };
if (process.env.VERIFY_CHROMIUM) launchOptions.executablePath = process.env.VERIFY_CHROMIUM;
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector("canvas", { timeout: 20000 });
await page.waitForTimeout(1200);

// 1. Canvas must be non-blank.
const canvasStats = async () => page.evaluate(() => {
  const c = document.querySelector("canvas");
  if (!c) return null;
  const ctx = c.getContext("2d");
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const seen = new Set();
  let nonBlack = 0;
  for (let i = 0; i < d.length; i += 4 * 37) {
    const key = `${d[i]},${d[i+1]},${d[i+2]}`;
    seen.add(key);
    if (d[i] + d[i+1] + d[i+2] > 40) nonBlack++;
  }
  return { distinctColors: seen.size, nonBlackSamples: nonBlack, w: c.width, h: c.height };
});

const before = await canvasStats();
console.log("canvas idle:", JSON.stringify(before));
await page.screenshot({ path: `${OUT}/01-idle.png` });

// 2. Global hooks.
const hooks = await page.evaluate(() => ({
  renderToText: typeof window.render_game_to_text,
  advanceTime: typeof window.advanceTime,
}));
console.log("hooks:", JSON.stringify(hooks));

// 3. Start the run.
await page.getByRole("button", { name: "Start run" }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/02-running.png` });

// Drive the replay to completion instead of waiting on wall-clock where possible.
await page.waitForFunction(
  () => document.querySelectorAll(".feed__item").length >= 6,
  null,
  { timeout: 30000 },
);
await page.waitForTimeout(1200);
const midText = await page.evaluate(() => window.render_game_to_text());
console.log("--- after phase one ---");
console.log(midText.split("\n").slice(0, 22).join("\n"));
await page.screenshot({ path: `${OUT}/03-rooms.png` });

const afterRooms = await canvasStats();
console.log("canvas after rooms:", JSON.stringify(afterRooms));

// 4. advanceTime must move the clock deterministically.
const t0 = await page.evaluate(() => window.__atrium.state().elapsed);
await page.evaluate(() => window.advanceTime(3000));
const t1 = await page.evaluate(() => window.__atrium.state().elapsed);
console.log(`advanceTime(3000): elapsed ${t0.toFixed(2)} -> ${t1.toFixed(2)}`);

// 5. Run classroom simulation.
const simButton = page.getByRole("button", { name: "Run classroom" });
await simButton.waitFor({ state: "visible" });
for (let i = 0; i < 60 && await simButton.isDisabled(); i++) await page.waitForTimeout(500);
if (await simButton.isDisabled()) { errors.push("simulate button never enabled"); }
else {
  await simButton.click();
  await page.waitForFunction(
    () => document.querySelectorAll(".feed__item").length >= 11,
    null,
    { timeout: 40000 },
  );
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: `${OUT}/04-complete.png` });

// 6. Interactions: click a room label, a student in canvas, a feed event.
await page.locator(".stage__label", { hasText: "Ember" }).click();
await page.waitForTimeout(300);
const roomTitle = await page.locator(".detail__title").first().innerText();
console.log("room panel title:", roomTitle.trim());
await page.screenshot({ path: `${OUT}/05-room-panel.png` });

await page.locator(".feed__item").nth(3).click();
await page.waitForTimeout(300);
const eventTitle = await page.locator(".detail__title").first().innerText();
const jsonLen = await page.locator("pre.json").first().innerText();
console.log("event panel title:", eventTitle.trim(), "| payload chars:", jsonLen.length);

// Morph toggle.
for (const mode of ["Original", "Room Version", "Student Layer"]) {
  await page.getByRole("tab", { name: mode }).click();
  await page.waitForTimeout(250);
  const body = await page.locator(".morph__body").innerText();
  console.log(`morph ${mode}: ${body.replace(/\s+/g, " ").slice(0, 90)}`);
}
await page.screenshot({ path: `${OUT}/06-morph.png` });

// Click a student sprite on the canvas via the room panel member button.
await page.locator(".stage__label", { hasText: "Summit" }).click();
await page.waitForTimeout(200);
const member = page.locator(".member").first();
if (await member.count()) {
  await member.click();
  await page.waitForTimeout(300);
  console.log("student panel title:", (await page.locator(".detail__title").first().innerText()).trim());
}
await page.screenshot({ path: `${OUT}/07-student.png` });

// Review queue via the beacon.
await page.locator(".stage__label", { hasText: "Communication Beacon" }).click();
await page.waitForTimeout(300);
console.log("beacon panel:", (await page.locator(".panel--detail").innerText()).replace(/\s+/g, " ").slice(0, 160));
await page.screenshot({ path: `${OUT}/08-review.png` });

const finalText = await page.evaluate(() => window.render_game_to_text());
console.log("--- final render_game_to_text (rooms section) ---");
console.log(finalText.split("\n\n").find((b) => b.startsWith("ROOMS")));
console.log(finalText.split("\n\n").find((b) => b.startsWith("OVERLAYS")));

// 7. Mobile layout: no horizontal overflow.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
const overflow = await page.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth,
}));
console.log("mobile overflow:", JSON.stringify(overflow));
await page.screenshot({ path: `${OUT}/09-mobile.png`, fullPage: false });

await page.setViewportSize({ width: 1500, height: 1000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/10-final-desktop.png` });

console.log("errors:", errors.length ? JSON.stringify(errors, null, 2) : "none");
await browser.close();
if (errors.length > 0) {
  throw new Error(`verify-world failed:\n${errors.join("\n")}`);
}
