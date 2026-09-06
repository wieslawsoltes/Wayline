# GitHub Pages deployment

Site: https://wieslawsoltes.github.io/Wayline/

## Continuous deployment

`.github/workflows/pages.yml` builds and tests every push to `main` and every pull request. Main-branch pushes and manual runs from `main` deploy the validated artifact using GitHub's official Pages actions. Pull requests validate without publishing.

The workflow:

1. Rebuilds `index.html` from `src/` and verifies that the committed standalone build is up to date.
2. Runs the 12 core checks and 19 deterministic browser checks.
3. Saves browser reports and screenshots as workflow artifacts.
4. Packages only `index.html`, the sample GeoJSON overlay, and `.nojekyll` for the public site.
5. Deploys the artifact with `actions/deploy-pages` to the `github-pages` environment.
6. Downloads the live HTML and checks that its SHA256 matches the tested build.

No personal access token or third-party hosting is required. The build job has read-only repository access. The deployment job requests `pages: write` and `id-token: write`; it does not need repository-content write access or change repository administration settings.

The `gh-pages` branch contains the initial standalone snapshot. Continuous deployment uses the validated Actions artifact, not that branch.

## Repository settings

For a new fork, enable **Settings -> Pages -> Build and deployment -> Source -> GitHub Actions**, then run **Actions -> Deploy Wayline to GitHub Pages -> Run workflow** from `main`. The `github-pages` environment must allow deployment from `main`.

Edit `src/`, then run `python3 build.py` before committing so `index.html` remains in sync. Subsequent pushes to `main` are tested and deployed automatically.

Official reference: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## Runtime behavior

The default map is original illustrative artwork, not accurate navigation data. Use the Layers panel for live streets and Settings to configure map, geocoding, and routing providers. Provider availability, CORS, quotas, and attribution policies apply. Do not expose secret provider credentials in this static client.

HTTPS allows supported browsers to offer WebGPU and permission-gated geolocation. A compatible GPU and browser are still required; the renderer badge reports the actual backend. Canvas 2D is the fallback. Deterministic browser checks validate that fallback and fixture-backed provider responses, not physical GPS navigation or hardware WebGPU.
