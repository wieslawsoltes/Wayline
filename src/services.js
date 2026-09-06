import { clamp, distance } from './core.js';
export const PLACES = [
    { id: 'golden-gate', name: 'Golden Gate Bridge', subtitle: 'An icon at the edge of the Pacific', category: 'Things to do', coord: [-122.4783, 37.8199], icon: 'camera', color: '#bd6a45', description: 'A classic San Francisco discovery. Add this landmark to a collection, plan a drive, or make a map of your own.', tags: ['Landmark', 'Bay views'], area: 'Golden Gate' },
    { id: 'palace', name: 'Palace of Fine Arts', subtitle: 'A quieter kind of monumental', category: 'Things to do', coord: [-122.4484, 37.8028], icon: 'camera', color: '#a576bd', description: 'A curated landmark in the Marina District. Explore the surroundings and collect your favorite corners of the city.', tags: ['Architecture', 'Marina District'], area: 'Marina District' },
    { id: 'ferry', name: 'Ferry Building', subtitle: 'Meet me by the waterfront', category: 'Things to do', coord: [-122.3937, 37.7955], icon: 'camera', color: '#b87a45', description: 'A waterfront landmark and a starting point for a day around the Embarcadero. This is a curated sample place, not a live business listing.', tags: ['Waterfront', 'Landmark'], area: 'Embarcadero' },
    { id: 'park', name: 'Golden Gate Park', subtitle: 'A little more green in your day', category: 'Parks', coord: [-122.4769, 37.7694], icon: 'tree', color: '#4b8853', description: 'Add an outdoor stop to your personal map. Draw a route, mark a meeting point, or measure your next adventure.', tags: ['Green space', 'Outdoors'], area: 'Golden Gate Park' },
    { id: 'dolores', name: 'Mission Dolores Park', subtitle: 'Find your patch of green', category: 'Parks', coord: [-122.4269, 37.7596], icon: 'tree', color: '#4b8853', description: 'A curated park location for exploring and map-making. No live conditions or opening hours are provided.', tags: ['Park', 'Mission District'], area: 'Mission District' },
    { id: 'coit', name: 'Coit Tower', subtitle: 'A different perspective', category: 'Things to do', coord: [-122.4058, 37.8024], icon: 'camera', color: '#a576bd', description: 'A landmark on Telegraph Hill. Save it to a collection or create an annotation for your next visit.', tags: ['Landmark', 'Telegraph Hill'], area: 'Telegraph Hill' },
    { id: 'lands-end', name: 'Lands End', subtitle: 'Where the city meets the ocean', category: 'Parks', coord: [-122.5055, 37.7811], icon: 'tree', color: '#4b8853', description: 'A sample outdoor destination at the western edge of the city. Add your own notes and points of interest.', tags: ['Coast', 'Outdoors'], area: 'Outer Richmond' },
    { id: 'alamo', name: 'Alamo Square', subtitle: 'A postcard kind of afternoon', category: 'Parks', coord: [-122.4346, 37.7764], icon: 'tree', color: '#4b8853', description: 'A curated place in the heart of the city. Explore and build your own map around it.', tags: ['Park', 'Neighborhood'], area: 'Western Addition' },
    { id: 'sample-coffee', name: 'Daybreak Coffee', subtitle: 'Illustrative café · not a real listing', category: 'Coffee', coord: [-122.4327, 37.7908], icon: 'coffee', color: '#b97637', sample: true, description: 'This fictional café demonstrates category filtering, place details, saved lists, and directions. Search online for real businesses.', tags: ['Sample place', 'Café'], area: 'Demo' },
    { id: 'sample-coffee-2', name: 'Fieldwork Roasters', subtitle: 'Illustrative café · not a real listing', category: 'Coffee', coord: [-122.4152, 37.7987], icon: 'coffee', color: '#b97637', sample: true, description: 'This is a fictional sample café. It is included to demonstrate Wayline’s place interface, not as a business recommendation.', tags: ['Sample place', 'Coffee'], area: 'Demo' },
    { id: 'sample-food', name: 'The North Beach Table', subtitle: 'Illustrative restaurant · not a real listing', category: 'Restaurants', coord: [-122.4077, 37.8008], icon: 'restaurant', color: '#d77939', sample: true, description: 'An illustrative restaurant listing. There are no real reviews, availability, or opening hours attached to this sample.', tags: ['Sample place', 'Dining'], area: 'Demo' },
    { id: 'sample-hotel', name: 'Pacific House', subtitle: 'Illustrative hotel · not a real listing', category: 'Hotels', coord: [-122.4168, 37.7868], icon: 'hotel', color: '#8760b5', sample: true, description: 'A fictional hotel for demonstrating category filters and saved places. No bookings are available.', tags: ['Sample place', 'Stay'], area: 'Demo' }
];
export const CITY_PRESETS = [{ name: 'San Francisco', coord: [-122.435, 37.785], zoom: 13.65 }, { name: 'New York', coord: [-73.9855, 40.7484], zoom: 13 }, { name: 'London', coord: [-.1276, 51.5074], zoom: 13 }, { name: 'Paris', coord: [2.3522, 48.8566], zoom: 13 }, { name: 'Tokyo', coord: [139.7671, 35.6812], zoom: 13 }, { name: 'Warsaw', coord: [21.0122, 52.2297], zoom: 13 }, { name: 'Gliwice', coord: [18.6714, 50.2945], zoom: 14 }];
export class Services {
    constructor(config = {}) { this.geocodeURL = config.geocodeURL || 'https://nominatim.openstreetmap.org/search'; this.routeURL = config.routeURL || 'https://router.project-osrm.org/route/v1/driving'; this.queue = Promise.resolve(); this.routeController = null; try {
        this.cache = JSON.parse(localStorage.getItem('wayline.search-cache') || '{}');
    }
    catch {
        this.cache = {};
    } }
    search(query) {
        query = query.trim();
        if (query.length < 2)
            return Promise.resolve([]);
        const key = query.toLowerCase();
        if (this.cache[key])
            return Promise.resolve(this.cache[key]);
        const run = async () => {
            const execute = async () => {
                let last = 0;
                try {
                    last = Number(localStorage.getItem('wayline.geocode-last') || 0);
                }
                catch { }
                const wait = Math.max(0, last + 1100 - Date.now());
                if (wait)
                    await new Promise(r => setTimeout(r, wait));
                try {
                    localStorage.setItem('wayline.geocode-last', String(Date.now()));
                }
                catch { }
                const url = new URL(this.geocodeURL);
                url.searchParams.set('q', query);
                url.searchParams.set('format', 'jsonv2');
                url.searchParams.set('limit', '8');
                url.searchParams.set('addressdetails', '1');
                const signal = AbortSignal.timeout(12000);
                const r = await fetch(url, { signal, credentials: 'omit' });
                if (!r.ok)
                    throw new Error(`Place search returned HTTP ${r.status}.`);
                const data = await r.json();
                if (!Array.isArray(data))
                    throw new Error('Invalid geocoder response.');
                const results = data.filter(p => Number.isFinite(+p.lon) && Number.isFinite(+p.lat)).map(p => ({ id: `osm-${p.osm_type}-${p.osm_id}`, name: p.name || p.display_name.split(',')[0], subtitle: p.display_name, category: p.type || 'Place', coord: [+p.lon, +p.lat], icon: 'pin', color: '#4285f4', source: 'OpenStreetMap', description: p.display_name, tags: [p.type || 'Place', 'OpenStreetMap'], area: p.address?.city || p.address?.town || '' }));
                this.cache[key] = results;
                const keys = Object.keys(this.cache);
                if (keys.length > 80)
                    delete this.cache[keys[0]];
                try {
                    localStorage.setItem('wayline.search-cache', JSON.stringify(this.cache));
                }
                catch { }
                return results;
            };
            return navigator.locks ? navigator.locks.request('wayline-geocoding', execute) : execute();
        };
        const p = this.queue.then(run, run);
        this.queue = p.catch(() => { });
        return p;
    }
    async route(a, b) { this.routeController?.abort(); const c = this.routeController = new AbortController(), timer = setTimeout(() => c.abort(), 18000); try {
        const url = `${this.routeURL.replace(/\/$/, '')}/${a.join(',')};${b.join(',')}?overview=full&geometries=geojson&steps=true&alternatives=true`;
        const r = await fetch(url, { signal: c.signal, credentials: 'omit' });
        if (!r.ok)
            throw new Error(`Routing service returned HTTP ${r.status}.`);
        const result = await r.json();
        if (result.code !== 'Ok' || !result.routes?.length)
            throw new Error('No drivable route was found.');
        return result.routes.map((r, i) => ({ id: i, coordinates: r.geometry.coordinates, distance: r.distance, duration: r.duration, steps: r.legs.flatMap(l => l.steps || []), source: 'OSRM', summary: r.legs.map(l => l.summary).filter(Boolean).join(', ') }));
    }
    finally {
        clearTimeout(timer);
    } }
}
