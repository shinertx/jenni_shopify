# JENNi Edge Demo

Minimal end-to-end demo: a one-file overlay client (`edge.js`) and a mock API server with `/resolve`, `/fingerprint`, `/match`, `/inventory`, `/export`, `/test-order`.

## Run
- npm script: `npm run edge:demo`
- Server: http://localhost:3100
- Demo page: http://localhost:3100/

## Files
- `edge.js` — overlay script; calls `/resolve` and renders a bottom bar
- `index.html` — fake PDP that loads `edge.js`
- `server.cjs` — Express server with mock endpoints
- `gtm_custom_html_tag.html` — GTM Custom HTML tag body
- `bookmarklet.js` — injects the overlay on any page

## Usage
- Local page: open http://localhost:3100 and see the overlay populate
- Bookmarklet: save the content of `bookmarklet.js` as a bookmark; click on any PDP
- GTM: paste `gtm_custom_html_tag.html` into a Custom HTML tag; add a PDP trigger

## Notes
- This demo returns deterministic mock data based on ZIP code prefix.
- For a CDN deploy: host `edge.js` and point `JENNI_EDGE_SRC` to that URL.
- To target a remote API base, set `window.JENNI_API_BASE` in GTM snippet.

