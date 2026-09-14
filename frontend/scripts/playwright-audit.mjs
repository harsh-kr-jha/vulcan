import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = process.env.VULCAN_BASE_URL ?? "http://localhost:3000";
const SCREENSHOTS_DIR = "C:\\Users\\u1233270\\.gemini\\antigravity-ide\\brain\\9cd51186-a242-401e-8547-69391db86d5e\\screenshots";
const RESULTS_FILE = "C:\\Users\\u1233270\\.gemini\\antigravity-ide\\brain\\9cd51186-a242-401e-8547-69391db86d5e\\audit_results.json";

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const auditResults = {
  timestamp: new Date().toISOString(),
  baseUrl: BASE_URL,
  routesAudited: [],
  globalIssues: [],
  summary: {
    totalRoutes: 0,
    routesWithErrors: 0,
    consoleErrorsCount: 0,
    networkFailuresCount: 0,
    layoutOverflowsCount: 0,
  }
};

async function runAudit() {
  console.log(`Starting Playwright UI Audit against ${BASE_URL} using Chrome...`);
  
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  const routes = [
    { path: "/", name: "root" },
    { path: "/dashboard", name: "dashboard" },
    { path: "/digital-twin", name: "digital_twin" },
    { path: "/uploads", name: "uploads" },
    { path: "/settings", name: "settings" },
    { path: "/alerts", name: "alerts" },
    { path: "/performance", name: "performance" },
    { path: "/rules", name: "rules" },
    { path: "/methodology", name: "methodology" },
    { path: "/help", name: "help" },
    { path: "/login", name: "login" },
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
      consoleLogs: [],
      consoleErrors: [],
      consoleWarnings: [],
      unhandledExceptions: [],
      networkFailures: [],
      httpErrors: [],
      desktopOverflow: false,
      mobileOverflow: false,
      screenshots: {},
      visualChecks: {},
      notes: [],
    };

    // Desktop Test
    const contextDesktop = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await contextDesktop.newPage();

    // Listeners
    page.on("console", (msg) => {
      if (msg.text().includes("favicon.ico")) return;
      const entry = { type: msg.type(), text: msg.text(), location: msg.location() };
      if (msg.type() === "error") {
        routeReport.consoleErrors.push(entry);
        auditResults.summary.consoleErrorsCount++;
      } else if (msg.type() === "warning") {
        routeReport.consoleWarnings.push(entry);
      } else {
        routeReport.consoleLogs.push(entry);
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
      const response = await page.goto(`${BASE_URL}${route.path}`, {
        waitUntil: "networkidle",
        timeout: 15000,
      }).catch(async (e) => {
        console.warn(`networkidle timeout on ${route.path}, trying load: ${e.message}`);
        return page.goto(`${BASE_URL}${route.path}`, { waitUntil: "load", timeout: 10000 });
      });

      await page.waitForTimeout(1000); // allow client rendering/charts to settle
      routeReport.finalUrl = page.url();

      // Check overflow
      const desktopOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      routeReport.desktopOverflow = desktopOverflow;
      if (desktopOverflow) {
        auditResults.summary.layoutOverflowsCount++;
        routeReport.notes.push("Horizontal overflow detected on desktop viewport (1440px)");
      }

      // Check visible errors in DOM
      const domIssues = await page.evaluate(() => {
        const issues = [];
        // Check for error text
        const errorBanners = document.querySelectorAll('.error, [role="alert"], .bg-red-500, .text-red-500');
        errorBanners.forEach((el) => {
          const txt = el.textContent?.trim();
          if (txt && !issues.includes(txt)) issues.push(`Banner/Alert: ${txt.slice(0, 100)}`);
        });

        // Check for undefined / NaN / [object Object] in text
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (node.parentElement && ["SCRIPT", "STYLE", "NOSCRIPT"].includes(node.parentElement.tagName)) continue;
          const t = node.textContent?.trim() || "";
          if (t.includes("undefined") && !t.includes("typeof undefined")) issues.push(`Text contains 'undefined': "${t.slice(0, 80)}"`);
          if (t.includes("NaN")) issues.push(`Text contains 'NaN': "${t.slice(0, 80)}"`);
          if (t.includes("[object Object]")) issues.push(`Text contains '[object Object]': "${t.slice(0, 80)}"`);
        }

        // Check broken images
        const imgs = Array.from(document.querySelectorAll("img"));
        imgs.forEach((img) => {
          if (!img.complete || img.naturalWidth === 0) {
            issues.push(`Broken image src: ${img.getAttribute("src")}`);
          }
        });

        return issues;
      });
      routeReport.visualChecks.domIssues = domIssues;

      // Check specific elements depending on page
      if (route.name === "dashboard") {
        const widgets = await page.evaluate(() => {
          return Array.from(document.querySelectorAll("h2, h3, .metric-card, .widget-title, .card-title"))
            .map(el => el.textContent?.trim())
            .filter(Boolean);
        });
        routeReport.visualChecks.dashboardWidgets = widgets.slice(0, 15);
      }

      if (route.name === "digital_twin") {
        const twinStats = await page.evaluate(() => {
          const stages = document.querySelectorAll(".stage-card, [data-stage], .digital-twin-stage");
          const machines = document.querySelectorAll(".machine-node, .machine-card, [data-machine]");
          return { stagesFound: stages.length, machinesFound: machines.length };
        });
        routeReport.visualChecks.digitalTwin = twinStats;
      }

      if (route.name === "settings") {
        const tabs = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('[role="tab"], .tab-button, button.nav-tab, .settings-nav button'))
            .map(el => el.textContent?.trim())
            .filter(Boolean);
        });
        routeReport.visualChecks.settingsTabs = tabs;
      }

      // Screenshot desktop
      const desktopScreenshotFile = join(SCREENSHOTS_DIR, `${route.name}_desktop.png`);
      await page.screenshot({ path: desktopScreenshotFile, fullPage: true });
      routeReport.screenshots.desktop = desktopScreenshotFile;
      console.log(`✓ Saved desktop screenshot: ${desktopScreenshotFile}`);

      // Mobile Test
      const pageMobile = await contextDesktop.newPage();
      await pageMobile.setViewportSize({ width: 390, height: 844 });
      await pageMobile.goto(`${BASE_URL}${route.path}`, { waitUntil: "load", timeout: 15000 });
      await pageMobile.waitForTimeout(800);

      const mobileOverflow = await pageMobile.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      routeReport.mobileOverflow = mobileOverflow;
      if (mobileOverflow) {
        auditResults.summary.layoutOverflowsCount++;
        routeReport.notes.push("Horizontal overflow detected on mobile viewport (390px)");
      }

      const mobileScreenshotFile = join(SCREENSHOTS_DIR, `${route.name}_mobile.png`);
      await pageMobile.screenshot({ path: mobileScreenshotFile, fullPage: true });
      routeReport.screenshots.mobile = mobileScreenshotFile;
      console.log(`✓ Saved mobile screenshot: ${mobileScreenshotFile}`);

      await pageMobile.close();

    } catch (err) {
      routeReport.status = "failed";
      routeReport.notes.push(`Audit execution failed: ${err.message}`);
      console.error(`✗ Route audit failed:`, err);
    } finally {
      if (routeReport.consoleErrors.length > 0 || routeReport.unhandledExceptions.length > 0 || routeReport.httpErrors.length > 0) {
        routeReport.status = "has_errors";
        auditResults.summary.routesWithErrors++;
      }
      auditResults.routesAudited.push(routeReport);
      await contextDesktop.close();
    }
  }

  // Interactive check: Test popovers and dialogs
  console.log(`\n========================================`);
  console.log(`Auditing Interactive Shell Components`);
  console.log(`========================================`);
  const shellReport = {
    name: "interactive_shell",
    popovers: {},
    factorySwitcher: {},
    dialogs: {},
    issues: [],
  };

  const shellContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const shellPage = await shellContext.newPage();
  try {
    await shellPage.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle", timeout: 15000 });
    await shellPage.waitForTimeout(1000);

    // Test farm / factory switcher
    const switcher = await shellPage.$(".factory-switcher, button:has-text('Musroom'), button:has-text('Factory')");
    if (switcher) {
      await switcher.click();
      await shellPage.waitForTimeout(400);
      const menuVisible = await shellPage.evaluate(() => !!document.querySelector(".factory-menu, [role='menu'], .dropdown-menu"));
      shellReport.factorySwitcher.opensMenu = menuVisible;
      await shellPage.screenshot({ path: join(SCREENSHOTS_DIR, `shell_factory_switcher.png`) });
    } else {
      shellReport.issues.push("Factory switcher button not found on topbar");
    }

    // Test Profile popover
    const profileBtn = await shellPage.$('button[aria-label="Open workspace menu"], .profile-button, [data-testid="profile-btn"]');
    if (profileBtn) {
      await profileBtn.click();
      await shellPage.waitForTimeout(400);
      const profileText = await shellPage.evaluate(() => document.querySelector(".profile-popover, [role='dialog']")?.innerText || "");
      shellReport.popovers.profile = { text: profileText.slice(0, 150) };
      await shellPage.screenshot({ path: join(SCREENSHOTS_DIR, `shell_profile_popover.png`) });
    }

    // Test Upload modal trigger
    await shellPage.goto(`${BASE_URL}/uploads`, { waitUntil: "networkidle", timeout: 15000 });
    await shellPage.waitForTimeout(600);
    const connectDataBtn = await shellPage.$("button:has-text('Connect'), button:has-text('Upload'), button.button-accent");
    if (connectDataBtn) {
      await connectDataBtn.click();
      await shellPage.waitForTimeout(500);
      const dialogVisible = await shellPage.evaluate(() => !!document.querySelector("[role='dialog'], .modal, .upload-modal"));
      shellReport.dialogs.uploadModal = dialogVisible;
      await shellPage.screenshot({ path: join(SCREENSHOTS_DIR, `modal_upload.png`) });
    }

  } catch (e) {
    shellReport.issues.push(`Shell interaction error: ${e.message}`);
  } finally {
    await shellContext.close();
  }

  auditResults.shellInteractions = shellReport;

  await browser.close();

  // Save audit results
  writeFileSync(RESULTS_FILE, JSON.stringify(auditResults, null, 2), "utf8");
  console.log(`\n========================================`);
  console.log(`Audit Complete! Results written to: ${RESULTS_FILE}`);
  console.log(`Total routes: ${auditResults.summary.totalRoutes}`);
  console.log(`Routes with errors: ${auditResults.summary.routesWithErrors}`);
  console.log(`Console errors: ${auditResults.summary.consoleErrorsCount}`);
  console.log(`Network failures: ${auditResults.summary.networkFailuresCount}`);
  console.log(`Layout overflows: ${auditResults.summary.layoutOverflowsCount}`);
  console.log(`========================================`);
}

runAudit().catch((err) => {
  console.error("FATAL AUDIT ERROR:", err);
  process.exit(1);
});
