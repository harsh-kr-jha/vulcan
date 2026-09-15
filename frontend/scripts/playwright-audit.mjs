import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = process.env.VULCAN_BASE_URL ?? "http://localhost:3000";
const SCREENSHOTS_DIR = "C:\\Users\\u1233270\\.gemini\\antigravity-ide\\brain\\f0d6478e-853b-47b8-935d-543978df2400\\screenshots";
const RESULTS_FILE = "C:\\Users\\u1233270\\.gemini\\antigravity-ide\\brain\\f0d6478e-853b-47b8-935d-543978df2400\\audit_results.json";

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const auditResults = {
  timestamp: new Date().toISOString(),
  baseUrl: BASE_URL,
  routesAudited: [],
  deepAudits: {
    digitalTwin: {},
    dataPage: {},
  },
  globalIssues: [],
  summary: {
    totalRoutes: 0,
    routesWithErrors: 0,
    consoleErrorsCount: 0,
    networkFailuresCount: 0,
    desktopOverflowsCount: 0,
    mobileOverflowsCount: 0,
    smallTouchTargetsCount: 0,
  }
};

async function runAudit() {
  console.log(`Starting Comprehensive Playwright UI Audit against ${BASE_URL}...`);

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  const routes = [
    { path: "/", name: "home_overview" },
    { path: "/dashboard", name: "dashboard" },
    { path: "/digital-twin", name: "digital_twin" },
    { path: "/data", name: "data_sheets" },
    { path: "/settings", name: "settings" },
    { path: "/performance", name: "performance" },
    { path: "/rules", name: "rules" },
    { path: "/methodology", name: "methodology" },
    { path: "/help", name: "help" },
    { path: "/login", name: "login" },
    { path: "/digital-twin/entry/7026634e-c3e4-47fd-a215-8adc0806bd57", name: "machine_entry_qr" },
  ];

  auditResults.summary.totalRoutes = routes.length;

  for (const route of routes) {
    console.log(`\n========================================`);
    console.log(`Auditing: ${route.name} (${route.path})`);
    console.log(`========================================`);

    const routeReport = {
      name: route.name,
      path: route.path,
      finalUrl: "",
      status: "ok",
      consoleErrors: [],
      consoleWarnings: [],
      unhandledExceptions: [],
      networkFailures: [],
      httpErrors: [],
      desktopOverflow: false,
      mobileOverflow: false,
      smallTouchTargets: [],
      screenshots: {},
      visualChecks: {},
      notes: [],
    };

    // Desktop Test (1440x900)
    const contextDesktop = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await contextDesktop.newPage();

    page.on("console", (msg) => {
      if (msg.text().includes("favicon.ico") || msg.text().includes("[Fast Refresh]")) return;
      const entry = { type: msg.type(), text: msg.text(), location: msg.location() };
      if (msg.type() === "error") {
        routeReport.consoleErrors.push(entry);
        auditResults.summary.consoleErrorsCount++;
      } else if (msg.type() === "warning") {
        routeReport.consoleWarnings.push(entry);
      }
    });

    page.on("pageerror", (err) => {
      routeReport.unhandledExceptions.push({ message: err.message, stack: err.stack });
      auditResults.summary.consoleErrorsCount++;
    });

    page.on("requestfailed", (req) => {
      if (req.url().includes("favicon.ico")) return;
      const failure = {
        url: req.url(),
        method: req.method(),
        failure: req.failure()?.errorText,
      };
      routeReport.networkFailures.push(failure);
      auditResults.summary.networkFailuresCount++;
    });

    page.on("response", (res) => {
      if (res.status() >= 400 && !res.url().includes("favicon.ico")) {
        routeReport.httpErrors.push({
          url: res.url(),
          status: res.status(),
          statusText: res.statusText(),
        });
      }
    });

    try {
      await page.goto(`${BASE_URL}${route.path}`, {
        waitUntil: "load",
        timeout: 15000,
      });

      await page.waitForTimeout(1200); // Allow data fetches / canvas to paint
      routeReport.finalUrl = page.url();

      // Horizontal overflow check (Desktop)
      const desktopOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      routeReport.desktopOverflow = desktopOverflow;
      if (desktopOverflow) {
        auditResults.summary.desktopOverflowsCount++;
        routeReport.notes.push("Horizontal overflow detected on desktop viewport (1440px)");
      }

      // Check text / DOM anomalies
      const domIssues = await page.evaluate(() => {
        const issues = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (node.parentElement && ["SCRIPT", "STYLE", "NOSCRIPT"].includes(node.parentElement.tagName)) continue;
          const t = node.textContent?.trim() || "";
          if (t.includes("undefined") && !t.includes("typeof undefined")) issues.push(`Text contains 'undefined': "${t.slice(0, 80)}"`);
          if (t.includes("NaN") && !t.includes("NaNpx")) issues.push(`Text contains 'NaN': "${t.slice(0, 80)}"`);
          if (t.includes("[object Object]")) issues.push(`Text contains '[object Object]': "${t.slice(0, 80)}"`);
        }
        return issues;
      });
      routeReport.visualChecks.domIssues = domIssues;

      // Screenshot Desktop
      const desktopScreenshotFile = join(SCREENSHOTS_DIR, `${route.name}_desktop.png`);
      await page.screenshot({ path: desktopScreenshotFile, fullPage: true });
      routeReport.screenshots.desktop = desktopScreenshotFile;
      console.log(`  ✓ Saved desktop screenshot: ${route.name}_desktop.png`);

      // Mobile Test (390x844)
      const contextMobile = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      });
      const pageMobile = await contextMobile.newPage();

      await pageMobile.goto(`${BASE_URL}${route.path}`, { waitUntil: "load", timeout: 15000 });
      await pageMobile.waitForTimeout(1000);

      const mobileOverflow = await pageMobile.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      routeReport.mobileOverflow = mobileOverflow;
      if (mobileOverflow) {
        auditResults.summary.mobileOverflowsCount++;
        routeReport.notes.push("Horizontal overflow detected on mobile viewport (390px)");
      }

      // Small touch targets check (< 36px)
      const smallTargets = await pageMobile.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button, a[href], input[type='button'], input[type='submit']"));
        const tooSmall = [];
        for (const el of buttons) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && (rect.width < 34 || rect.height < 34)) {
            const label = el.getAttribute("aria-label") || el.innerText?.slice(0, 30) || el.title || el.className;
            tooSmall.push({ label: label.trim(), width: Math.round(rect.width), height: Math.round(rect.height) });
          }
        }
        return tooSmall.slice(0, 8);
      });
      routeReport.smallTouchTargets = smallTargets;
      auditResults.summary.smallTouchTargetsCount += smallTargets.length;

      const mobileScreenshotFile = join(SCREENSHOTS_DIR, `${route.name}_mobile.png`);
      await pageMobile.screenshot({ path: mobileScreenshotFile, fullPage: true });
      routeReport.screenshots.mobile = mobileScreenshotFile;
      console.log(`  ✓ Saved mobile screenshot: ${route.name}_mobile.png`);

      await contextMobile.close();

    } catch (err) {
      routeReport.status = "failed";
      routeReport.notes.push(`Audit error: ${err.message}`);
      console.error(`  ✗ Route audit error:`, err);
    } finally {
      if (routeReport.consoleErrors.length > 0 || routeReport.unhandledExceptions.length > 0 || routeReport.httpErrors.length > 0) {
        routeReport.status = "has_errors";
        auditResults.summary.routesWithErrors++;
      }
      auditResults.routesAudited.push(routeReport);
      await contextDesktop.close();
    }
  }

  // Deep Interactive Audit: Mushroom Factory Twin (/digital-twin)
  console.log(`\n========================================`);
  console.log(`Deep Interactive Audit: Mushroom Factory Twin`);
  console.log(`========================================`);

  const twinContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const twinPage = await twinContext.newPage();
  const twinReport = {
    viewMode: {},
    zoomInteraction: {},
    machineInteraction: {},
    editMode: {},
    issues: [],
  };

  try {
    await twinPage.goto(`${BASE_URL}/digital-twin`, { waitUntil: "load", timeout: 15000 });
    await twinPage.waitForTimeout(1500);

    const svgExists = await twinPage.evaluate(() => !!document.querySelector("svg"));
    twinReport.viewMode.svgRendered = svgExists;

    const machineNodesCount = await twinPage.evaluate(() => {
      return document.querySelectorAll("g[role='button'], rect").length;
    });
    twinReport.viewMode.elementCount = machineNodesCount;

    const zoomInBtn = await twinPage.$("button[title*='Zoom In']");
    const zoomOutBtn = await twinPage.$("button[title*='Zoom Out']");
    const zoomPctBtn = await twinPage.$("button[title*='Reset Zoom']");
    const fitScreenBtn = await twinPage.$("button[title*='Fit to Screen']");

    twinReport.zoomInteraction.hasZoomControls = !!(zoomInBtn && zoomOutBtn && zoomPctBtn && fitScreenBtn);

    if (zoomInBtn) {
      const initialPct = await zoomPctBtn?.innerText();
      await zoomInBtn.click();
      await twinPage.waitForTimeout(300);
      await zoomInBtn.click();
      await twinPage.waitForTimeout(300);
      const zoomedInPct = await zoomPctBtn?.innerText();
      twinReport.zoomInteraction.zoomInWorks = initialPct !== zoomedInPct;
      twinReport.zoomInteraction.afterZoomIn = zoomedInPct;
      await twinPage.screenshot({ path: join(SCREENSHOTS_DIR, `twin_zoomed_in.png`) });

      if (fitScreenBtn) {
        await fitScreenBtn.click();
        await twinPage.waitForTimeout(300);
        const resetPct = await zoomPctBtn?.innerText();
        twinReport.zoomInteraction.resetWorks = resetPct === "100%";
      }
    }

    const firstMachine = await twinPage.$("g[role='button']");
    if (firstMachine) {
      await firstMachine.hover();
      await twinPage.waitForTimeout(500);
      const tooltipVisible = await twinPage.evaluate(() => {
        const tooltip = document.querySelector(".fixed.z-50");
        return !!tooltip && tooltip.clientHeight > 0;
      });
      twinReport.machineInteraction.tooltipAppears = tooltipVisible;
      await twinPage.screenshot({ path: join(SCREENSHOTS_DIR, `twin_machine_tooltip.png`) });
    }

    const editBtn = await twinPage.$("button[title='Edit Layout']");
    if (editBtn) {
      await editBtn.click();
      await twinPage.waitForTimeout(800);
      const inEditMode = await twinPage.evaluate(() => {
        return document.body.innerText.includes("Edit Lexicon") || document.body.innerText.includes("Save Lexicon");
      });
      twinReport.editMode.enteredEditMode = inEditMode;
      await twinPage.screenshot({ path: join(SCREENSHOTS_DIR, `twin_in_edit_mode.png`) });

      const cancelBtn = await twinPage.$("button:has-text('Cancel')");
      if (cancelBtn) {
        await cancelBtn.click();
        await twinPage.waitForTimeout(500);
      }
    }

  } catch (e) {
    twinReport.issues.push(`Twin audit error: ${e.message}`);
  } finally {
    await twinContext.close();
  }
  auditResults.deepAudits.digitalTwin = twinReport;

  // Deep Interactive Audit: Data Page (/data)
  console.log(`\n========================================`);
  console.log(`Deep Interactive Audit: Live Data Page`);
  console.log(`========================================`);

  const dataContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dataPage = await dataContext.newPage();
  const dataReport = {
    cardView: {},
    sheetView: {},
    exportButtons: {},
    issues: [],
  };

  try {
    await dataPage.goto(`${BASE_URL}/data`, { waitUntil: "load", timeout: 15000 });
    await dataPage.waitForTimeout(1000);

    const exportExcelBtn = await dataPage.$("button:has-text('Export to Excel'), button:has-text('Excel')");
    const exportCsvBtn = await dataPage.$("button:has-text('Export CSV'), button:has-text('CSV')");
    const copyTsvBtn = await dataPage.$("button:has-text('Copy Table'), button:has-text('Copy')");

    dataReport.exportButtons.hasExcelExport = !!exportExcelBtn;
    dataReport.exportButtons.hasCsvExport = !!exportCsvBtn;
    dataReport.exportButtons.hasCopyTsv = !!copyTsvBtn;

    const sheetFormatToggle = await dataPage.$("button:has-text('View in Sheet Format'), button:has-text('Sheet Format')");
    if (sheetFormatToggle) {
      await sheetFormatToggle.click();
      await dataPage.waitForTimeout(600);
      const sheetVisible = await dataPage.evaluate(() => {
        return !!document.querySelector("table") && document.body.innerText.includes("Row");
      });
      dataReport.sheetView.toggledSuccessfully = sheetVisible;
      await dataPage.screenshot({ path: join(SCREENSHOTS_DIR, `data_sheet_format.png`) });
    } else {
      dataReport.issues.push("Sheet format toggle button not found");
    }

  } catch (e) {
    dataReport.issues.push(`Data audit error: ${e.message}`);
  } finally {
    await dataContext.close();
  }
  auditResults.deepAudits.dataPage = dataReport;

  await browser.close();

  // Save audit results JSON
  writeFileSync(RESULTS_FILE, JSON.stringify(auditResults, null, 2), "utf8");
  console.log(`\n========================================`);
  console.log(`Audit Finished! Report saved to: ${RESULTS_FILE}`);
  console.log(`Total Routes: ${auditResults.summary.totalRoutes}`);
  console.log(`Routes with Errors: ${auditResults.summary.routesWithErrors}`);
  console.log(`Console Errors: ${auditResults.summary.consoleErrorsCount}`);
  console.log(`Network Failures: ${auditResults.summary.networkFailuresCount}`);
  console.log(`Desktop Overflows: ${auditResults.summary.desktopOverflowsCount}`);
  console.log(`Mobile Overflows: ${auditResults.summary.mobileOverflowsCount}`);
  console.log(`Small Touch Targets (<44px): ${auditResults.summary.smallTouchTargetsCount}`);
  console.log(`========================================`);
}

runAudit().catch((err) => {
  console.error("FATAL AUDIT RUNNER ERROR:", err);
  process.exit(1);
});
