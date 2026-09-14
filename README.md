# NS IPTV 1.2.8

Web IPTV player with swipe navigation and HTTPS/CORS proxy playback support.

## Playback
- GitHub Pages HTTPS is supported through the configured Cloudflare Worker proxy.
- Initial HTTP/HTTPS channel URLs are proxied automatically.
- HLS `.m3u8` playlists are rewritten by the Worker so variants, segments, keys and maps continue through the proxy.
- HLS is always played with hls.js through the Cloudflare Worker proxy; native HLS is disabled.

Configured proxy:
`https://ns-iptv-proxy.shoyshobn.workers.dev/?url=`

If a particular channel still fails, the upstream provider may block the Worker or require provider-specific headers; that cannot be guaranteed by a generic proxy.
