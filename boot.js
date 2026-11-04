// Runs before the main panel script. If that script fails to load (a missing or old file
// after an update, for example), the buttons would do nothing. This shows a plain notice
// instead so you know to reload the extension.
(function () {
  let firstError = "";
  window.addEventListener("error", (e) => { if (!firstError) firstError = e.message || (e.target && e.target.src ? `Couldn't load ${e.target.src}` : ""); }, true);
  window.addEventListener("unhandledrejection", (e) => { if (!firstError) firstError = (e.reason && e.reason.message) || String(e.reason); });
  setTimeout(() => {
    if (window.__panelReady) return;
    const box = document.getElementById("boot-fail");
    if (!box) return;
    if (firstError) document.getElementById("boot-detail").textContent = `Details: ${firstError}`;
    box.hidden = false;
  }, 4000);
})();
