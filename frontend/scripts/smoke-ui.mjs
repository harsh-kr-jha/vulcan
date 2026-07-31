import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";

const baseUrl = process.env.VULCAN_BASE_URL ?? "http://127.0.0.1:3000";
const debugPort = Number(process.env.VULCAN_DEBUG_PORT ?? 9333);
const fixturePath = process.env.VULCAN_FIXTURE;
const fixtureType = process.env.VULCAN_FIXTURE_TYPE ?? "production";
const fixtureDir = process.env.VULCAN_FIXTURE_DIR;
const defaultCsv = [
  "date,line,machine,sku,shift,planned_quantity,actual_quantity,good_quantity,rejected_quantity,reworked_quantity,planned_minutes,downtime_minutes,ideal_cycle_minutes",
  "2026-07-31,Press Line 02,Press 01,AX-440,Shift A,12,10,9,1,0,480,12,0.32",
].join("\n");
const fixtures = fixtureDir
  ? ["production", "downtime", "quality", "inventory", "orders"].map((type) => {
      const path = join(fixtureDir, `${type}.csv`);
      return { type, name: basename(path), csv: readFileSync(path, "utf8") };
    })
  : fixturePath
    ? [{ type: fixtureType, name: basename(fixturePath), csv: readFileSync(fixturePath, "utf8") }]
    : [{ type: "production", name: "production-smoke.csv", csv: defaultCsv }];
const candidates = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const chromePath = candidates.find(existsSync);
if (!chromePath) throw new Error("Chrome was not found. Set CHROME_BIN to run the UI smoke test.");

const profilePath = mkdtempSync(join(tmpdir(), "vulcan-chrome-smoke-"));
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--no-sandbox",
  "--no-first-run",
  "--no-default-browser-check",
  "--remote-allow-origins=*",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profilePath}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
let chromeError = "";
chrome.stderr.on("data", (chunk) => { chromeError += chunk.toString(); });

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function retry(action, description, attempts = 60) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await action();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await pause(200);
  }
  throw new Error(`${description} timed out.${lastError ? ` ${lastError.message}` : ""}`);
}

let socket;
let commandId = 0;
const pending = new Map();

function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++commandId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "Browser evaluation failed.");
  return result.result?.value;
}

async function waitFor(expression, description, attempts) {
  return retry(() => evaluate(expression), description, attempts);
}

async function navigate(path) {
  await command("Page.navigate", { url: `${baseUrl}${path}` });
  await waitFor(`document.readyState === "complete"`, `navigation to ${path}`);
  await pause(350);
}

async function clickText(selector, text) {
  const clicked = await evaluate(`(() => {
    const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find((item) => item.textContent.trim().includes(${JSON.stringify(text)}));
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Could not find ${selector} containing “${text}”.`);
}

async function setLabelledInput(labelText, value) {
  const updated = await evaluate(`(() => {
    const label = [...document.querySelectorAll(".compact-dialog label")].find((item) => item.textContent.includes(${JSON.stringify(labelText)}));
    const input = label?.querySelector("input");
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  if (!updated) throw new Error(`Could not fill “${labelText}”.`);
}

async function selectDatasetType(value) {
  const updated = await evaluate(`(() => {
    const select = document.querySelector(".dataset-selector select");
    if (!select) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setter.call(select, ${JSON.stringify(value)});
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  if (!updated) throw new Error("Dataset type selector was not available.");
}

try {
  const version = await retry(async () => {
    if (chrome.exitCode !== null) throw new Error(chromeError.trim() || `Chrome exited with code ${chrome.exitCode}.`);
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
    return response.ok ? response.json() : null;
  }, "Chrome startup");
  if (!version.webSocketDebuggerUrl) throw new Error("Chrome did not expose a debugging endpoint.");

  const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(baseUrl)}`, { method: "PUT" });
  const target = await targetResponse.json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  };
  await command("Page.enable");
  await command("Runtime.enable");

  await navigate("/");
  const requiredWidgets = ["Production plan vs actual", "OEE & factory performance", "Orders at risk", "Downtime & bottlenecks", "Quality losses", "Inventory & material risk", "Priority alerts & recommended actions"];
  for (const title of requiredWidgets) await waitFor(`document.body.innerText.includes(${JSON.stringify(title)})`, `widget “${title}”`);
  if (process.env.VULCAN_SCREENSHOT) {
    await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(process.env.VULCAN_SCREENSHOT, Buffer.from(screenshot.data, "base64"));
  }

  await clickText("a", "Add factory data");
  await waitFor(`location.pathname === "/uploads"`, "data upload navigation");
  await waitFor(`document.body.innerText.includes("Import only what is valid")`, "data upload page render");
  await pause(500);

  const imported = [];
  for (const fixture of fixtures) {
    await clickText("header.page-header button.button-accent", "Add factory data");
    await waitFor(`document.body.innerText.includes("Django inspects")`, `${fixture.type} input step`);
    await selectDatasetType(fixture.type);
    const expectedRows = fixture.csv.trim().split(/\r?\n/).length - 1;
    const fileAttached = await evaluate(`(() => {
      const input = document.querySelector('input[type="file"]');
      if (!input) return false;
      const transfer = new DataTransfer();
      transfer.items.add(new File([${JSON.stringify(fixture.csv)}], ${JSON.stringify(fixture.name)}, { type: "text/csv" }));
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
    if (!fileAttached) throw new Error(`${fixture.name} could not be attached.`);
    await clickText("button", "Inspect file");
    await waitFor(
      `document.body.innerText.includes(${JSON.stringify(`Map ${fixture.type} data`)})`,
      `${fixture.type} mapping interface`,
    );
    await clickText("button", "Validate mapping");
    await waitFor(
      `document.body.innerText.includes("Validation results")`,
      `${fixture.type} validation result`,
    );
    await clickText("button", "Import valid rows");
    await waitFor(
      `document.body.innerText.includes(${JSON.stringify(`${expectedRows} rows added`)})`,
      `${fixture.type} standardised import`,
      300,
    );
    imported.push({ ...fixture, rows: expectedRows });
    await clickText("button", "Done");
  }
  await navigate("/");
  await waitFor(
    `document.body.innerText.includes("Priority alerts & recommended actions")`,
    "command-centre render",
  );
  if (fixtureDir) {
    const expectedNames = imported.map((fixture) => fixture.name);
    await navigate("/uploads");
    for (const name of expectedNames) {
      await waitFor(
        `document.body.innerText.includes(${JSON.stringify(name)})`,
        `${name} persistence after reload`,
        300,
      );
    }
    await navigate("/");
    await waitFor(
      `document.body.innerText.includes("Priority alerts & recommended actions")`,
      "command-centre render after persistence check",
    );
  }
  await pause(500);

  await clickText("button", "Create action");
  await waitFor(`document.body.innerText.includes("Action created for the factory team")`, "alert action creation");

  await navigate("/settings?create=factory");
  await waitFor(`document.body.innerText.includes("Create a factory")`, "factory dialog");
  await setLabelledInput("Factory name", "Smoke Test Plant");
  await setLabelledInput("Factory code", "SMK-01");
  await setLabelledInput("Location", "Pune, Maharashtra");
  await clickText(".compact-dialog button", "Create factory");
  await waitFor(`document.body.innerText.includes("Smoke Test Plant")`, "factory creation");

  const importSummary = imported.map((fixture) => `${fixture.name} (${fixture.rows} rows)`).join(", ");
  console.log(`UI smoke test passed: seven widgets, ${importSummary} mapping/import, action creation, and factory creation.`);
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (chrome.exitCode === null) {
    chrome.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => chrome.once("exit", resolve)), pause(2_000)]);
  }
  try {
    rmSync(profilePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (cleanupError) {
    console.warn(`Chrome profile cleanup skipped: ${cleanupError.message}`);
  }
}
