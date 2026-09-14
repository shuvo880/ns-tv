# NS IPTV Web deployment

## GitHub Pages + proxy

GitHub Pages is static and cannot proxy IPTV streams by itself. This project now includes `proxy-worker/worker.js`, an HTTPS/CORS proxy for Cloudflare Workers.

### Setup

1. Deploy `proxy-worker/worker.js` as a Cloudflare Worker.
2. Copy the Worker HTTPS URL.
3. Open `app.js` and set `PROXY_BASE` to the Worker URL ending in `?url=`.
4. Upload the project to GitHub Pages.

Example:

```js
const PROXY_BASE='https://ns-iptv-proxy.shoyshobhn.workers.dev/?url=';
```

With the proxy enabled, the app sends playlist and stream requests through the Worker, including HTTP upstreams from an HTTPS GitHub Pages site. HLS manifests are rewritten so variants, segments, keys and maps also use the proxy.

### What this fixes

- HTTP stream on an HTTPS GitHub Pages site (mixed-content problem)
- Missing CORS headers on many HLS/media endpoints
- Relative HLS segment/variant URLs that otherwise point back to the upstream server
- Endless `Connecting…` when browser access fails

### What it cannot fix

A proxy cannot make an upstream stream work when the upstream is offline, requires unsupported authentication, uses DRM, or otherwise refuses the request. Use the proxy only for streams you are authorized to access.
