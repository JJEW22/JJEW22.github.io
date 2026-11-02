// src/lib/server/mapsLink.ts
// Turning a pasted Google Maps link into as much of a swim spot as it can give.
//
// The coordinates (and usually the name) are in the link itself, once it is the
// long form. A phone's Share button gives a short maps.app.goo.gl link instead,
// which only says where it redirects to -- so that redirect is read here, on the
// server, because a browser can't see another site's redirects.
//
// Country and region aren't in any Google link. They come from reverse
// geocoding the coordinates with OpenStreetMap's Nominatim, which is free, needs
// no key, and asks only for an identifying User-Agent and about a request a
// second -- far more than one person filling in a form will ever send.
//
// Nothing here fetches a URL the user typed. A short link is only followed when
// its host is one of Google's short-link hosts, and only the Location header of
// each hop is read; the long maps URL at the end is parsed, never fetched.

const SITE = 'https://johnjackwilkins.com';
const UA = `johnjackwilkins.com meSoup spot lookup (contact ${SITE})`;
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl']);
const MAX_HOPS = 5;

export class MapsLinkError extends Error {
	status: number;
	constructor(message: string, status = 400) {
		super(message);
		this.status = status;
	}
}

export interface PlaceGuess {
	lat: number;
	lon: number;
	name: string | null;
	country: string | null;
	region: string | null;
	waterType: string | null;
	// The link only had a place name or address, so the coordinates are
	// OpenStreetMap's idea of where that is rather than Google's pin.
	approximate: boolean;
}

// What a maps URL says on its own: coordinates, a name, or text to look up.
interface Parsed {
	lat: number | null;
	lon: number | null;
	name: string | null;
	query: string | null;
}

const COORDS = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

function coords(lat: number, lon: number): { lat: number; lon: number } | null {
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
	if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
	return { lat, lon };
}

// '42.439, -71.335' -> numbers; anything else -> null.
function coordText(s: string | null): { lat: number; lon: number } | null {
	const m = s?.match(COORDS);
	return m ? coords(Number(m[1]), Number(m[2])) : null;
}

// Google writes a dropped pin's "name" as its coordinates in DMS; that isn't a name.
function looksLikeCoords(s: string): boolean {
	return /^[\d\s.,°'′"″+-]+[NSEW]?[\s\d.,°'′"″+-]*[NSEW]?$/i.test(s) || coordText(s) !== null;
}

function decode(segment: string): string {
	try {
		return decodeURIComponent(segment.replace(/\+/g, ' ')).trim();
	} catch {
		return segment.replace(/\+/g, ' ').trim();
	}
}

export function parseMapsUrl(url: URL): Parsed {
	const out: Parsed = { lat: null, lon: null, name: null, query: null };
	const full = decode(url.pathname) + url.search;

	// The place's own pin, inside the data= blob: !3d<lat>!4d<lon>. More exact
	// than the @ viewport, which is wherever the map happened to be centred.
	const pins = [...full.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
	const pin = pins.length ? pins[pins.length - 1] : null;
	const at = full.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
	const found =
		(pin && coords(Number(pin[1]), Number(pin[2]))) ||
		(at && coords(Number(at[1]), Number(at[2]))) ||
		null;
	if (found) ({ lat: out.lat, lon: out.lon } = found);

	// /maps/place/Walden+Pond/@... or /maps/search/Walden+Pond/...
	const named = url.pathname.match(/\/maps\/(?:place|search)\/([^/]+)/);
	if (named) {
		const name = decode(named[1]);
		if (name && !looksLikeCoords(name)) out.name = name.split(',')[0].trim();
		if (name && out.lat === null) {
			const c = coordText(name);
			if (c) ({ lat: out.lat, lon: out.lon } = c);
			else out.query = name;
		}
	}

	// ?q=, ?query= (the Maps URLs API), ?ll=, ?center=, ?destination=, ?daddr=
	for (const key of ['q', 'query', 'll', 'center', 'destination', 'daddr']) {
		const v = url.searchParams.get(key);
		if (!v) continue;
		const c = coordText(v.replace(/^loc:/, ''));
		if (c) {
			if (out.lat === null) ({ lat: out.lat, lon: out.lon } = c);
		} else if (!out.query) {
			out.query = v.trim();
			if (!out.name && !looksLikeCoords(v)) out.name = v.split(',')[0].trim();
		}
	}
	return out;
}

function toUrl(link: string): URL {
	const text = link.trim();
	try {
		return new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
	} catch {
		throw new MapsLinkError("That doesn't look like a link.");
	}
}

function isGoogleMaps(url: URL): boolean {
	const host = url.hostname.toLowerCase();
	const google = /(^|\.)google\.[a-z.]+$/.test(host);
	return (
		(google && (host.startsWith('maps.') || url.pathname.startsWith('/maps'))) ||
		host === 'maps.google.com'
	);
}

// Follow a short link to the long URL it stands for, reading only redirects.
async function expand(url: URL): Promise<URL> {
	let current = url;
	for (let hop = 0; hop < MAX_HOPS && SHORT_HOSTS.has(current.hostname.toLowerCase()); hop++) {
		const res = await fetch(current, {
			redirect: 'manual',
			headers: { 'user-agent': UA },
			signal: AbortSignal.timeout(8_000)
		}).catch(() => null);
		const next = res?.headers.get('location');
		if (!res || res.status < 300 || res.status >= 400 || !next) {
			throw new MapsLinkError(
				"Couldn't open that short link. Try the full link from a browser.",
				502
			);
		}
		current = new URL(next, current);
	}
	// Some regions bounce through a cookie-consent page that carries the real
	// URL along in ?continue=.
	if (current.hostname.startsWith('consent.')) {
		const cont = current.searchParams.get('continue');
		if (cont) current = new URL(cont);
	}
	return current;
}

interface NominatimPlace {
	lat: string;
	lon: string;
	name?: string;
	category?: string;
	type?: string;
	extratags?: Record<string, string> | null;
	address?: Record<string, string>;
}

async function nominatim(path: string, params: Record<string, string>) {
	const url = new URL(path, NOMINATIM);
	for (const [k, v] of Object.entries({ format: 'jsonv2', 'accept-language': 'en', ...params })) {
		url.searchParams.set(k, v);
	}
	const res = await fetch(url, {
		headers: { 'user-agent': UA, accept: 'application/json' },
		signal: AbortSignal.timeout(8_000)
	}).catch(() => null);
	if (!res?.ok) return null;
	return res.json().catch(() => null);
}

// The OpenStreetMap tags that say what kind of water a place is, as one of
// the map's built-in types. Bays, beaches and coastlines are left alone: from
// the tags alone a bay could be the sea, the ocean or a big lake.
function guessWaterType(place: NominatimPlace | null): string | null {
	if (!place) return null;
	const { category, type } = place;
	const water = place.extratags?.water;
	if (type === 'swimming_pool' || type === 'water_park') return 'pool';
	if (place.extratags?.sport === 'swimming' && category === 'leisure') return 'pool';
	if (type === 'spring' || type === 'hot_spring' || water === 'spring') return 'spring';
	if (type === 'quarry' || water === 'quarry') return 'quarry';
	if (category === 'waterway' && ['river', 'stream', 'canal'].includes(type ?? '')) return 'river';
	if (water === 'river' || water === 'canal' || water === 'stream') return 'river';
	if (water === 'pond') return 'pond';
	if (water === 'lake' || water === 'reservoir' || water === 'oxbow') return 'lake';
	if (type === 'sea' || place.extratags?.place === 'sea') return 'sea';
	if (type === 'ocean' || place.extratags?.place === 'ocean') return 'ocean';
	return null;
}

// The region the way the map already records it: a US state for US swims, the
// town or island for everywhere else (Venice, Reykjavik, Tubuai).
function regionOf(address: Record<string, string>): string | null {
	if (address.country_code === 'us') return address.state ?? null;
	return (
		address.city ??
		address.town ??
		address.village ??
		address.island ??
		address.municipality ??
		address.county ??
		address.state ??
		null
	);
}

export async function lookUpMapsLink(link: string): Promise<PlaceGuess> {
	// A plain "42.439, -71.335" pasted from Maps' right-click menu works too.
	const typed = coordText(link);
	let parsed: Parsed;
	if (typed) {
		parsed = { ...typed, name: null, query: null };
	} else {
		const url = await expand(toUrl(link));
		if (!isGoogleMaps(url)) throw new MapsLinkError("That isn't a Google Maps link.");
		parsed = parseMapsUrl(url);
	}

	let approximate = false;
	if (parsed.lat === null || parsed.lon === null) {
		if (!parsed.query) {
			throw new MapsLinkError(
				"Couldn't find a location in that link. Try sharing the place again."
			);
		}
		const hits = (await nominatim('/search', { q: parsed.query, limit: '1' })) as
			| NominatimPlace[]
			| null;
		const hit = hits?.[0];
		if (!hit) throw new MapsLinkError(`Couldn't find "${parsed.query}" on the map.`);
		parsed.lat = Number(hit.lat);
		parsed.lon = Number(hit.lon);
		approximate = true;
	}

	// Zoomed right in, so a pin on a pool or a pond comes back as that pool or
	// pond and its tags can say what kind of water it is.
	const place = (await nominatim('/reverse', {
		lat: String(parsed.lat),
		lon: String(parsed.lon),
		zoom: '18',
		addressdetails: '1',
		extratags: '1'
	})) as (NominatimPlace & { error?: string }) | null;
	const found = place && !place.error ? place : null;
	const address = found?.address ?? {};
	const waterType = guessWaterType(found);

	return {
		lat: +parsed.lat.toFixed(6),
		lon: +parsed.lon.toFixed(6),
		// OpenStreetMap's name is only worth having when the pin is on the water
		// itself; otherwise it is whatever path or building is nearest.
		name: parsed.name || (waterType ? found?.name : null) || null,
		country: address.country ?? null,
		region: regionOf(address),
		waterType,
		approximate
	};
}
