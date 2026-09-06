# GitHub Pages deployment

The Pages workflow tests the source, builds the standalone `index.html`, and deploys only the static site artifact. Pushes to `main` redeploy; pull requests run validation without publishing. A manual workflow dispatch is also available.

## One-time repository setup

In **Settings -> Pages -> Build and deployment**, set **Source** to **GitHub Actions**. If Pages is not enabled, ordinary workflow tokens cannot create the Pages site because that operation also requires repository administration permission. The GitHub connection used to import this project does not expose a Pages settings action.

After enabling Pages, run **Actions -> Deploy Wayline to GitHub Pages -> Run workflow** (or re-run a failed deployment).

Expected site: https://wieslawsoltes.github.io/Wayline/

## Runtime behavior

The default map is original illustrative artwork, not accurate navigation data. Use the Layers panel for live streets and Settings to configure map, geocoding, and routing providers. Provider availability, CORS, quotas, and attribution policies apply. Do not expose secret provider credentials in this static client.

HTTPS allows supported browsers to offer WebGPU and permission-gated geolocation. A compatible GPU and browser are still required; the renderer badge reports the actual backend. Canvas 2D is the fallback. The local deterministic browser checks validate that fallback and fixture-backed provider responses, not real GPS navigation or hardware WebGPU.
