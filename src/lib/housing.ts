// src/lib/housing.ts
// The housing page's series catalog and math. Client-safe: the page and
// $lib/server/housing both import from here, so a label or a formula exists in
// exactly one place.

// ["YYYY-MM-DD", value], oldest first.
export type Point = [string, number];

export interface FredSeries {
	id: string;
	label: string;
	units: string;
	format: 'percent' | 'dollars' | 'index' | 'thousands';
}

// The national indicators pulled from FRED. Add a series here and the next
// refresh fetches it and the page charts it.
export const FRED_SERIES: FredSeries[] = [
	{
		id: 'MORTGAGE30US',
		label: '30-year fixed mortgage rate',
		units: '%, weekly',
		format: 'percent'
	},
	{
		id: 'MSPUS',
		label: 'Median sales price of houses sold',
		units: 'US dollars, quarterly',
		format: 'dollars'
	},
	{
		id: 'CSUSHPISA',
		label: 'Case-Shiller US national home price index',
		units: 'Jan 2000 = 100, monthly',
		format: 'index'
	},
	{
		id: 'HOUST',
		label: 'Housing starts',
		units: 'thousands of units, annual rate, monthly',
		format: 'thousands'
	},
	{
		id: 'MEHOINUSA646N',
		label: 'Median household income',
		units: 'US dollars, annual',
		format: 'dollars'
	}
];

export const MORTGAGE_RATE_SERIES = 'MORTGAGE30US';

// Observations before this aren't fetched. Zillow's files start here too.
export const HISTORY_START = '2000-01-01';

export interface ZillowDataset {
	key: 'zhvi' | 'zori';
	label: string;
	url: string;
}

// Zillow Research's public metro-level CSVs. ZHVI is the smoothed, seasonally
// adjusted typical value of homes in the 35th-65th percentile; ZORI is the
// smoothed typical observed market rent. Both are monthly.
export const ZILLOW_DATASETS: ZillowDataset[] = [
	{
		key: 'zhvi',
		label: 'Typical home value (ZHVI)',
		url: 'https://files.zillowstatic.com/research/public_csvs/zhvi/Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv'
	},
	{
		key: 'zori',
		label: 'Typical rent (ZORI)',
		url: 'https://files.zillowstatic.com/research/public_csvs/zori/Metro_zori_uc_sfrcondomfr_sm_month.csv'
	}
];

// Zillow's RegionID for the whole country, the page's default region.
export const US_REGION_ID = '102001';

// --- math ---

// Monthly principal and interest on a fixed-rate loan: L·r / (1 − (1 + r)^−n),
// with r the monthly rate. At 0% it degenerates to L / n.
export function monthlyPayment(loan: number, annualRatePct: number, years = 30): number {
	const n = years * 12;
	const r = annualRatePct / 100 / 12;
	if (r === 0) return loan / n;
	return (loan * r) / (1 - Math.pow(1 + r, -n));
}

// 'YYYY-MM' of a point's date, for lining up series with different cadences.
export function monthOf(day: string): string {
	return day.slice(0, 7);
}

// Collapse a weekly or monthly series to one value per month (the mean), keyed
// by 'YYYY-MM'.
export function monthlyMeans(points: Point[]): Map<string, number> {
	const sums = new Map<string, { total: number; count: number }>();
	for (const [day, value] of points) {
		const m = monthOf(day);
		const s = sums.get(m) ?? { total: 0, count: 0 };
		s.total += value;
		s.count += 1;
		sums.set(m, s);
	}
	return new Map([...sums].map(([m, s]) => [m, s.total / s.count]));
}

// Combine two series month by month, keeping only months both have. The date
// kept is the left series' own.
export function combineMonthly(
	left: Point[],
	right: Point[],
	fn: (l: number, r: number) => number
): Point[] {
	const rightByMonth = monthlyMeans(right);
	const out: Point[] = [];
	for (const [day, l] of left) {
		const r = rightByMonth.get(monthOf(day));
		if (r !== undefined) out.push([day, fn(l, r)]);
	}
	return out;
}

// Price-to-rent ratio: home value over a year of rent. Roughly, under ~15
// favours buying and over ~20 favours renting.
export function priceToRent(values: Point[], rents: Point[]): Point[] {
	return combineMonthly(values, rents, (v, r) => v / (r * 12));
}

// What the typical home would have cost per month to finance in each month,
// at that month's average rate.
export function paymentSeries(
	values: Point[],
	rates: Point[],
	downPaymentPct: number,
	years = 30
): Point[] {
	return combineMonthly(values, rates, (v, rate) =>
		monthlyPayment(v * (1 - downPaymentPct / 100), rate, years)
	);
}

// Percent change from the observation a year before the latest one. Null when
// the series doesn't reach back a year.
export function yearOverYear(points: Point[]): number | null {
	const last = points.at(-1);
	if (!last) return null;
	const target = `${Number(last[0].slice(0, 4)) - 1}${last[0].slice(4, 7)}`;
	const prior = points.findLast(([day]) => monthOf(day) <= target);
	if (!prior || monthOf(prior[0]) !== target) return null;
	return ((last[1] - prior[1]) / prior[1]) * 100;
}

// The points on or after `years` years before the latest one. 0 means all.
export function lastYears(points: Point[], years: number): Point[] {
	const last = points.at(-1);
	if (!years || !last) return points;
	const cutoff = `${Number(last[0].slice(0, 4)) - years}${last[0].slice(4)}`;
	return points.filter(([day]) => day >= cutoff);
}

// --- houses ---

export interface House {
	id: number;
	url: string;
	zpid: string | null;
	address: string | null;
	price: number | null;
	beds: number | null;
	baths: number | null;
	sqft: number | null;
	notes: string;
	assumptions: Partial<Assumptions> | null;
	rentcast: RentcastDetails | null;
	lat: number | null;
	lng: number | null;
	ratings: Rating[];
	// Set when someone eliminated it: off the main list and the map, and skipped
	// by the weekly listing check, until restored.
	eliminatedAt: string | null;
	eliminatedBy: string | null;
	addedBy: string | null;
	createdAt: string;
}

// One admin's feeling about a house: a score from 1 to 10, plus two
// independent toggles. Both on means they'd neither buy nor rent it. The
// toggles are flags beside the score, not part of it, so the average is only
// ever an average of scores.
export interface Rating {
	userId: number;
	name: string;
	score: number;
	wouldntBuy: boolean;
	wouldntRent: boolean;
	comment: string;
	updatedAt: string;
}

export const RATING_MAX = 10;

export const RATING_FLAGS = [
	{ key: 'wouldntBuy', label: "Wouldn't buy" },
	{ key: 'wouldntRent', label: "Wouldn't rent" }
] as const;
export type RatingFlag = (typeof RATING_FLAGS)[number]['key'];

export function averageRating(h: House): number | null {
	if (!h.ratings.length) return null;
	return h.ratings.reduce((s, r) => s + r.score, 0) / h.ratings.length;
}

// "2 wouldn't buy, 1 wouldn't rent", for a house's card and map pin. Empty
// when no one flagged it.
export function flagSummary(h: House): string {
	return RATING_FLAGS.map((f) => [f, h.ratings.filter((r) => r[f.key]).length] as const)
		.filter(([, n]) => n)
		.map(([f, n]) => `${n} ${f.label.toLowerCase()}`)
		.join(', ');
}

// What a Zillow link tells us without fetching it. A listing URL looks like
//   https://www.zillow.com/homedetails/66-Round-Hill-St-Boston-MA-02130/59139347_zpid/
// so the address is the slug and the zpid is the segment ending in _zpid.
// Null when the link isn't a Zillow link at all.
export function parseZillowUrl(
	raw: string
): { url: string; zpid: string | null; address: string | null } | null {
	let u: URL;
	try {
		u = new URL(raw.trim());
	} catch {
		return null;
	}
	if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
	if (u.hostname !== 'zillow.com' && !u.hostname.endsWith('.zillow.com')) return null;

	const parts = u.pathname.split('/').filter(Boolean);
	const zpid = parts.find((p) => /^\d+_zpid$/.test(p))?.replace('_zpid', '') ?? null;
	const i = parts.indexOf('homedetails');
	const slug = i >= 0 ? parts[i + 1] : undefined;
	let address: string | null = null;
	if (slug && !slug.endsWith('_zpid')) {
		// "...-Boston-MA-02130": the state and ZIP are the last two pieces. Some
		// links stop at the state ("...-Jamaica-Plain-MA"); the geocoder adds the
		// ZIP later (see locatePending).
		const m = slug.match(/^(.*)-([A-Z]{2})(?:-(\d{5}))?$/);
		address = m
			? `${splitStreetCity(m[1].split('-'))}, ${m[2]}${m[3] ? ` ${m[3]}` : ''}`
			: slug.replace(/-/g, ' ');
	}
	// Tracking parameters and fragments are dropped, so the stored link is the
	// listing and nothing else.
	return { url: `https://www.zillow.com${u.pathname}`, zpid, address };
}

const STREET_SUFFIXES = new Set(
	(
		'st street ave avenue rd road dr drive ln lane way ter terrace pl place ct court blvd ' +
		'pkwy parkway cir circle sq square hwy row park plz path trl aly alley xing loop'
	).split(' ')
);
const UNIT_WORDS = new Set(['apt', 'unit', 'ste', 'fl', '#', 'building', 'bldg']);

// The slug has no comma between street and city ("66 Round Hill St Boston"),
// and RentCast wants "Street, City". The street ends at its last suffix (St,
// Ave, Ter, ...) plus any unit after it; whatever follows is the city. A unit
// can be named ("Apt 2", "Building 1") or bare ("5-Wise-St-1-Jamaica-Plain" is
// unit 1, not a city called "1 Jamaica Plain"). With no recognizable suffix the
// words are returned as they came.
function splitStreetCity(input: string[]): string {
	const words = [...input];
	let end = -1;
	for (let i = words.length - 2; i >= 0; i--) {
		if (STREET_SUFFIXES.has(words[i].toLowerCase())) {
			end = i;
			break;
		}
	}
	if (end < 0) return words.join(' ');
	const next = words[end + 1];
	if (UNIT_WORDS.has(next?.toLowerCase()) && end + 3 < words.length) {
		end += 2;
	} else if (next && /^(\d+[a-z]?|[a-z])$/i.test(next) && end + 2 < words.length) {
		words.splice(end + 1, 0, 'Unit');
		end += 2;
	}
	return `${words.slice(0, end + 1).join(' ')}, ${words.slice(end + 1).join(' ')}`;
}

// What RentCast knew about a house when it was last looked up. Normalized from
// its four endpoints, so the page never deals with RentCast's own shapes. A
// field is null when RentCast had nothing for it.
export interface RentcastDetails {
	lookedUpAt: string;
	matchedAddress: string | null;
	listing: { price: number; status: string; listedDate: string | null } | null;
	valueEstimate: { price: number; low: number | null; high: number | null } | null;
	rentEstimate: { rent: number; low: number | null; high: number | null } | null;
	propertyType: string | null;
	beds: number | null;
	baths: number | null;
	sqft: number | null;
	lotSize: number | null;
	yearBuilt: number | null;
	lastSale: { price: number; date: string | null } | null;
	hoaMonthly: number | null;
	annualTax: { year: number; total: number } | null;
	calls: number;
	errors: string[];
	// Written by the weekly listing check, which only refreshes `listing`.
	// Optional: a lookup made before the check existed has neither.
	listingCheckedAt?: string;
	priceHistory?: { date: string; price: number }[];
	// The last check couldn't pair this house with any listing in its ZIP code,
	// which says more about the address than about whether it's for sale.
	listingUnmatched?: boolean;
}

// The analysis defaults a house supplies, ahead of the generic ones and behind
// anything saved:
//   - bedrooms and people splitting both start at the bedroom count, since the
//     per-bedroom figure is the one that always matters;
//   - rent per bedroom is RentCast's whole-house rent estimate split by
//     bedrooms, and it is also the default rent a person pays renting instead;
//   - HOA and the tax rate come from RentCast's property record.
// Rooms not taken by the people splitting are rented out at the per-bedroom
// rent (see analyze), so lowering "people splitting" adds rental income.
export function houseDefaults(h: Pick<House, 'beds' | 'price' | 'rentcast'>): Partial<Assumptions> {
	const out: Partial<Assumptions> = {};
	const beds = h.beds !== null ? Math.max(1, Math.round(h.beds)) : null;
	if (beds) {
		out.bedrooms = beds;
		out.people = beds;
	}
	const d = h.rentcast;
	if (d?.rentEstimate) {
		const perRoom = Math.round(d.rentEstimate.rent / (beds ?? 1));
		out.roomRent = perRoom;
		out.rent = perRoom;
	}
	if (d?.hoaMonthly) out.hoaMonthly = Math.round(d.hoaMonthly);
	if (d?.annualTax && h.price) {
		out.taxPct = Number(((d.annualTax.total / h.price) * 100).toFixed(2));
	}
	return out;
}

export const ASSUMPTION_LABELS: Partial<Record<keyof Assumptions, string>> = {
	bedrooms: 'Bedrooms',
	people: 'People splitting',
	roomRent: 'Rent per bedroom',
	rent: 'Rent instead',
	hoaMonthly: 'HOA',
	taxPct: 'Tax rate'
};

// --- cost analysis ---
//
// Modeled on the "Buy vs Rent analysis" sheet of housingMath.xlsx: the same
// cost lines (loan, upkeep, insurance, tax, HOA, PMI, utilities) split per
// person, then a month-by-month comparison of what owning costs against what
// renting would have.
//
// "Cost of owning" is everything spent that doesn't come back: upfront cash and
// every payment, less the equity you'd walk away with if you sold that month,
// plus the investment growth that money would have earned instead. "Cost of
// renting" is the rent. The gap between them equals the gap in net worth
// between the buyer and a renter who invested the difference, so a positive
// advantage means buying is ahead by that much.

export interface Assumptions {
	downPct: number; // % of price
	ratePct: number; // mortgage APR
	termYears: number;
	taxPct: number; // annual, of purchase price
	taxExemption: number; // annual $ off the tax bill, e.g. Boston's residential exemption
	insurancePct: number; // annual, of purchase price
	upkeepPct: number; // annual, of purchase price
	hoaMonthly: number;
	pmiPct: number; // annual, of the original loan, while under 20% equity
	utilitiesMonthly: number; // extra utilities owning costs over renting
	closingCosts: number;
	renoCosts: number; // upfront renovation
	renoRoiPct: number; // share of renovation spend added to the home's value
	appreciationPct: number; // annual
	sellingPct: number; // agent and closing fees when you sell
	rent: number; // monthly rent you'd pay instead, per person
	rentGrowthPct: number; // annual, applied once a year
	investReturnPct: number; // annual return on money not put into the house
	bedrooms: number;
	people: number; // owners splitting the costs, each taking a bedroom
	roomRent: number; // monthly rent per bedroom, charged for the rooms left over
	rentalIncome: number; // other monthly rent collected (a unit, parking), total
	horizonYears: number;
}

// The sheet's numbers, where it has one. ratePct is replaced by today's FRED
// rate on the page when a house has no saved assumptions.
export const DEFAULT_ASSUMPTIONS: Assumptions = {
	downPct: 20,
	ratePct: 6.25,
	termYears: 30,
	taxPct: 1.09,
	taxExemption: 0,
	insurancePct: 0.3,
	upkeepPct: 0.7,
	hoaMonthly: 0,
	pmiPct: 0.5,
	utilitiesMonthly: 0,
	closingCosts: 10000,
	renoCosts: 0,
	renoRoiPct: 70,
	appreciationPct: 3,
	sellingPct: 4,
	rent: 1225,
	rentGrowthPct: 3.5,
	investReturnPct: 8.5,
	bedrooms: 1,
	people: 1,
	roomRent: 1225,
	rentalIncome: 0,
	horizonYears: 30
};

export interface CostLine {
	label: string;
	rate: string; // how the line is derived, for the table
	monthly: number; // negative for income
}

export interface MonthRow {
	month: number; // 1-based
	homeValue: number;
	balance: number;
	equity: number; // per person, net of selling fees
	rent: number; // this month's rent, per person
	ownerCash: number; // this month's outlay, per person
	interest: number; // per person
	principal: number; // per person
	cumRent: number;
	cumNonEquity: number; // per person: everything paid that isn't principal
	opportunityCost: number; // per person: growth forgone by not investing
	ownCost: number;
	rentCost: number;
	advantage: number; // rentCost − ownCost; positive means buying is ahead
}

export interface Analysis {
	price: number;
	loan: number;
	payment: number; // monthly P&I, whole loan
	upfront: number; // down + closing + renovation, whole house
	lines: CostLine[]; // month one
	totalMonthly: number; // month one, whole house
	nonEquityMonthly: number; // month one, whole house
	bedrooms: number;
	people: number;
	roomsRented: number; // bedrooms not taken by the people splitting
	rows: MonthRow[];
	breakEvenMonth: number | null; // first month buying is ahead, if any
}

export function analyze(price: number, input: Partial<Assumptions> = {}): Analysis {
	const a = { ...DEFAULT_ASSUMPTIONS, ...input };
	const people = Math.max(1, Math.round(a.people));
	const bedrooms = Math.max(1, Math.round(a.bedrooms));
	// Each person splitting takes a bedroom; the rest are rented out. More
	// people than bedrooms (a couple sharing) just means none are.
	const roomsRented = Math.max(bedrooms - people, 0);
	const roomIncome = roomsRented * a.roomRent;
	const n = Math.round(a.termYears * 12);
	const r = a.ratePct / 100 / 12;
	const down = (price * a.downPct) / 100;
	const loan = Math.max(price - down, 0);
	const payment = loan > 0 ? monthlyPayment(loan, a.ratePct, a.termYears) : 0;
	const upfront = down + a.closingCosts + a.renoCosts;

	const tax = Math.max((price * a.taxPct) / 100 - a.taxExemption, 0) / 12;
	const insurance = (price * a.insurancePct) / 100 / 12;
	const upkeep = (price * a.upkeepPct) / 100 / 12;
	const pmiWhile = a.downPct < 20 ? (loan * a.pmiPct) / 100 / 12 : 0;
	// The stock return compounds monthly to the same annual rate, as the sheet's
	// POWER(1 + rate, 1/12) - 1 does.
	const investMonthly = Math.pow(1 + a.investReturnPct / 100, 1 / 12) - 1;
	const startValue = price + (a.renoCosts * a.renoRoiPct) / 100;

	const firstInterest = loan * r;
	const lines: CostLine[] = [
		{ label: 'Mortgage interest', rate: `${a.ratePct}% APR`, monthly: firstInterest },
		{
			label: 'Mortgage principal',
			rate: `${a.termYears}-year fixed`,
			monthly: payment - firstInterest
		},
		{
			label: 'Property tax',
			rate: `${a.taxPct}% / yr${a.taxExemption ? ` − ${formatDollars(a.taxExemption)}` : ''}`,
			monthly: tax
		},
		{ label: 'Insurance', rate: `${a.insurancePct}% / yr`, monthly: insurance },
		{ label: 'Upkeep', rate: `${a.upkeepPct}% / yr`, monthly: upkeep },
		{ label: 'HOA', rate: 'flat', monthly: a.hoaMonthly },
		{
			label: 'PMI',
			rate: pmiWhile ? `${a.pmiPct}% / yr of loan` : 'none at 20% down',
			monthly: pmiWhile
		},
		{ label: 'Utilities', rate: 'flat', monthly: a.utilitiesMonthly },
		{
			label: roomsRented === 1 ? 'Rent from 1 bedroom' : `Rent from ${roomsRented} bedrooms`,
			rate: `${roomsRented} × ${formatDollars(a.roomRent)}`,
			monthly: -roomIncome
		},
		{ label: 'Other rental income', rate: 'flat', monthly: -a.rentalIncome }
	];
	const totalMonthly = lines.reduce((s, l) => s + l.monthly, 0);

	const rows: MonthRow[] = [];
	let balance = loan;
	let cumRent = 0;
	let cumNonEquity = 0;
	let cumCash = upfront / people;
	let portfolio = upfront / people;
	let contributed = upfront / people;
	let breakEvenMonth: number | null = null;

	for (let m = 1; m <= Math.round(a.horizonYears * 12); m++) {
		const yearsIn = Math.floor((m - 1) / 12);
		const growth = Math.pow(1 + a.rentGrowthPct / 100, yearsIn);
		const rent = a.rent * growth;
		const income = (roomIncome + a.rentalIncome) * growth;

		const interest = m <= n ? balance * r : 0;
		const principal = m <= n ? Math.min(payment - interest, balance) : 0;
		balance -= principal;
		// PMI drops off once the loan is down to 80% of the purchase price.
		const pmi = balance + principal > price * 0.8 ? pmiWhile : 0;

		const nonEquity =
			(interest + tax + insurance + upkeep + a.hoaMonthly + pmi + a.utilitiesMonthly - income) /
			people;
		const ownerCash = nonEquity + principal / people;

		cumRent += rent;
		cumNonEquity += nonEquity;
		cumCash += ownerCash;
		// The renter invests whatever owning would have cost beyond the rent
		// (or draws down, when renting costs more).
		portfolio = portfolio * (1 + investMonthly) + (ownerCash - rent);
		contributed += ownerCash - rent;

		const homeValue = startValue * Math.pow(1 + a.appreciationPct / 100, m / 12);
		const equity = (homeValue * (1 - a.sellingPct / 100) - balance) / people;
		const opportunityCost = portfolio - contributed;
		const ownCost = cumCash - equity + opportunityCost;
		const advantage = cumRent - ownCost;
		if (breakEvenMonth === null && advantage >= 0) breakEvenMonth = m;

		rows.push({
			month: m,
			homeValue,
			balance,
			equity,
			rent,
			ownerCash,
			interest: interest / people,
			principal: principal / people,
			cumRent,
			cumNonEquity,
			opportunityCost,
			ownCost,
			rentCost: cumRent,
			advantage
		});
	}

	return {
		price,
		loan,
		payment,
		upfront,
		lines,
		totalMonthly,
		nonEquityMonthly: totalMonthly - (payment - firstInterest),
		bedrooms,
		people,
		roomsRented,
		rows,
		breakEvenMonth
	};
}

// The analysis's months as dated points, for LineChart: month 1 is next month.
export function monthsFromNow(rows: MonthRow[], pick: (r: MonthRow) => number): Point[] {
	const now = new Date();
	return rows.map((row) => {
		const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + row.month, 1));
		return [d.toISOString().slice(0, 10), pick(row)];
	});
}

// --- formatting ---

export function formatValue(value: number, format: FredSeries['format']): string {
	switch (format) {
		case 'percent':
			return `${value.toFixed(2)}%`;
		case 'dollars':
			return formatDollars(value);
		case 'thousands':
			return `${Math.round(value).toLocaleString('en-US')}K`;
		default:
			return value.toFixed(1);
	}
}

// −$2,400 rather than $-2,400. Rounds first, so −0.4 reads as $0.
export function formatDollars(value: number): string {
	const n = Math.round(value);
	return `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US')}`;
}

// Compact axis ticks: $450K, $1.2M, 1.5K.
// The sign goes before the prefix: −$100K, not $-100K.
export function compact(value: number, prefix = ''): string {
	const abs = Math.abs(value);
	const sign = value < 0 ? '−' : '';
	if (abs >= 1e6) return `${sign}${prefix}${trim(abs / 1e6)}M`;
	if (abs >= 1e3) return `${sign}${prefix}${trim(abs / 1e3)}K`;
	return `${sign}${prefix}${trim(abs)}`;
}

function trim(n: number): string {
	return Number(n.toFixed(Math.abs(n) >= 100 ? 0 : 1)).toString();
}

export function formatMonth(day: string): string {
	const [y, m] = day.split('-');
	return `${MONTHS[Number(m) - 1]} ${y}`;
}

export function formatDay(day: string): string {
	const [, , d] = day.split('-');
	return `${formatMonth(day).split(' ')[0]} ${Number(d)}, ${day.slice(0, 4)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
