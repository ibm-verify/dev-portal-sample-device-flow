/**
 * E2E test suite – OAuth 2.0 Device Authorization Grant (RFC 8628)
 * IBM Security Verify integration
 *
 * Source-of-truth mapping (do not change selectors without re-reading the app):
 *
 *  layout.pug   l.36  h1 "Device authorization flow sample app."  (in .jumbotron)
 *               l.3   title= title  → title var never passed → <title> is blank
 *               l.23  socket.on('success', fn) → window.location.href = res.auth
 *
 *  index.pug    l.7   button.btn.btn-primary  "Device code"
 *                     onclick calls authorizeApplication → window.location.href='/authorize'
 *
 *  authorize.pug l.6  a(href=qrCode)  where qrCode = verification_uri_complete
 *                     e.g. https://tenant/oauth2/user_authorization?...&user_code=HAP2QQ
 *
 *  server.js    l.100 client.deviceAuthorization(params)
 *               l.108 qrCode = deviceCodeResponse.verification_uri_complete
 *               l.112 pollAuthenticationStatus() starts immediately after render
 *               l.182 io.emit("success", { auth: "/authenticated" }) on token grant
 *               l.75  verifyToken: checks node-persist "tokenSet" (server-side state)
 *
 *  authenticated.pug l.5  h3 Welcome #{userInfo.displayName || userInfo.name || ...}
 *                    l.6  p.lead "You have successfully authenticated with IBM Security Verify."
 *                    l.29 a(href='/logout') "log out"
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Required environment variables
 * ─────────────────────────────────────────────────────────────────────────────
 *   APP_URL        – Sample app base URL  (default: http://localhost:3000)
 *   TEST_USERNAME  – IBM Verify test-user username
 *   TEST_PASSWORD  – IBM Verify test-user password
 */

import { test, expect, Browser, BrowserContext, Page } from "@playwright/test";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(
  /\/$/,
  ""
);
const TEST_USERNAME = process.env.TEST_USERNAME ?? "";
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? "";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: extract verification_uri_complete and user_code from /authorize
//
// authorize.pug renders:
//   p #[a(href=qrCode target='_blank') #{qrCode}]
//
// where qrCode is the full verification_uri_complete, e.g.:
//   https://tenant/oauth2/user_authorization?client_id=...&user_code=HAP2QQ
//
// The href itself is the stable selector — we match on the IBM Verify OAuth
// path pattern rather than any surrounding DOM structure.
// ─────────────────────────────────────────────────────────────────────────────

async function extractDeviceFlowParams(devicePage: Page): Promise<{
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
}> {
  // Match the anchor whose href contains an IBM Verify device authorisation
  // URL with a user_code query parameter.  This is the rendered qrCode value
  // from server.js line 108.
  const anchor = devicePage
    .locator('a[href*="user_code="]')
    .first();

  await anchor.waitFor({ state: "visible", timeout: 15_000 });

  const href = await anchor.getAttribute("href");
  if (!href) {
    throw new Error("Could not find verification_uri_complete anchor on /authorize page");
  }

  const url = new URL(href);
  const userCode = url.searchParams.get("user_code") ?? "";
  if (!userCode) {
    throw new Error(`user_code not found in href: ${href}`);
  }

  const verificationUri = `${url.origin}${url.pathname}`;

  return { userCode, verificationUri, verificationUriComplete: href };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: enter user_code on IBM Verify device-activation page (if required)
//
// When navigating to verification_uri_complete the user_code may already be
// accepted and the login page shown directly.  Only fill + submit when a
// visible user-code input is actually present.
//
// IMPORTANT: do NOT click any button when no code input is found — that would
// accidentally submit the login form before credentials are entered.
// ─────────────────────────────────────────────────────────────────────────────

async function enterUserCodeIfRequired(
  userPage: Page,
  userCode: string
): Promise<void> {
  // Look for a visible user-code input using label, placeholder, or attribute.
  const codeInput = userPage
    .getByLabel(/user.?code/i)
    .or(userPage.getByPlaceholder(/code/i))
    .or(
      userPage.locator(
        'input[name="user_code"], input[id*="user_code"], input[id*="userCode"]'
      )
    )
    .first();

  const inputVisible = await codeInput.isVisible().catch(() => false);

  if (!inputVisible) {
    // Code already accepted (verification_uri_complete pre-filled it);
    // do nothing — the login page is already shown.
    return;
  }

  await codeInput.fill(userCode);

  // Only submit the code form after filling the code input.
  const submitBtn = userPage
    .getByRole("button", { name: /continue|next|submit/i })
    .first()
    .or(userPage.locator('button[type="submit"], input[type="submit"]').first());

  await submitBtn.click();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: authenticate on the IBM Verify login page
//
// Handles both single-step (username + password on one form) and
// progressive-disclosure (username → Continue → password) flows.
// Credentials are never logged or asserted.
// ─────────────────────────────────────────────────────────────────────────────

async function authenticateOnIBMVerify(
  userPage: Page,
  username: string,
  password: string
): Promise<void> {
  // ── Username ──────────────────────────────────────────────────────────────
  const usernameInput = userPage
    .getByLabel(/username|email|user name/i)
    .first()
    .or(userPage.getByPlaceholder(/username|email/i).first())
    .or(
      userPage
        .locator('input[name="username"], input[autocomplete="username"], input[type="email"]')
        .first()
    );

  await usernameInput.waitFor({ state: "visible", timeout: 20_000 });
  await usernameInput.fill(username);

  // Progressive-disclosure: "Continue" / "Next" reveals the password field.
  const continueAfterUsername = userPage.getByRole("button", {
    name: /^(continue|next)$/i,
  });
  if (await continueAfterUsername.first().isVisible().catch(() => false)) {
    await continueAfterUsername.first().click();
  }

  // ── Password ──────────────────────────────────────────────────────────────
  const passwordInput = userPage
    .getByLabel(/password/i)
    .first()
    .or(userPage.getByPlaceholder(/password/i).first())
    .or(userPage.locator('input[type="password"]').first());

  await passwordInput.waitFor({ state: "visible", timeout: 20_000 });
  await passwordInput.fill(password);

  // ── Sign in ───────────────────────────────────────────────────────────────
  const signInBtn = userPage
    .getByRole("button", { name: /sign in|log in|continue/i })
    .first()
    .or(
      userPage
        .locator('button[type="submit"], input[type="submit"]')
        .first()
    );

  await signInBtn.click();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: accept consent / grant screen (no-op if absent)
// ─────────────────────────────────────────────────────────────────────────────

async function handleConsentPrompt(userPage: Page): Promise<void> {
  const allowBtn = userPage
    .getByRole("button", { name: /allow|grant|approve|accept/i })
    .first()
    .or(userPage.locator('button[value="accept"]').first());

  const appeared = await allowBtn
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);

  if (appeared) {
    await allowBtn.click();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: wait for the device page to reach /authenticated
//
// The server emits io.emit("success", { auth: "/authenticated" }) once the
// token grant succeeds (server.js l.182).  layout.pug listens with
// socket.on('success', fn) and sets window.location.href = res.auth.
//
// We wait for the native URL transition — never navigate devicePage ourselves —
// so the socket.io connection stays alive throughout polling.
// ─────────────────────────────────────────────────────────────────────────────

async function waitForDeviceAuthenticated(devicePage: Page): Promise<void> {
  await devicePage.waitForURL(`${APP_URL}/authenticated`, {
    timeout: 90_000, // generous: polling is 5 s/cycle, may take several cycles
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-flight guard
// ─────────────────────────────────────────────────────────────────────────────

test.beforeAll(() => {
  const missing: string[] = [];
  if (!TEST_USERNAME) missing.push("TEST_USERNAME");
  if (!TEST_PASSWORD) missing.push("TEST_PASSWORD");

  if (missing.length > 0) {
    throw new Error(
      `E2E pre-flight failed — missing environment variables: ${missing.join(", ")}.\n` +
        `Set them in .env or pass inline: TEST_USERNAME=... TEST_PASSWORD=... npm test`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

test.describe("OAuth 2.0 Device Authorization Grant – IBM Security Verify", () => {
  let browser: Browser;
  let deviceContext: BrowserContext;
  let devicePage: Page;

  test.beforeEach(async ({ browser: b }) => {
    browser = b;
    deviceContext = await browser.newContext({ baseURL: APP_URL });
    devicePage = await deviceContext.newPage();
  });

  test.afterEach(async () => {
    await deviceContext.close();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test 1 – Home screen
  //
  // layout.pug renders h1 "Device authorization flow sample app." inside
  // .jumbotron on every page.  The <title> element is blank because no title
  // variable is passed to res.render("index").
  // index.pug renders a "Device code" button.
  // ───────────────────────────────────────────────────────────────────────────

  test("Home screen: visible heading and Device code button are present", async () => {
    await devicePage.goto("/");

    // The h1 in layout.pug .jumbotron is the reliable identity of this app.
    await expect(
      devicePage.getByRole("heading", {
        name: /device authorization flow sample app/i,
      })
    ).toBeVisible();

    // index.pug: button.btn.btn-primary "Device code"
    await expect(
      devicePage.getByRole("button", { name: /device code/i })
    ).toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test 2 – Full device-flow happy path
  //
  // Actor 1 (devicePage): stays alive so the socket.io "success" event
  //   emitted by pollAuthenticationStatus can redirect it.
  // Actor 2 (userPage):   isolated context that completes the authorisation
  //   on IBM Verify, then is closed.
  // ───────────────────────────────────────────────────────────────────────────

  test(
    "Full device flow: user authorises on IBM Verify → device reaches authenticated state",
    async () => {
      // ── Actor 1 – Initiate flow ────────────────────────────────────────────
      // index.pug button triggers window.location.href='/authorize' (layout.pug l.28)
      await devicePage.goto("/");
      await devicePage.getByRole("button", { name: /device code/i }).click();

      // Wait for /authorize to render (server.js l.93 registers the route
      // inside setupOIDC().then, so it may take a moment after first load).
      await devicePage.waitForURL(`${APP_URL}/authorize`, { timeout: 20_000 });

      // ── Actor 1 – Extract verification URL ────────────────────────────────
      // authorize.pug l.6: a(href=qrCode) where qrCode = verification_uri_complete
      const { userCode, verificationUriComplete, verificationUri } =
        await extractDeviceFlowParams(devicePage);

      // user_code is alphanumeric (e.g. "HAP2QQ") — do not over-specify format
      expect(userCode).toBeTruthy();
      expect(userCode).toMatch(/^[A-Za-z0-9-]+$/);

      // ── Actor 2 – Open isolated context ───────────────────────────────────
      const userContext: BrowserContext = await browser.newContext({
        ignoreHTTPSErrors: true,
      });
      const userPage: Page = await userContext.newPage();

      try {
        // ── Actor 2 – Navigate to verification_uri_complete ──────────────────
        // Prefer the full URL (pre-fills user_code on IBM Verify).
        // Fall back to base URI only if complete URL is absent.
        await userPage.goto(verificationUriComplete || verificationUri);

        // ── Actor 2 – Enter user_code only if a visible input is present ─────
        // When verification_uri_complete is used, IBM Verify may have already
        // accepted the code and be showing the login page directly.
        await enterUserCodeIfRequired(userPage, userCode);

        // ── Actor 2 – Authenticate ────────────────────────────────────────────
        await authenticateOnIBMVerify(userPage, TEST_USERNAME, TEST_PASSWORD);

        // ── Actor 2 – Handle consent ──────────────────────────────────────────
        await handleConsentPrompt(userPage);

        // Allow IBM Verify to complete its post-auth redirect before closing.
        // We wait briefly for a URL change away from the login page rather than
        // an arbitrary sleep, so the close happens after the grant is issued.
        await userPage
          .waitForURL((url) => !url.pathname.includes("login"), {
            timeout: 15_000,
          })
          .catch(() => {
            // If no redirect occurs within the window the grant may still be
            // in-flight; close anyway and let the device side catch it.
          });
      } finally {
        await userContext.close();
      }

      // ── Actor 1 – Await socket.io redirect ────────────────────────────────
      // pollAuthenticationStatus (server.js l.161) polls every 5 s.
      // On success it calls io.emit("success", { auth: "/authenticated" })
      // and layout.pug's socket listener sets window.location.href.
      // We must NOT navigate devicePage — doing so would disconnect socket.io.
      await waitForDeviceAuthenticated(devicePage);

      // ── Actor 1 – Assert authenticated state ─────────────────────────────
      // authenticated.pug l.5: h3 Welcome #{displayName || name || preferred_username},
      await expect(devicePage.getByRole("heading", { level: 3 })).toBeVisible();

      // authenticated.pug l.6
      await expect(
        devicePage.getByText("You have successfully authenticated", {
          exact: false,
        })
      ).toBeVisible();

      // authenticated.pug l.11-26: table with user claims
      const claimsTable = devicePage.getByRole("table");
      await expect(claimsTable).toBeVisible();

      const claimRows = claimsTable.locator("tbody tr");
      const rowCount = await claimRows.count();
      expect(rowCount).toBeGreaterThan(0);

      // First cell of the first row must be a non-empty claim key.
      const firstCellText = await claimRows
        .first()
        .locator("td")
        .first()
        .innerText();
      expect(firstCellText.trim().length).toBeGreaterThan(0);

      // ── Actor 1 – Logout ──────────────────────────────────────────────────
      // authenticated.pug l.29: a(href='/logout') "log out"
      // server.js l.133: destroys session → res.redirect("/")
      await devicePage.getByRole("link", { name: /log out/i }).click();
      await devicePage.waitForURL(`${APP_URL}/`, { timeout: 15_000 });
      await expect(devicePage).toHaveURL(`${APP_URL}/`);
    }
  );
});
