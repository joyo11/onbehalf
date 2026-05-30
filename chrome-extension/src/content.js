/**
 * Onbehalf — content script (Phase 2 stub).
 *
 * Runs on every Greenhouse-hosted application page (boards.greenhouse.io,
 * job-boards.greenhouse.io, *.greenhouse.io). For now this is a
 * heartbeat — confirms the extension is loaded on the right page and
 * exposes a single command the popup can fire ("am I on a job form?").
 *
 * Phase 3 will load the ported fill logic from
 * src/fill/greenhouse.js and wire it to background-script messages.
 */

const ONBEHALF_MARKER = "__onbehalf_content_script_loaded__";

if (!window[ONBEHALF_MARKER]) {
  window[ONBEHALF_MARKER] = true;

  // Quick check: does this page look like a Greenhouse application form?
  function looksLikeJobForm() {
    // Direct markers
    if (document.querySelector("input[type='file'][name*='resume' i]")) return true;
    if (document.querySelector("input[name='first_name']")) return true;
    // React-mounted Greenhouse forms have this portal root
    if (document.querySelector("#react-portal-mount-point")) return true;
    return false;
  }

  // Console breadcrumb so devs can confirm the extension loaded
  // without having to open the popup.
  // eslint-disable-next-line no-console
  console.log("[Onbehalf] content script loaded — form detected:", looksLikeJobForm());

  // Respond to background pings.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "PING") {
      sendResponse({
        loaded: true,
        url: location.href,
        title: document.title,
        looksLikeForm: looksLikeJobForm(),
      });
      return false;
    }
    return false;
  });
}
