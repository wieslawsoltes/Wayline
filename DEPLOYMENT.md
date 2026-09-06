# GitHub Pages deployment

Site: https://wieslawsoltes.github.io/Wayline/

## Publishing configuration

GitHub Pages is enabled for this repository with **Deploy from a branch**, branch **gh-pages**, directory **/(root)**. The publishing branch contains only the standalone application, the sample overlay, and `.nojekyll`. Editable source, documentation, and tests remain on `main`.

`.github/workflows/pages.yml` runs on pushes to `main`, pull requests, and manual workflow dispatch. It rebuilds the standalone HTML, checks that the committed build is current, runs the 12 core checks and 19 deterministic browser checks, and saves screenshots and reports as artifacts. Pull requests validate without publishing.

After a successful main-branch build, the workflow copies the validated static artifact to `gh-pages`. It explicitly requests a GitHub Pages build through the Pages REST API because pushes made with the standard `GITHUB_TOKEN` do not trigger Pages builds automatically. It waits for that exact publishing commit to build, then downloads the live page and compares it byte-for-byte against the validated artifact. No personal access token or third-party hosting service is required.

The build job has read-only repository access. The publishing job requests only `contents: write` and `pages: write`. It does not change repository administration settings.

## Running a deployment

Push to `main`, or use **Actions -> Deploy Wayline to GitHub Pages -> Run workflow**. Edit `src/`, then run `python3 build.py` before committing so `index.html` remains in sync.

For a new fork, create its `gh-pages` publishing branch and choose **Settings -> Pages -> Deploy from a branch -> gh-pages -> /(root)**. Keep that source setting for this branch-based workflow; do not switch it to the custom GitHub Actions source option.

References:
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build

## Runtime behavior

The default map is original illustrative artwork, not accurate navigation data. Use the Layers panel for live streets and Settings to configure map, geocoding, and routing providers. Provider availability, CORS, quotas, and attribution policies apply. Do not expose secret provider credentials in this static client.

HTTPS allows supported browsers to offer WebGPU and permission-gated geolocation. A compatible GPU and browser are still required; the renderer badge reports the actual backend. Canvas 2D is the fallback. Deterministic browser checks validate that fallback and fixture-backed provider responses, not physical GPS navigation or hardware WebGPU.
