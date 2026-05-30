/**
 * Onbehalf popup — Phase 2 scaffold.
 *
 * On open:
 *   1. Ask background for the user's auth state (WHOAMI hits
 *      /api/extension/whoami on the server)
 *   2. Show signed-in or signed-out state
 *   3. If signed-in, ask the current tab's content script whether
 *      it looks like a job application form
 *
 * Both endpoints will be built in Phase 4. For now the popup
 * gracefully degrades when they 404.
 */

const $ = (id) => document.getElementById(id);

function show(state) {
  for (const s of ["state-loading", "state-signed-out", "state-signed-in"]) {
    $(s).classList.toggle("hidden", s !== state);
  }
}

async function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => resolve(resp ?? { ok: false }));
  });
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function init() {
  show("state-loading");

  const who = await send({ type: "WHOAMI" });
  // Server endpoint isn't built yet — treat 404 the same as signed-out
  // for now so the popup is usable in Phase 2.
  const isSignedIn = who?.ok && who.body?.signedIn === true;
  const email = who?.body?.email;

  if (!isSignedIn) {
    show("state-signed-out");
    $("open-sign-in").onclick = () => send({ type: "OPEN_SIGN_IN" });
    return;
  }

  $("account-email").textContent = email ?? "signed in";

  const tab = await getActiveTab();
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "PING" }, (resp) => {
      if (chrome.runtime.lastError || !resp) {
        $("page-status").textContent = "Not on a supported form";
      } else if (resp.looksLikeForm) {
        $("page-status").textContent = `${resp.title.slice(0, 60)} · ready`;
      } else {
        $("page-status").textContent = "Greenhouse page (no form here)";
      }
    });
  }

  $("open-dashboard").onclick = async () => {
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find((t) => t.url?.includes("onbehalfai.vercel.app"));
    if (existing) {
      chrome.tabs.update(existing.id, { active: true });
    } else {
      chrome.tabs.create({ url: "https://onbehalfai.vercel.app/dashboard" });
    }
  };

  show("state-signed-in");
}

init();
