/**
 * New tab page.
 *
 * Chrome only accepts a packaged extension page for `chrome_url_overrides`,
 * so this page exists purely to hand off to the workspace. `location.replace`
 * is used rather than assignment so the override never becomes a back-button
 * step between the previous page and the workspace.
 */

import { DEFAULT_APP_URL } from "./shared.js";

const manual = document.getElementById("manual");
if (manual) manual.href = DEFAULT_APP_URL;

// If the workspace is unreachable (dev server down, wrong origin configured)
// the navigation fails silently and this page just sits there — so surface a
// manual link instead of an unexplained blank screen.
const stallTimer = setTimeout(() => {
  document.body.classList.add("stalled");
}, 2500);

window.addEventListener("pagehide", () => clearTimeout(stallTimer));

location.replace(DEFAULT_APP_URL);
