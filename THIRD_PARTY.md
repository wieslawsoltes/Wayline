# Data, services, attribution, and rights

## Original material

The application code, inline icons, bridge illustration, and illustrative reference
map are original material distributed under the accompanying MIT license. The
reference map is approximate illustrative artwork, not an OpenStreetMap extract.
It is not for navigation. No Google map assets, Google SDK, Google business
ratings/reviews, remote font files, or third-party JavaScript are bundled.

The interface is independently implemented and inspired by common map application
interaction patterns. Wayline is not affiliated with or endorsed by Google.
A name/trademark clearance search is not part of this implementation.

## Live OpenStreetMap tiles

Default URL: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`.
Map data is credited to OpenStreetMap contributors; its data license and tile
service conditions are separate from the app's MIT license.

- Copyright and license: https://www.openstreetmap.org/copyright
- Tile usage policy: https://operations.osmfoundation.org/policies/tiles/

The implementation uses visible-viewport requests, ordinary browser HTTP caching,
limited concurrency, no bulk download or offline prefetch, and visible attribution.
It does not strip the browser's default referrer. Public tile service capacity is
limited and availability is not guaranteed. A technical implementation is not an
independent authorization to use a service at arbitrary scale. Review current
policy and use an appropriately provisioned provider for production.

Custom providers must support 256×256 XYZ raster tiles and CORS. Configure the
provider's required attribution; it appears on the map and in PNG snapshots.
Additional terms, attribution links, logos, authentication requirements, or export
restrictions may require corresponding code changes. A free-text attribution field
cannot automatically satisfy every provider's license contract.

## Nominatim-compatible geocoding

Default URL: `https://nominatim.openstreetmap.org/search`.

Policy: https://operations.osmfoundation.org/policies/nominatim/

Search is explicitly requested, not a server autocomplete. Requests are serialized,
spaced by at least 1.1 seconds locally, and cached. Browser-local throttling does
not enforce aggregate usage across all application visitors. Use a provisioned
provider, self-hosted deployment, or central policy-enforcing backend as required.
Search results derived from OpenStreetMap retain applicable data obligations.

## OSRM-compatible routing

Default URL: `https://router.project-osrm.org/route/v1/driving`.

- Project: https://project-osrm.org/
- API reference: https://project-osrm.org/docs/v26.4.0/http/
- Source/project documentation: https://github.com/Project-OSRM/osrm-backend

OSRM server software is not bundled. The public endpoint is a demonstration service,
not a purchased availability or capacity commitment. Returned routes depend on the
server's network dataset and driving profile. Route durations do not include live
traffic. Confirm the service's current usage terms before deployment and supply
your own compatible endpoint when appropriate.

## Privacy and credentials

Live tiles expose the requested map area to their provider. Online geocoding sends
search text. Routing sends route endpoints. Provider URLs and any client credentials
in them are visible to browser users. Never put a server secret in these settings.
The app itself has no analytics endpoint or account server.

All listed policies and external service behavior can change. These notes document
the implementation choices and reference sources, not legal advice or a guarantee
of continued free service. The MIT license applies to original app material only.
