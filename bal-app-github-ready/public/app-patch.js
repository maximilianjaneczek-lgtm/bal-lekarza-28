// Patch to normalize absolute paths so the app works when hosted in a subpath
(function () {
  // keep original fetch
  const _fetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    try {
      if (typeof input === "string") {
        // Skip protocol-relative or full URLs
        if (/^\/\//.test(input) || /^https?:\/\//.test(input)) {
          return _fetch(input, init);
        }
        // If path starts with a leading slash, remove it so fetch is relative to current base path
        if (input.startsWith("/")) {
          input = input.replace(/^\//, "");
        }
      } else if (input instanceof Request) {
        const url = new URL(input.url, location.href);
        if (url.origin === location.origin && url.pathname.startsWith("/")) {
          const newUrl = input.url.replace(/^\//, "");
          input = new Request(newUrl, input);
        }
      }
    } catch (e) {
      // ignore
    }
    return _fetch(input, init);
  };

  // Patch service worker registration to accept relative path if provided with leading slash
  try {
    if (navigator && navigator.serviceWorker) {
      const origRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
      navigator.serviceWorker.register = function (scriptURL, options) {
        try {
          if (typeof scriptURL === "string" && scriptURL.startsWith("/")) scriptURL = scriptURL.slice(1);
        } catch (e) {}
        return origRegister(scriptURL, options);
      };
    }
  } catch (e) {}

  console.log("App patch loaded: normalized fetch + serviceWorker.register for subpath hosting");
})();
