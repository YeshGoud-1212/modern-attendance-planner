/**
 * Runs in the page's MAIN world so it can observe the portal's own fetch/XHR calls.
 * It cannot use chrome.* APIs; it only forwards captured attendance responses.
 */

(() => {
  if (window.__attenTrackPortalCaptureInstalled) return;
  window.__attenTrackPortalCaptureInstalled = true;

  const eventName = "ATTEN_TRACK_PORTAL_ATTENDANCE";
  const messageSource = "ATTEN_TRACK_PORTAL_CAPTURE";
  const isAttendanceUrl = (url) => /GetStdAttPer/i.test(String(url || ""));

  function emitAttendance(url, body) {
    if (!isAttendanceUrl(url) || !body) return;

    const payload = {
      source: messageSource,
      type: eventName,
      url: String(url),
      body: String(body)
    };

    window.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
    window.postMessage(payload, "*");
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = async function(...args) {
      const response = await originalFetch.apply(this, args);

      try {
        const input = args[0];
        const url = typeof input === "string" ? input : input?.url;
        if (isAttendanceUrl(url)) {
          response.clone().text().then((body) => emitAttendance(url, body)).catch(() => {});
        }
      } catch (error) {
        console.warn("[Atten-Track Capture] fetch capture failed", error);
      }

      return response;
    };
  }

  const xhrProto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (xhrProto && !xhrProto.__attenTrackPortalCapturePatched) {
    xhrProto.__attenTrackPortalCapturePatched = true;

    const originalOpen = xhrProto.open;
    const originalSend = xhrProto.send;

    xhrProto.open = function(method, url, ...rest) {
      this.__attenTrackRequestUrl = url;
      return originalOpen.call(this, method, url, ...rest);
    };

    xhrProto.send = function(...args) {
      this.addEventListener("load", function() {
        try {
          if (isAttendanceUrl(this.__attenTrackRequestUrl)) {
            emitAttendance(this.__attenTrackRequestUrl, this.responseText);
          }
        } catch (error) {
          console.warn("[Atten-Track Capture] XHR capture failed", error);
        }
      });

      return originalSend.apply(this, args);
    };
  }
})();
