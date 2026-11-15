/*
 * Shared analytics profile: thumbmarkjs-1.11.0-v1.
 * Keep this file and the vendored library identical across all sites.
 * rough_id is a session property, not a verified user / Distinct ID.
 */
(() => {
  const umami = window.umami;
  if (typeof umami?.identify !== 'function' || window.__umamiThumbmarkStarted) {
    return;
  }

  // Resolve against this script so nested routes and asset base paths work.
  const libraryUrl = new URL('thumbmark-1.11.0.umd.js', document.currentScript.src);
  window.__umamiThumbmarkStarted = true;

  const start = () => {
    const script = document.createElement('script');
    script.src = libraryUrl.href;
    script.async = true;
    script.onload = async () => {
      try {
        const client = new window.ThumbmarkJS.Thumbmark({
          logging: false,
          exclude: ['permissions'],
          stabilize: ['private', 'iframe'],
        });
        const { thumbmark } = await client.get();
        if (typeof thumbmark !== 'string' || !thumbmark) return;

        await umami.identify({
          rough_id: thumbmark,
          rough_id_version: 'thumbmarkjs-1.11.0-v1',
        });
      } catch {
        // Optional analytics must not interrupt the page if either library fails.
      }
    };
    script.onerror = () => {
      // A blocked or unavailable library must not interrupt the page.
    };
    document.head.appendChild(script);
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(start, { timeout: 1500 });
  } else {
    window.setTimeout(start, 0);
  }
})();
