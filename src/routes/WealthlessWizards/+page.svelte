<!-- src/routes/WealthlessWizards/+page.svelte -->
<!--
	Wealthless Wizards: the prequel to the Wealthy Wizards board game. A first
	draft of its rules, pulled together from the "Dunegeon run" half of the design
	notes. Hidden: nothing links here except /WealthyWizards, and it asks not to
	be indexed.

	Almost all of this is still ideas, not decisions. Where the notes give more
	than one option they're listed side by side as "Options", and anything with
	no answer yet is tagged "Open".

	The Notes tab is the Wealthless half of $lib/wizards/notes.txt, as written.
	The styles live in $lib/wizards/wizards.css, shared with /WealthyWizards.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import '../../app.css';
	import '$lib/wizards/wizards.css';
	import NotesView from '$lib/wizards/NotesView.svelte';
	import { wealthlessNotes } from '$lib/wizards/notes';

	// overview | rules | wizards | world | notes. Kept in the URL hash so a reload
	// stays on the same tab.
	const TABS = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'rules', label: 'Rules draft' },
		{ id: 'wizards', label: 'Wizards' },
		{ id: 'world', label: 'World & legends' },
		{ id: 'notes', label: 'Notes' }
	];
	let tab = 'overview';

	onMount(() => {
		const hash = location.hash.slice(1);
		if (TABS.some((t) => t.id === hash)) tab = hash;
	});

	function pickTab(t: string) {
		tab = t;
		history.replaceState(history.state, '', t === 'overview' ? location.pathname : `#${t}`);
	}
</script>

<svelte:head>
	<title>Wealthless Wizards</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="wizards">
	<div class="container">
		<main>
			<header class="hero">
				<p class="eyebrow">A video game · draft</p>
				<h1>Wealthless Wizards</h1>
				<p class="tagline">
					The journey to the City of Gold, and a discussion of who we hurt along the way.
				</p>
			</header>

			<div class="tabs" role="tablist">
				{#each TABS as t (t.id)}
					<button
						type="button"
						role="tab"
						class="tab"
						class:active={tab === t.id}
						aria-selected={tab === t.id}
						on:click={() => pickTab(t.id)}
					>
						{t.label}
					</button>
				{/each}
			</div>

			{#if tab === 'overview'}
				<article>
					<section>
						<h2>The pitch</h2>
						<p>
							A party of wizards sails from the old world to a vast new one, funded by a king, to
							find the City of Gold. It's part Civilization, part dungeon run (like Slay the Spire),
							part Oregon Trail. A run takes 1–3 hours, longer than most roguelikes and shorter than
							a game of Civ, and depends on how you play.
						</p>
						<p>
							The goal is to make you feel like you're exploring a vast new world that really
							exists, and, slowly, like the villain.
						</p>
					</section>

					<section>
						<h2>What it's about</h2>
						<p class="lore">
							The core of this game is human greed, and even a world of endless fortune couldn't
							change that.
						</p>
						<p>
							Like John Company does with colonialism, the game takes you through it. It looks like
							a roguelike, but it's a roguelite that's really a story. Every run changes the world,
							and the runs march it towards where we're headed, whether or not magic exists: wars
							between countries, wasteland spreading, nobody left surviving. It's meant to end in a
							ball of flames.
						</p>
						<p>
							When a run ends, it shows you what it cost: how many people and animals you killed,
							and how much became ruin.
						</p>
					</section>

					<section>
						<h2>The trilogy</h2>
						<div class="cards-2">
							<div class="card current-card">
								<p class="chapter-num">Before</p>
								<h3>Wealthless Wizards</h3>
								<p>Who we hurt along the way. You should feel like the villain.</p>
							</div>
							<div class="card">
								<p class="chapter-num">Main</p>
								<h3><a href={resolve('/WealthyWizards')}>Wealthy Wizards</a></h3>
								<p>How we take until there is no more: the board game, set in the City of Gold.</p>
							</div>
							<div class="card">
								<p class="chapter-num">After</p>
								<h3>The third game</h3>
								<p>The culmination in a leftover land, and understanding who is left.</p>
							</div>
						</div>
						<p>
							The City of Gold makes anyone who enters forget most of their past. That's why the
							wizards start the board game with almost nothing, and why the rest of the world never
							learns about the city: nobody comes back.
						</p>
					</section>

					<section>
						<h2>Design principles</h2>
						<ul>
							<li>
								<b>Exploration first.</b> Everything should serve the feeling of exploring. Design by
								subtraction once it's built, to keep it that way.
							</li>
							<li>
								<b>Systemic.</b> The world should feel like it exists without you, and you should build
								your own story through synergies and, more importantly, interactions (like the Nemesis
								system).
							</li>
							<li>
								<b>Consequences, not a bar.</b> Make stealing an action you choose, so it feels immoral.
								Small choices should compound: arrive slowly when a town asks for help, and it's harder,
								or too late, to save them.
							</li>
							<li>
								<b>Reward, don't restrict.</b> Reward the behaviour you want, like taking risks and exploring,
								with legendary rewards and titles, rather than blocking what you don't.
							</li>
							<li>
								<b>Easy to start, hard to master.</b> Fun at a new player's level, with a ridiculous
								ceiling. Basic resources stay simple, so everything else can be judged by how it helps
								you survive and explore.
							</li>
							<li>
								<b>The first 15 minutes</b> should be fun and foreshadow the rest. The player should
								always feel above average, with something to work towards.
							</li>
							<li>
								<b>Sid Meier's decisions:</b> every choice has trade-offs, depends on your situation,
								comes down to personal preference, and gives you more information the longer it lasts.
								Research in the children's section: build on what everyone knows, not obscure facts.
							</li>
							<li>
								<b>No save-scumming needed.</b> Mistakes should be small, unpredictable and recoverable.
								Don't reward only perfect play or punish every error. Undo buttons are still important.
							</li>
							<li>
								<b>Every update:</b> something fixed, something balanced, something new. You only hear
								about the fix and the balance once you've discovered them.
							</li>
						</ul>
					</section>
				</article>
			{:else if tab === 'rules'}
				<article class="rules">
					<p class="intro">
						A first draft, gathered from the notes. Most of this is ideas still being explored, not
						decisions. Where the notes give more than one way to do something, the options are
						listed side by side.
					</p>

					<nav class="toc" aria-label="Rules contents">
						<a href="#wl-run">A run</a>
						<a href="#wl-map">The map</a>
						<a href="#wl-time">Time</a>
						<a href="#wl-party">Your party</a>
						<a href="#wl-stats">Stats</a>
						<a href="#wl-combat">Combat</a>
						<a href="#wl-energy">Energy & fatigue</a>
						<a href="#wl-cards">Learning spells</a>
						<a href="#wl-resources">Resources</a>
						<a href="#wl-food">Food & needs</a>
						<a href="#wl-morale">Morale & traits</a>
						<a href="#wl-faith">Faith & fate</a>
						<a href="#wl-fame">Fame & morality</a>
						<a href="#wl-progress">Progression</a>
					</nav>

					<section id="wl-run">
						<h2>A run</h2>
						<h3>Before you sail</h3>
						<ul>
							<li>
								<b>Choose your king.</b> Each one funds you differently, wants different things (lots
								of settlements, jewels, gold, knowledge), and gives different bonuses. A Viking king
								could give sailing bonuses.
							</li>
							<li>
								<b>Shop at home.</b> Spend your starting money on whatever you like (units, food, artifacts),
								a bit like Slay the Spire's opening choice. A small draft for your starting deck could
								fit here too.
							</li>
							<li>
								<b>You're an investment.</b> Someone is funding the voyage, so abandoning a run has consequences.
								That encourages playing runs out instead of restarting.
							</li>
						</ul>
						<h3>Landing</h3>
						<p>
							You arrive by boat and can sail around to choose where to land. The first place you
							land becomes your <b>dock</b>, built from part of the boat. The dock is storage, and
							where you trade with your homeland or the locals.
						</p>
						<h3>The king's demands</h3>
						<ul>
							<li>
								The king wants payment, and the amount of funding sets how often he asks. Do well
								enough and he may fund you more.
							</li>
							<li>
								His demands can be framed as his <b>enjoyment</b>: a happier king asks for less.
							</li>
							<li>
								His ship takes 5 days each way, but has none of teleporting's drawbacks. Pay his
								ransom 5 days early and it's cheaper.
							</li>
							<li>
								It can also bring more settlers: other wizard groups who may be friends or enemies.
							</li>
							<li>
								Bobby can partly fund himself, so he starts with less funding and fewer demands,
								which is easier in the long run.
							</li>
						</ul>
						<h3>Winning</h3>
						<p>
							The goal is always to find the City of Gold, guarded by a legendary boss. A scoring
							system decides whether an expedition counts as a <b>success</b> even if you don't get there.
							A success works like beating Slay the Spire's first act: you get bonuses, plus progress
							towards levelling and notoriety.
						</p>
						<p class="aside">
							There could also be a survival mode: instead of finding the city, settle as well as
							you can before you're swarmed. Or that could just be a way to play the base game.
						</p>
					</section>

					<section id="wl-map">
						<h2>The map</h2>
						<ul>
							<li>
								<b>Fog of war.</b> You only see what's around your wizards, so you can lose sight of
								your own outposts. Vision is a single value, and reveals tiles in rings around you. Within
								a ring, which tiles are revealed is random.
							</li>
							<li>
								<b>Information is a resource.</b> Fog hides it. Some things build it up: a computer lets
								you make more "computations", so more information is shown in an easy-to-read way. Like
								a Civilopedia, but details only appear once you've discovered them.
							</li>
							<li>
								<b>Rumours.</b> Locations appear in the fog as rumours, like in At the Gates. A rumoured
								place may be there, nearby, or not exist at all.
							</li>
							<li>
								<b>Terrain.</b> Revealing new terrain costs extra movement. Marsh and mud slow you down.
								A cursed forest makes you walk in circles. Mountains and other features should feel huge,
								many tiles across. Wings let you attack uphill.
							</li>
							<li>
								<b>Trailblazing.</b> Explore slowly to make later travel through the area cheaper.
							</li>
							<li>
								<b>The closer you get to the city, the emptier the land.</b>
							</li>
							<li>
								<b>Bigger forces can be seen from further away.</b>
							</li>
							<li>
								<b>Unidentified things.</b> Plants and stones you find can start unidentified.
							</li>
						</ul>
						<div class="options">
							<h4>Options: how big the world is</h4>
							<ul>
								<li>Each run has its own map.</li>
								<li>
									The map doesn't reset between runs, which makes it more of a roguelite. A
									labyrinth could shift things around.
								</li>
								<li>
									One huge super-map with both the old and the new world, and runs dropping you into
									different parts (islands, continents). The map only takes fixed shape once you've
									researched cartography.
								</li>
							</ul>
						</div>
					</section>

					<section id="wl-time">
						<h2>Time</h2>
						<ul>
							<li>
								<b>Days are split up:</b> morning, afternoon, evening and night. Daylight is for exploring,
								and night is when your bases can be attacked. Some units are stronger at certain times,
								and some areas are worse at others (a desert at noon).
							</li>
							<li>
								<b>Actions, not hours.</b> Each part of the day gives you actions to spend, not a fixed
								amount of movement: explore further, boost morale, rest, work the land.
							</li>
							<li>
								<b>Seasons, years and moon cycles</b> could all exist. A lot of witchcraft and the occult
								follows the moon. Some crops only grow in some seasons.
							</li>
						</ul>
						<p class="aside">
							<span class="open">Open</span> A whole day per turn is also on the table, with quicker
							battle rounds (like Pathfinder or Humankind).
						</p>
					</section>

					<section id="wl-party">
						<h2>Your party</h2>
						<ul>
							<li>
								<b>You are the wizards</b>, not the leader of an army that happens to have wizards
								in it. You play as two wizards, or a wizard and an apprentice.
							</li>
							<li>
								<b>Units</b> join you: workers, soldiers, traders, librarians. Each can have one profession,
								or a number of specialty slots. Horses can work too, like at a farm.
							</li>
							<li>
								<b>Orders.</b> Units far from a wizard need orders, like in Old World. An order is sent
								by spell, so it costs part of a turn. Orders cost more the further away the unit is and
								the less it likes you. Specially trained units don't need orders for what they're trained
								in.
							</li>
							<li>
								<b>Communication.</b> Phones and other items let you see distant outposts and need fewer
								orders. The free communication range grows over time.
							</li>
							<li>
								<b>Leaders.</b> A unit can be promoted to commander or general, so it can give a few
								orders to its own group.
							</li>
							<li>
								<b>Corps.</b> Units can move together in any shape. A corps is slower but has more stamina.
								To defend an attack, a unit moves up to 1 square to block it, so an attack from directly
								behind can't be blocked. Ordering the leader moves the whole corps. A "follow the leader"
								mode makes a line, and a trailblazing leader speeds up the rest.
							</li>
							<li>
								<b>Outposts.</b> You can build one ring of buildings around an outpost. Buildings make
								monsters spawn less nearby.
							</li>
						</ul>
						<p>Orders and gold are what stop you from building a massive army.</p>
						<div class="options">
							<h4>Multiplayer</h4>
							<ul>
								<li>Co-op for 2, each controlling a wizard, or parties of up to 4 wizards.</li>
								<li>Dropped into the same world against other players.</li>
								<li>
									A Hearthstone-style online duel, with decks built from spells you learned in the
									main game.
								</li>
							</ul>
						</div>
					</section>

					<section id="wl-stats">
						<h2>Stats</h2>
						<p>
							Every character has seven stats. In combat they count at a tenth of their value; out
							of combat they count in full.
						</p>
						<div class="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Stat</th>
										<th>In combat (÷10)</th>
										<th>Out of combat</th>
									</tr>
								</thead>
								<tbody>
									<tr>
										<td><b>Speed</b></td>
										<td>How many actions you get. Draws your attack cards</td>
										<td>How fast you move (50 → 5.0 per unit of time)</td>
									</tr>
									<tr>
										<td><b>Strength</b></td>
										<td>Added to your attacks' damage</td>
										<td>How much you can carry</td>
									</tr>
									<tr>
										<td><b>Intelligence</b></td>
										<td>Added to your spells' chance. Draws your spell cards</td>
										<td
											>How fast you learn intelligence spells and other skills (80 → 80% of points)</td
										>
									</tr>
									<tr>
										<td><b>Swagger</b></td>
										<td>Added to your spells' damage</td>
										<td>
											How fast you learn swagger spells and acrobatics. Helps relationships and
											trading
										</td>
									</tr>
									<tr>
										<td><b>Fortitude</b></td>
										<td>Damage you shrug off</td>
										<td>Your maximum morale</td>
									</tr>
									<tr>
										<td><b>Endurance</b></td>
										<td>How fast your draw counter goes down</td>
										<td>The size of your energy bar</td>
									</tr>
									<tr>
										<td><b>Magic ability</b></td>
										<td colspan="2">A percentage multiplier on the mana you generate</td>
									</tr>
								</tbody>
							</table>
						</div>
						<ul>
							<li>
								Mana per turn could be the average of all your stats ÷ 10.
								<span class="open">Open</span>
							</li>
							<li>
								Draw rate can be a decimal. Wizards get +0.5 draws a turn for the magic flowing
								through them (or their intelligence instead), which is most of the difference
								between a wizard and a unit.
							</li>
							<li>
								Characters can lean physical (more food) or mental (more rest), or somewhere in
								between.
							</li>
						</ul>
					</section>

					<section id="wl-combat">
						<h2>Combat</h2>
						<p>
							Combat is a deck-builder. Wizards and units each have their own cards, and each wizard
							and unit has its own mana, plus a pool of neutral mana.
						</p>
						<h3>Positioning</h3>
						<ul>
							<li>
								Units in front protect the ones behind. Range decides where you can stand and who
								you can reach.
							</li>
							<li>
								There are two kinds of area attack: <b>lobbed</b> attacks (like a bow) ignore the
								front line, and <b>barrelling</b> attacks hit it.
							</li>
							<li>Flanking makes attacks hit harder, partly getting past armour.</li>
							<li>
								You can move between hexes during a fight, which costs speed (and so draws). Summons
								can come in from different directions. <span class="open">Open</span> How to handle enemies
								spread over several hexes, and reinforcements.
							</li>
						</ul>
						<h3>Cards</h3>
						<ul>
							<li>
								Each card lists three values: its cost (actions or mana), its damage bonus (usually
								strength) and its chance bonus (usually intelligence).
							</li>
							<li>
								Spells and abilities could be separate decks: spells drawn at a rate based on
								intelligence, attacks at a rate based on speed.
							</li>
							<li>
								Mana and actions both roll over between turns. Mana can turn into actions (neutral
								mana → mana → neutral action → action). <span class="open">Open</span> What stops you
								over-preparing?
							</li>
							<li>
								A <b>cantrip slot</b>: a few spells or weapon attacks you can use without drawing
								them. One slot is unique to each character, like a Hearthstone hero power.
							</li>
							<li>Mulligans, possibly scalable (mulligan up to X cards).</li>
							<li>
								Spells can work both in and out of combat: healing either way, a fireball to kill or
								to warm something up, a forceful wind to speed your ship or slow theirs.
							</li>
							<li>In-combat upgrades (lower cost, more damage) last until that character rests.</li>
						</ul>
						<h3>Weapons and armour</h3>
						<ul>
							<li>
								A weapon changes one kind of spell or keyword: extra damage, a mana discount, a
								bonus effect, or a "whenever you cast" effect. It can also add copies of its own
								cards.
							</li>
							<li>Equipment slots: hand, off-hand and clothes (or hat, chest and lower).</li>
							<li>
								Shields: when you fortify, pick a direction to defend. Each shield has its own
								pattern of bonuses.
							</li>
							<li>
								Bows could need arrows, with special arrows too. Thrown weapons leave your deck
								until you pick them up.
							</li>
						</ul>
						<h3>Fortifying</h3>
						<p>
							Fortifying gives a defensive bonus and prepares you for combat: +0.5 cards drawn and
							+1 mana at the start of a fight per turn spent fortifying, up to 4 turns. Fortify and
							don't get attacked, and you draw an extra attack card.
						</p>
						<h3>Buildings in combat</h3>
						<ul>
							<li><b>Obelisk:</b> +1 to all combat within 1 hex.</li>
							<li>
								<b>Archer tower:</b> start each combat with some 0-cost damage spells that draw a
								card. It can be upgraded to a <b>spotlight</b>, which costs light each night but
								sees further and makes attacks less likely.
							</li>
							<li><b>Fortifications:</b> every unit starts combat with 1 permanent armour.</li>
						</ul>
					</section>

					<section id="wl-energy">
						<h2>Energy & fatigue</h2>
						<ul>
							<li>
								Every character has an <b>energy bar</b>, sized by endurance. Spending mana and
								cycling your deck drains it.
							</li>
							<li>
								When your deck reshuffles, you get a <b>fatigue</b> card. The first costs 0 to play,
								and each one after costs 1 more, up to 10. The energy lost could depend on how big your
								deck is.
							</li>
							<li>
								You lose 10 × the percentage of energy you spent in a turn, so a low-level character
								working flat out tires in 2–3 days.
							</li>
							<li>
								Refilling your energy bar clears all fatigue, resets the counter and draws a new
								hand.
							</li>
							<li>
								Carrying too much adds <b>weighed down</b> cards (1 mana: draw a card) to your deck,
								more the heavier you are. That makes it punishing to send one overloaded person into
								a fight.
							</li>
							<li>Not sleeping adds a fatigue card too.</li>
							<li>
								Cards that play differently cost different energy: physical &lt; magic &lt; fatigue
								cards.
							</li>
							<li>
								Removing cards from your deck is never impossible, but bigger decks get rewards too.
								More cycles mean more energy used, so you tire faster.
							</li>
						</ul>
						<h3>Health and rest</h3>
						<p>
							Health comes back very slowly on its own, faster while resting. To heal quickly, use
							potions, healing spells, or healing aids like a crutch. Endurance decides how fast
							ailments like poison wear off.
						</p>
					</section>

					<section id="wl-cards">
						<h2>Learning spells</h2>
						<ul>
							<li>
								<b>Spell schools:</b> fire, ice, water, divine, holy, dark, arcane and more. Some characters
								are better with some schools (Pylion with fire, Bex with arcane).
							</li>
							<li>
								<b>Knowledge and gold</b> pay for new spells. Casting a spell makes it cheaper to learn,
								cheaper to upgrade, and makes its school cheaper. Casting that exact spell gives a bigger,
								percentage discount. The discount only applies to your next purchase.
							</li>
							<li>
								Learning spells of one school makes its rarer spells more likely to turn up. Your
								reputation can matter too: evil schools show up more for the infamous.
							</li>
							<li>
								<b>Tutors</b> let you target a specific card, even a legendary, for gold and knowledge,
								instead of the shop's random pulls.
							</li>
							<li>
								<b>Upgradable shops</b>, like Bob's tavern in Battlegrounds. Research makes
								upgrading cheaper, and a better shop shows more cards and rarer ones.
							</li>
							<li>
								<b>Research points</b> buy society-wide upgrades, but only up to your level. Research
								level also upgrades your characters and their starting artifacts.
							</li>
							<li>
								Having several copies of an out-of-combat spell makes it cheaper, or lets you cast
								it more than once a day.
							</li>
							<li>
								Spells that shape the land (raise or lower it) make you feel more like a wizard.
							</li>
						</ul>
						<p class="aside">
							<span class="open">Open</span> Each character having their own keyword or mechanic, like
							Hearthstone classes. Ideal, but hard to pull off.
						</p>
					</section>

					<section id="wl-resources">
						<h2>Resources</h2>
						<ul>
							<li>
								<b>Not global.</b> Resources are held by a party or an outpost and have to be moved.
								Places within 1 tile of each other can share them cheaply. Otherwise someone has to carry
								them, or a trader moves them and makes silver doing it.
							</li>
							<li>
								<b>From the land.</b> Tiles hold silver, ME, food and maybe gold. You can spend part
								of a day working the land you're on.
							</li>
							<li>
								<b>Supply and demand.</b> Prices follow how much of something is around, so sending traders
								to where demand is high pays. The economy breaks down into taps, inventory, drains, converters
								and traders. Foreign goods resell high but are hard to find.
							</li>
							<li>
								<b>Teleporting resources</b> needs ME at the receiving end, and a smaller share of it
								at the sending end. That lets you set up somewhere, leave, and keep exploring.
							</li>
							<li>
								<b>Gold</b> gives mana to the party carrying it, and can permanently upgrade one spell.
								Gold left in a city gives that city mana, for things like magic farming.
							</li>
							<li>
								<b>Light and heat</b> could be resources: candles, wood and bulbs help at night; clothes
								and shelter keep you warm through the seasons.
							</li>
							<li>
								<b>Building.</b> A builder can make a building cheaper or faster. At an outpost, materials
								come from what it produces; away from one you need them up front.
							</li>
							<li>
								<b>Working arrangements</b> for people on your land: you take the goods and pay them,
								they keep the goods and pay you rent, or they trade freely and you take a cut.
							</li>
							<li>
								<b>Sustainability.</b> Cut down trees and they're gone. Farm a field too hard and it
								loses fertility. Something like the Lorax may come for you if you start clearing a forest.
							</li>
							<li>
								<b>Industrialized wonders.</b> Use a wonder enough and it gets a worse version of itself:
								the Fountain of Youth becomes walled off, bottled and sold. Its passive effects on the
								land around it fade as you do.
							</li>
						</ul>
					</section>

					<section id="wl-food">
						<h2>Food & needs</h2>
						<ul>
							<li>
								<b>Four food types:</b> fruit, vegetable, protein and carb, plus water. Eating all four
								counts as eating more and boosts each one's effect; three of four gives part of the boost.
							</li>
							<li>
								<b>Eating</b> means slotting food into each type, plus a misc slot. Food in the misc
								slot triggers its special effect (peppers make fire spells cheaper and warm you up).
								Some foods count as more than one type (milk as protein or fat). Salt stops the rest
								from rotting. A coconut counts as every type and gives water.
							</li>
							<li>Food rots over time.</li>
							<li>
								The cornucopia can go in any slot for free. A button can eat your best mix
								automatically.
							</li>
							<li>
								Characters need food and rest. If units need all four basics, money can keep their
								morale up.
							</li>
						</ul>
						<p class="aside">
							<span class="open">Open</span> Is thirst its own mechanic, or a difficulty setting?
						</p>
					</section>

					<section id="wl-morale">
						<h2>Morale, traits & relationships</h2>
						<ul>
							<li>
								<b>Morale</b> drifts every turn. A beautiful tile slows the drop, an ugly one speeds
								it up. Killing an enemy boosts the killer's morale, winning a fight boosts everyone's,
								and a friend dying changes it depending on how close they were (or how much they hated
								each other).
							</li>
							<li>
								<b>Relationships.</b> It's usually better if your two wizards like each other, though
								hating each other has its niche benefits.
							</li>
							<li>
								<b>Interests.</b> Everyone has a hidden interest vector. You learn more of it (their
								favourite, their least favourite, how much) as they warm to you. It decides how fast
								they learn a task and how much they enjoy it, and big events can change it.
							</li>
							<li>
								<b>Desires</b> boost morale when met and lower it when they aren't.
							</li>
							<li>
								<b>Traits</b> can be temporary or permanent, and their strength is rolled, so the same
								trait can be good or bad. Gaining traits makes similar, rarer ones more likely. Examples:
								scavenger, desert tummy, foodie, chef, heavy sleeper, sluggish, greed, adaptive learning,
								fearless.
							</li>
							<li>
								<b>Loyalty</b> could replace morale for units, and decides how much an outpost sends
								you.
							</li>
							<li>
								<b>Influence</b> lets wizards talk people into things. It costs less with people who
								like you.
							</li>
							<li>
								<b>Conversation</b> tests how observant you are: in a dialogue with a city, can you remember
								what they wanted when you offer a bribe?
							</li>
							<li>
								<b>Discovering people.</b> Characters have hidden facts, like a passion that lets them
								learn in a unique way. You might only notice them with a journal.
							</li>
						</ul>
					</section>

					<section id="wl-faith">
						<h2>Faith & fate</h2>
						<ul>
							<li>
								<b>Faith works like Civ's.</b> Spend it on things like divine healing. People who witness
								acts of faith become believers, and believers make faith.
							</li>
							<li>
								<b>Faith belongs to people, not cities</b>, though cities affect people. To lead a
								religion, a person needs enough faith in it.
							</li>
							<li>
								<b>Make your own religion.</b> Choose your deity's nature (destructive, maybe fireballs)
								and your beliefs (tithing). Religions can be polytheistic (many small bonuses that shift
								with each god's popularity) or monotheistic. Both can produce prophets or demigods, and
								wizards you meet can become gods.
							</li>
							<li>
								Religions can be spawned by events and change over time. They're tied to spell
								schools. Evil-leaning people may be wary of yours, and hunts can happen.
							</li>
							<li>
								<b>Fate</b> is closely tied to faith, and could be a roll that depends on who you're
								travelling with. Damage could be rolled too.
							</li>
							<li>
								When a character dies they lose 1 fate permanently. Reaching a certain level gains 1
								fate (2 if they're behind).
							</li>
						</ul>
					</section>

					<section id="wl-fame">
						<h2>Fame, notoriety & morality</h2>
						<ul>
							<li>
								<b>Two hidden bars</b>, one for good and one for evil. Good doesn't cancel out evil:
								you can rack up a lot of both and be chaotic neutral.
							</li>
							<li>
								<b>Consequences you can see.</b> Repeat offences lower morality more. People are crushed
								or take on bad traits. Players and cities hate you on sight. There's a reward for your
								arrest. Evil is a feeling, after all.
							</li>
							<li>
								<b>Fame and notoriety</b> carry over between runs. As your reputation grows you unlock
								new rewards and better starting funding. Notoriety fades over time, and events can change
								someone else's (find their journal and they get more famous).
							</li>
							<li>
								<b>Locals remember you.</b> Being friendly gets you tips on nearby places, directions
								to the city, and better prices.
							</li>
							<li>
								<b>Obligations.</b> Trade favours: an immediate reward now, a challenge you must complete
								later. Quests raise your standing with groups.
							</li>
							<li>
								Some people won't be under your control at all: they move to your cities, and you
								can tax them.
							</li>
						</ul>
					</section>

					<section id="wl-progress">
						<h2>Progression</h2>
						<p>
							There are no permanent upgrades between runs, only permanent changes: new choices, new
							starting pieces and new mechanics, with a small, temporary boost for struggling
							players (more starting funds from fame). Struggling players also need less to level
							up.
						</p>
						<h3>Unlocking the world</h3>
						<p>
							Mechanics arrive one at a time, each with a new wizard, so complexity grows with the
							difficulty. At the start, resources barely exist: only food, with no types.
						</p>
						<ol class="unlocks">
							<li>The start: Merlin and Knick</li>
							<li>Building materials: Candice</li>
							<li>Food that rots, food types and water: Frank the Founder</li>
							<li>Temperature and weather: Pylion</li>
							<li>Time, moon cycles and seasons: the witch, or Thomas</li>
							<li>Memory: people recognize you, hostility grows, and fame takes hold</li>
							<li>Cartography: the map locks in, and the hunt for the City of Gold begins</li>
						</ol>
						<p>
							Some mechanics unlock through account levels, others by finishing things. The final
							ascension level could lock in everything that came before: the map, the wizards, the
							religions.
						</p>
						<h3>Titles</h3>
						<ul>
							<li><b>The Remembered:</b> win with one wizard dead. The other remembers them.</li>
							<li><b>The Legend:</b> get a character to max notoriety.</li>
							<li><b>The Myth:</b> create a myth.</li>
							<li><b>The Alliterate:</b> find every alliteration.</li>
							<li><b>The Captain:</b> climb El Capitan for the first time.</li>
							<li><b>The Pirate:</b> finish the pirate quest.</li>
							<li>Titles for the highest goodness and the worst badness.</li>
						</ul>
						<h3>Custom wizards</h3>
						<p>
							Get units (not just wizards) to the City of Gold to unlock custom wizards: set their
							stats, and get a random mix of two other wizards' card sets and one of their traits.
						</p>
					</section>
				</article>
			{:else if tab === 'wizards'}
				<article>
					<p class="intro">
						The characters so far. Each should have their own way of earning knowledge and, ideally,
						their own mechanic. Some can be found out in the world instead of picked at the start.
					</p>
					<div class="cards-2">
						<div class="card">
							<h3>Merlin</h3>
							<p class="small">Magic ability, swagger, intelligence · low fortitude</p>
							<p>One of the two wizards you start with.</p>
						</div>
						<div class="card">
							<h3>Knick the Knight</h3>
							<p class="small">Fortitude, strength, endurance · low speed</p>
							<p>
								Gives a defensive bonus to everyone in his corps. Chivalry never dies: blocking
								damage for someone else improves their relationship.
							</p>
						</div>
						<div class="card">
							<h3>Bobby Business</h3>
							<p class="small">Swagger, strength, fortitude · low magic ability</p>
							<ul>
								<li>
									Prints counterfeit money, a percentage of his real money (not compounding). It
									always spends, but the more he uses, the more people dislike him later.
								</li>
								<li>His trading hub launders fake money into real money when it sells.</li>
								<li>Starts with the greed trait, and can partly fund himself.</li>
								<li>
									Investment banking (2 mana): gain 1 mana for the next 3 turns. Flip side: spend 50
									silver to gain 25 a turn for 3 turns.
								</li>
							</ul>
						</div>
						<div class="card">
							<h3>Bex</h3>
							<p class="small">Intelligence, magic ability · low strength</p>
							<ul>
								<li>Combo and spell damage, and good with arcane.</li>
								<li>Learns by teaching units, and her study session works out of combat too.</li>
								<li>Chaos: an adaptive random spell each turn, which helps her learn faster.</li>
							</ul>
						</div>
						<div class="card">
							<h3>Frank the Founder</h3>
							<p class="small">Endurance, speed, swagger · nothing low</p>
							<p>
								Reveals all the basic resources on a tile; others need a surveying spell. Learns by
								surveying interesting tiles. Leans towards fast play. Found on the map after
								cartography, and joins once befriended.
							</p>
						</div>
						<div class="card">
							<h3>The General</h3>
							<ul>
								<li>Units with him gain more XP, and armies are slowed less.</li>
								<li>Learns by leading units in combat.</li>
								<li>
									A whistle makes orders cheaper and longer range. Rally cry (2 mana): 1 neutral
									mana and remove a fatigue; upgraded, it also draws.
								</li>
								<li>"Each unit draws a card." Gives neutral mana to the party.</li>
								<li>Joins after you recruit enough units from the armoury.</li>
							</ul>
						</div>
						<div class="card">
							<h3>Candice the Contractor</h3>
							<p>
								Blueprints are cards; "draw plans" draws one. Buildings she helps build for others
								cost 5% less, and she keeps 5% of the materials.
							</p>
						</div>
						<div class="card">
							<h3>Archie</h3>
							<p>Buildings he designs yield 5% more. Leans towards slow play.</p>
						</div>
						<div class="card">
							<h3>Pylion</h3>
							<p>Fire. Arrives with temperature and weather.</p>
						</div>
						<div class="card">
							<h3>Thomas</h3>
							<p>
								A time stone that costs mana to use and builds up its own magic each turn, adding
								fast-forward and rewind cards. Has a mulligan, or draws the cards played last turn.
							</p>
						</div>
						<div class="card">
							<h3>Wyla the Witch</h3>
							<p>
								Her first choice decides which witchcraft she explores (spiritual, satanic and
								more), each with an alignment and an item. She can spend faith in combat and makes
								faith in her own ways. A possible expansion, with the devil as a new boss.
							</p>
						</div>
						<div class="card">
							<h3>And more</h3>
							<ul>
								<li><b>Maximus:</b> has a mulligan.</li>
								<li><b>Sid the Sly:</b> ignores the first fatigue card when his deck cycles.</li>
								<li><b>Hera:</b> marrying gives a permanent bonus, once, until divorce.</li>
								<li><b>The Ancient:</b> reads forgotten languages, so has old magic.</li>
								<li><b>The Nomad:</b> harvests more, or without using up the resource.</li>
								<li><b>The Gambler:</b> a scroll of wonder that casts a random spell.</li>
								<li><b>A king</b> who joins once you've done enough.</li>
							</ul>
						</div>
					</div>
				</article>
			{:else if tab === 'world'}
				<article>
					<section>
						<h2>Locations of legend</h2>
						<p>
							Places from myth and history, hidden in the fog as rumours. Finding one makes its
							stories grow, and it gets richer for later expeditions.
						</p>
						<div class="table-wrap">
							<table>
								<tbody>
									<tr>
										<td><b>Sierra de la Plata</b></td>
										<td>The mountain of silver</td>
									</tr>
									<tr>
										<td><b>Norumbega, Paititi</b></td>
										<td>Cities of riches</td>
									</tr>
									<tr>
										<td><b>Camelot, Mount Meru</b></td>
										<td>Still to be worked out</td>
									</tr>
									<tr>
										<td><b>Muspelheim & Niflheim</b></td>
										<td>Fire monsters, and its frozen partner. There should be an ice biome too</td>
									</tr>
									<tr>
										<td><b>Ryūgū-jō</b></td>
										<td>The undersea palace of the Japanese dragon</td>
									</tr>
									<tr>
										<td><b>Library of Alexandria</b></td>
										<td
											>Makes knowledge and research when a librarian works it, and money from
											trading books</td
										>
									</tr>
									<tr>
										<td><b>Fountain of Youth</b></td>
										<td
											>People heal faster nearby. Units may work non-stop. Can be bottled and sold</td
										>
									</tr>
									<tr>
										<td><b>Scholomance</b></td>
										<td
											>Dark and devil spells cost less to learn for each part of a day spent there.
											A battle with the devil</td
										>
									</tr>
									<tr>
										<td><b>Hogwarts</b></td>
										<td
											>Helps you learn. Choose a house for a bonus, with a tree that protects it</td
										>
									</tr>
									<tr>
										<td><b>Santa's workshop</b></td>
										<td>Makes toys (money and morale). Get an elf, and Santa's sack</td>
									</tr>
									<tr>
										<td><b>The beanstalk</b></td>
										<td
											>Plant beans near something magical and a stalk may grow. Climb it if you can</td
										>
									</tr>
									<tr>
										<td><b>The Aerie</b></td>
										<td>On top of a plateau; the trick is getting up there</td>
									</tr>
									<tr>
										<td><b>The gates of hell</b></td>
										<td>An alternate ending, not necessarily a violent one</td>
									</tr>
									<tr>
										<td><b>The edge of the world</b></td>
										<td>Makes finding the map's edge a reward instead of just a wall</td>
									</tr>
									<tr>
										<td><b>Iceland</b></td>
										<td>
											Its legends of how land formed, mythical creatures, the Golden Circle, and
											Þorrablót
										</td>
									</tr>
									<tr>
										<td><b>And more</b></td>
										<td>
											Roanoke's disappearance, rainbows and pots of gold, El Capitan, the four Irish
											islands
										</td>
									</tr>
								</tbody>
							</table>
						</div>
						<p class="aside">
							Legendary artifacts whose location didn't spawn can still turn up with travelling
							salesmen.
						</p>
					</section>

					<section>
						<h2>Monsters and bosses</h2>
						<ul>
							<li>
								<b>Enemies of legend</b> are mini-bosses, like Slay the Spire's elites: the Minotaur,
								the Kraken. Killing one can win over nearby towns (it was terrorizing them) or turn them
								against you (they worshipped it).
							</li>
							<li>
								<b>Final bosses</b> are legendary guardians of the City of Gold, like Cerberus or a dragon,
								with more added in expansions.
							</li>
							<li>
								A monster based on the Whomping Willow, the Lorax for anyone clearing a forest, and
								a basilisk from Tom Riddle's diary (one of the journals you can find).
							</li>
						</ul>
					</section>

					<section>
						<h2>Things to find</h2>
						<ul>
							<li>
								<b>Journals</b> to pick up, which can make their writer famous. An ender chest, an endless
								book, and scrolls that boost knowledge or spell learning once.
							</li>
							<li>
								<b>Cupid's arrow:</b> shoot it in combat, or use it out of combat to bring two people
								closer.
							</li>
							<li><b>A love letter</b> that improves morale.</li>
							<li>
								<b>The pirate quest:</b> cursed treasure, maybe the Kraken, and the Pirate title. Pirates
								sail better and can raid the king's trade, at the cost of receiving none.
							</li>
							<li>
								<b>Towns and buildings:</b> hotels in permanent cities for a night's rest, schools that
								earn money teaching outsiders, wineries, fur traders who take pelts from slain animals.
								Cities upgrade themselves by producing useful things.
							</li>
						</ul>
					</section>
				</article>
			{:else}
				<NotesView blocks={wealthlessNotes}>
					<p class="intro">
						Every Wealthless Wizards note, as written. The board game's notes are on the
						<a href={resolve('/WealthyWizards')}>Wealthy Wizards page</a>.
					</p>
				</NotesView>
			{/if}
		</main>
	</div>
</div>
