<!-- src/routes/WealthlessWizards/+page.svelte -->
<!--
	Wealthless Wizards: the prequel to the Wealthy Wizards board game. A first
	draft of its rules, pulled together from the "Dunegeon run" half of the design
	notes. Hidden: nothing links here except /WealthyWizards, and it asks not to
	be indexed.

	Some details come from the older (2021–22) prequel design docs. Where those
	disagree with the notes, the notes win and the older version is shown as an
	"Earlier draft" option.

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

	// overview | gameplay | rules | wizards | epithets | traits | items | world | monsters | notes. Kept in the URL hash so
	// a reload stays on the same tab.
	const TABS = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'gameplay', label: 'Gameplay' },
		{ id: 'rules', label: 'Rules draft' },
		{ id: 'wizards', label: 'Wizards' },
		{ id: 'epithets', label: 'Epithets' },
		{ id: 'traits', label: 'Traits' },
		{ id: 'items', label: 'Items' },
		{ id: 'world', label: 'World & legends' },
		{ id: 'monsters', label: 'Monsters' },
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
							part Oregon Trail. A run takes 3–5 hours, longer than most roguelikes and shorter than
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
								<b>Everything is real.</b> What if every story, fable and myth ever told were true? Every
								legend is out there to be found. It drives the point home: it doesn't matter how much
								there is, we will always take more.
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
								<b>Reward, don't restrict.</b> Reward the behavior you want, like taking risks and exploring,
								with legendary rewards and epithets, rather than blocking what you don't.
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
			{:else if tab === 'gameplay'}
				<article class="rules">
					<p class="intro">
						How a turn actually plays. The game is turn based, and most of what you do comes from
						playing cards, but a few actions are always there for every wizard and unit.
					</p>

					<section>
						<h2>A turn</h2>
						<h3>Start of the turn</h3>
						<ul>
							<li>
								<b>Roll fate.</b> Each wizard rolls a d20 plus their fate, into the shared pool, and
								each unit rolls a d4 for itself (see
								<button type="button" class="link" on:click={() => pickTab('rules')}
									>the rules draft</button
								>).
							</li>
							<li>
								<b>Draw cards.</b> Every character you control (both wizards and every unit) has their
								own hand, and draws 1 card per 10 speed, plus spell draws equal to swagger ÷ 10 × magic
								ability ÷ 100. A character who slept last turn draws nothing.
							</li>
							<li>
								<b>Gain mana:</b> by default, the sum of your other stats × magic ability ÷ 100. Anything
								left over from last turn carries over, up to your max (1 by default).
							</li>
							<li>
								<b>Buildings trigger.</b> Every per-turn effect from your buildings happens now.
							</li>
							<li>
								<b>Start-of-turn effects</b> from items, traits and places happen now, like the energy
								drink's −6 energy or morale drifting down.
							</li>
						</ul>
						<h3>Everyone has their own 5 hours</h3>
						<p>
							Every wizard and every unit gets its own 5 hours to spend each turn. They all act in
							parallel, so everything done in a turn is happening at the same time: one wizard can
							spend their hours walking while the other casts and a unit mines. The turn is over
							once everyone's hours are spent, or you end it.
						</p>
						<ul>
							<li>
								<b>Every action takes time</b> from the hours of whoever does it. Giving a unit an order
								also takes some of the ordering wizard's hours.
							</li>
							<li>
								<b>Most actions drain energy</b>, unless they have the rest trait.
							</li>
							<li>
								<b>How you spend your hours sets your healing.</b> Each turn you heal 1% of max
								health per active hour, 2% per resting hour (unused, or spent on rest actions),
								averaged over the 5 hours. Sleeping takes the whole turn and heals 4%, but you draw
								no cards the next turn (see
								<button type="button" class="link" on:click={() => pickTab('rules')}
									>the four bars</button
								>).
							</li>
							<li>
								<b>Play cards.</b> Most actions, and most of your damage, come from the cards in your
								hand, paid for with mana (and fate, where a card needs it).
							</li>
							<li>
								<b>Take the basic actions.</b> These are always available, whatever you've drawn.
							</li>
						</ul>
					</section>

					<section>
						<h2>Basic actions</h2>
						<p>
							To start with there are five: <b>move</b>, <b>basic strike</b>, <b>interact</b>,
							<b>work</b>
							and <b>fortify</b>. Wizards take them directly, and units take them when ordered
							(which costs the ordering wizard time too).
						</p>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Action</th><th>How</th><th>Cost</th><th>Limit</th></tr></thead>
								<tbody>
									<tr
										><td><b>Move</b></td><td
											>Select a unit, or a whole corps, and drag to where you want them to go</td
										><td
											>Each one spends the time the move takes from its own hours, based on its
											speed (movement points per hour, counted to the nearest tenth of an hour)</td
										><td>As far as its hours allow</td></tr
									>
									<tr
										><td><b>Basic strike</b></td><td>Attack with the equipped weapon</td><td
											>The time and fate cost set by the weapon equipped</td
										><td>Once per turn</td></tr
									>
									<tr
										><td><b>Interact</b></td><td>Interact with what's on a tile</td><td
											>Each kind of interaction has its own cost</td
										><td>As many times as your hours allow</td></tr
									>
									<tr
										><td><b>Work</b></td><td
											>Work the tile you're on, or speed up something in progress there</td
										><td>Time</td><td>Once per tile and once per person, each turn</td></tr
									>
									<tr
										><td><b>Fortify</b></td><td>Dig in: gain shielding and draw a combat card</td
										><td>A lot of hours (about 3–4)</td><td><span class="open">Open</span></td></tr
									>
								</tbody>
							</table>
						</div>
						<h3>Move</h3>
						<ul>
							<li>Click a unit or a corps to select it, then drag to the tile you want.</li>
							<li>
								Everyone selected moves, and every one of them spends the time it takes to get
								there. You move whole tiles.
							</li>
						</ul>
						<h3>Basic strike</h3>
						<ul>
							<li>
								Usable exactly once per turn. The rest of your damage comes from playing cards.
							</li>
							<li>
								Every <button type="button" class="link" on:click={() => pickTab('items')}
									>weapon</button
								> has its own time and fate cost for its basic strike. Melee weapons cost less fate than
								ranged ones.
							</li>
						</ul>
						<p class="aside">
							<span class="open">Open</span> The actual time and fate cost for each weapon, and for striking
							with no weapon.
						</p>
						<h3>Interact</h3>
						<ul>
							<li>
								Interacting with a tile does something that depends on what's there. Interacting
								with a shop, for example, opens the shop.
							</li>
							<li>
								Learning about the land isn't part of it: that's what the explore cards (and sense)
								are for.
							</li>
							<li>Every interaction has its own cost.</li>
							<li>
								There's no limit per turn: you can interact as many times as your hours allow.
							</li>
						</ul>
						<p class="aside">
							<span class="open">Open</span> What each interaction costs (time, fate or something else).
						</p>
						<h3>Work</h3>
						<ul>
							<li>Works the tile you're on, the same way the explore cards work a known tile.</li>
							<li>
								It can also speed up something in progress on the tile, like a building going up.
							</li>
							<li>
								<b>Once per tile, once per person.</b> Each turn only one person can work a given tile,
								and each person can only work once. Both reset at the end of the turn.
							</li>
						</ul>
						<p class="aside">
							<span class="open">Open</span> How long working takes, what it gives on each kind of tile,
							and how much it speeds things up.
						</p>
						<h3>Fortify</h3>
						<ul>
							<li>Like fortifying in Civilization VI: you spend most of your turn digging in.</li>
							<li>It takes a lot of hours, about 3–4.</li>
							<li>
								You gain <b>shielding</b> (damage absorbed once), an amount based on the
								<b>armor</b>
								you're wearing and the <b>protection</b> it gives (how much it cuts the damage you take).
							</li>
							<li>You draw a combat card, which can be offensive or defensive.</li>
						</ul>
						<p class="aside">
							<span class="open">Open</span> The exact hours, how much shielding it gives, how long the
							shielding lasts, and whether it's limited per turn.
						</p>
					</section>
					<section>
						<h2>Starting deck</h2>
						<p>
							The starting deck is 8 fixed cards, plus attacks from your starting weapon and blocks
							from your starting defensive gear, so its size depends on what you start with.
						</p>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Card</th><th>Copies</th><th>Effect</th></tr></thead>
								<tbody>
									<tr
										><td><b>Explore</b></td><td>4</td><td
											>On an unknown tile, reveals details about it (explores it). On a known tile,
											works it</td
										></tr
									>
									<tr><td><b>Soothe</b></td><td>1</td><td>1 mana: heal 5</td></tr>
									<tr
										><td><b>Extract</b></td><td>1</td><td
											>A spell: pick up to 5 things to turn into magic essence, from stacks of up to
											10 resources, single gold stacks, or the tile you are on (see Building)</td
										></tr
									>
									<tr
										><td><b>Sense</b></td><td>1</td><td
											>A spell, and a stronger explore that costs mana: shows more detail, and can
											show what you're near too</td
										></tr
									>
									<tr
										><td><b>Outpost blueprint</b></td><td>1</td><td
											>Builds an outpost. It has exhaust: once played it's swapped for an exhaustion
											card until it comes back (see Building)</td
										></tr
									>
									<tr
										><td><b>Basic block</b></td><td>Depends on gear</td><td
											>Triggers the block effect of your armor, weapon or shield. How many you get
											depends on your starting gear</td
										></tr
									>
									<tr
										><td><b>Weapon attacks</b></td><td>1–3, by weapon</td><td
											>Attack cards from your starting weapon. How many depends on the weapon</td
										></tr
									>
								</tbody>
							</table>
						</div>
						<p class="aside">
							<span class="open">Open</span> What a basic block costs, what explore, extract, sense and
							the weapon attacks cost, and whether units start with the same deck.
						</p>
					</section>

					<section>
						<h2>Adding cards to your deck</h2>
						<p>
							New cards come into your deck in two main ways: you learn them, or your gear gives
							them to you.
						</p>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Cards</th><th>How you get them</th></tr></thead>
								<tbody>
									<tr
										><td><b>Spells</b></td><td
											>Only by learning: on the study screen, from a teacher, or from a tutor</td
										></tr
									>
									<tr
										><td><b>Other actions</b></td><td
											>Learned the same way as spells, or from gear. Buying a pickaxe, for example,
											gives you a copy of its mine action</td
										></tr
									>
								</tbody>
							</table>
						</div>

						<h3>Learning</h3>
						<ul>
							<li>
								<b>The study screen</b> is the knowledge shop: 4 spells, 3 buildings (blueprints) and
								2 traits. It only takes knowledge: no gold or silver.
							</li>
							<li>
								<b>Teachers and tutors</b> work much the same way, and are where money comes in: they
								cost gold as well as knowledge. They let you pick a specific card, even a legendary,
								instead of the study screen's random options. Teachers are people you meet or units who
								know the subject; a unit's bonus as a teacher at a school comes from how much it knows
								of that subject.
							</li>
						</ul>

						<h3>Learning rate</h3>
						<ul>
							<li>
								<b>Intelligence</b> multiplies the points you earn towards learning every spell and other
								skill: 80 intelligence means you get 80% of the points.
							</li>
							<li>
								<b>Casting a spell makes others cheaper to learn.</b> Every cast takes 1 off the cost
								of learning any spell, 5 off spells of the same school, and 25 off that exact spell (if
								you don't own it yet, like a generated one). The discounts are permanent for the rest
								of the run.
							</li>
							<li>
								<b>Knowledge bias:</b> units learn each trait line at a bonus of (bias − 50), on a 0–100
								scale.
							</li>
							<li>
								<b>Other modifiers:</b> Bex's elbow pads give +1 knowledge a part of day to everyone
								within 2 hexes. Alcohol raises morale but slows learning. Fore thought gives about 5%
								more learning, but a quarter of your knowledge goes towards discounting the purchase
								after next.
							</li>
						</ul>

						<h3>Research</h3>
						<ul>
							<li>
								The <b>research bar</b> runs from 0 to 10 and fills with a tenth of the knowledge you
								gain, plus extra from universities, books, scrolls and research projects.
							</li>
							<li>
								Each level raises the odds of rarer cards, and levels 2, 4 and 6 add a spell, a
								building and a trait to the study screen. An average run should reach level 4, a
								solid one 6.
							</li>
							<li>
								<b>Mystical spells</b> can only be learned from level 8, so they're usually out of reach.
							</li>
						</ul>
						<p class="aside">
							<span class="open">Open</span> How the study screen is laid out, and whether a gear card
							leaves your deck when you sell or unequip the gear.
						</p>
					</section>

					<section>
						<h2>Building</h2>
						<p>Building something takes two steps:</p>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Step</th><th>What it is</th><th>Cost</th></tr></thead>
								<tbody>
									<tr
										><td><b>1. Blueprint</b></td><td>Learning how to build it</td><td>Knowledge</td
										></tr
									>
									<tr
										><td><b>2. Building</b></td><td>Actually putting it up</td><td
											>Resources (wood, iron and so on). Whatever you're short of is covered by
											magic essence</td
										></tr
									>
								</tbody>
							</table>
						</div>
						<p>
							Blueprints come from the study screen, like spells, and the buildings themselves are
							listed under <button type="button" class="link" on:click={() => pickTab('rules')}
								>Buildings</button
							>
							in the rules draft.
						</p>

						<h3>Blueprints are cards</h3>
						<p>
							A blueprint you learn goes into your deck. You draw it like any other card, and play
							it from your hand to build.
						</p>
						<ul>
							<li>
								<b>Capped.</b> Some blueprints can only be played a set number of times. A legendary
								one is usually once.
							</li>
							<li><b>Uncapped.</b> Others can be built as often as you draw them.</li>
							<li>
								<b>Exhaust.</b> A blueprint with the exhaust keyword is out once played, until it
								comes back, and an exhaustion card takes its place (see
								<button type="button" class="link" on:click={() => pickTab('rules')}>Exhaust</button
								> in the rules draft). In practice that's about once every two weeks. Your starting outpost
								blueprint works this way.
							</li>
						</ul>
						<p class="aside">
							<span class="open">Open</span> Whether a capped blueprint leaves your deck once it's used
							up.
						</p>

						<h3>Magic essence (ME)</h3>
						<p>
							Magic essence comes from alchemy: the idea that there is one thing everything is made
							of. That's why it can stand in for any resource you don't have.
						</p>
						<ul>
							<li>
								<b>Extracting gold</b> with the extract spell makes magic essence without using the gold
								up.
							</li>
							<li>
								<b>Extracting any other resource</b> destroys it, converting it into magic essence at
								some rate.
							</li>
							<li><b>Gold</b> also makes magic essence passively.</li>
						</ul>

						<h3>The extract spell</h3>
						<ul>
							<li>
								<b>Up to 5 slots.</b> Each cast lets you pick up to 5 things to extract from.
							</li>
							<li>
								<b>What fits in a slot</b> by default: a stack of up to 10 of a resource that can be
								converted, or a single stack of gold (a nugget, an ingot or a block).
							</li>
							<li>
								<b>The tile you're on</b> shows up as an option when it can be extracted. It takes up
								several slots (usually about 3), destroys the resource on the tile, and gives you a lot
								of it.
							</li>
						</ul>
						<p class="aside">
							<b>Before resources unlock.</b> To keep the early game simple there are no resources to
							convert at first, and magic essence is the only thing extraction makes. Until resources
							are unlocked (the first unlock), the extract spell can only extract gold, or destroy a
							tile's resource for magic essence instead of getting the resource itself. Buildings are
							paid for in magic essence alone.
						</p>

						<h3>Gold</h3>
						<p>
							Gold comes in three sizes. Nine of one size merge into one of the next. Gold passively
							makes the same amount of mana and magic essence. Extracting gold gives ten times as
							much magic essence.
						</p>
						<div class="table-wrap">
							<table>
								<thead
									><tr
										><th>Gold</th><th>Made from</th><th>Mana (passive)</th><th>ME (passive)</th><th
											>ME (extracted)</th
										></tr
									></thead
								>
								<tbody>
									<tr><td><b>Nugget</b></td><td>Found</td><td>0.01</td><td>0.01</td><td>0.1</td></tr
									>
									<tr><td><b>Ingot</b></td><td>9 nuggets</td><td>0.1</td><td>0.1</td><td>1</td></tr>
									<tr><td><b>Block</b></td><td>9 ingots</td><td>1</td><td>1</td><td>10</td></tr>
								</tbody>
							</table>
						</div>
						<p class="aside">
							<span class="open">Open</span> Whether the passive amounts are per turn, the rate other
							resources convert at, and how long extracting takes.
						</p>
					</section>

					<section>
						<h2>How a run ends</h2>
						<p>
							A run ends once both wizards are gone. Each wizard is gone when they either die or
							leave, so one dying and the other leaving ends it too.
						</p>
						<ul>
							<li><b>Dying.</b> A wizard whose health hits zero dies.</li>
							<li>
								<b>Leaving.</b> A wizard can leave voluntarily, or leaves when their morale drops to
								zero.
							</li>
						</ul>
						<h3>Failing the king's ransom</h3>
						<p>
							Not paying the king's ransom doesn't end the run on its own. Instead it wears you down
							towards the conditions above:
						</p>
						<ul>
							<li><b>Morale drops</b>, and the drop keeps growing.</li>
							<li>
								<b>The king remembers.</b> Across runs, that king comes to dislike that wizard, and gives
								less funding overall.
							</li>
							<li><b>The king's units turn hostile.</b></li>
						</ul>
						<p>
							Together these drain your health and morale until a wizard dies or leaves, but they're
							never an instant fail.
						</p>
						<p class="aside">
							<span class="open">Open</span> How fast the morale drop grows, how long the king's dislike
							lasts, and whether paying late stops it.
						</p>
					</section>
				</article>
			{:else if tab === 'rules'}
				<article class="rules">
					<p class="intro">
						A first draft, gathered from the notes. Most of this is ideas still being explored, not
						decisions. Where the notes give more than one way to do something, the options are
						listed side by side. Some details come from the older prequel design docs; where those
						disagree with the newer notes, the older version is marked "Earlier draft".
					</p>

					<nav class="toc" aria-label="Rules contents">
						<a href="#wl-run">A run</a>
						<a href="#wl-map">The map</a>
						<a href="#wl-time">Time</a>
						<a href="#wl-party">Your party</a>
						<a href="#wl-units">Units</a>
						<a href="#wl-stats">Stats</a>
						<a href="#wl-bars">The four bars</a>
						<a href="#wl-fate">Fate</a>
						<a href="#wl-draw">Drawing cards</a>
						<a href="#wl-exhaust">Exhaust</a>
						<a href="#wl-corps">Corps</a>
						<a href="#wl-combat">Combat</a>
						<a href="#wl-energy">Fatigue</a>
						<a href="#wl-cards">Learning spells</a>
						<a href="#wl-research">Knowledge & research</a>
						<a href="#wl-shops">Shops & rewards</a>
						<a href="#wl-resources">Resources</a>
						<a href="#wl-buildings">Buildings</a>
						<a href="#wl-food">Food</a>
						<a href="#wl-morale">Morale & traits</a>
						<a href="#wl-faith">Faith</a>
						<a href="#wl-fame">Fame & morality</a>
						<a href="#wl-progress">Progression</a>
						<a href="#wl-epithets">Epithets</a>
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
								<b>Missing a payment</b> doesn't end the run, but it drains morale, sours the king
								on you across runs, and turns his units hostile (see
								<button type="button" class="link" on:click={() => pickTab('gameplay')}
									>Gameplay</button
								>).
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
							towards leveling and notoriety.
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
								<b>Rumors.</b> Locations appear in the fog as rumors, like in At the Gates. A rumored
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
						<h3>Biomes</h3>
						<p>
							Biomes spawn with some randomness and decide how many resources an area has. The harsh
							ones sit closer to the City of Gold.
						</p>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Biome</th><th>What it's like</th></tr></thead>
								<tbody>
									<tr
										><td><b>Plains</b></td><td
											>Good for food and large game, and easy to move through</td
										></tr
									>
									<tr
										><td><b>Forest</b></td><td
											>Good for production and smaller game, and harder to move through</td
										></tr
									>
									<tr
										><td><b>Rivers</b></td><td
											>Can run through any biome, give bonuses, and are a cheap way to travel
											downstream</td
										></tr
									>
									<tr
										><td><b>Enchanted forest</b></td><td
											>Near the city. A better forest: gold turns up more, and its animals are
											stronger</td
										></tr
									>
									<tr
										><td><b>Lava flow range</b></td><td
											>Near the city. No food, heavy production, and bigger than most. Lava can't be
											crossed, so you have to wind around it</td
										></tr
									>
									<tr
										><td><b>Ice arctic</b></td><td
											>Near the city. No food, bigger than most, with blizzards and ice monsters
											from Inuit legend, and yetis</td
										></tr
									>
								</tbody>
							</table>
						</div>
						<p>
							Tiles can also hold resources beyond their base yield: iron deposits (iron can stand
							in for ME at a blacksmith, or become steel), wood from forests, cloth from cotton and
							sheep, gold and gems in the mountains, oil in deserts and tundra, and salt and spice.
						</p>
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
								<b>A day is five turns:</b> morning, noon, evening, night 1 and night 2. Daylight is
								for exploring, and night is when your bases can be attacked. Some units are stronger
								at certain times, and some areas are worse at others (a desert at noon).
							</li>
							<li>
								<b>Actions take hours.</b> Each part of the day is 5 hours, and every wizard and unit
								has their own 5 hours, all spent in parallel, on actions: explore further, boost morale,
								rest, work the land. You don't normally gain more hours, unless you can turn time like
								Thomas. Items make actions faster (a pickaxe speeds up mining).
							</li>
							<li>
								<b>Moving.</b> Your speed is how many movement points you get per hour. You move whole
								tiles, but the time is counted to the nearest tenth of an hour, so a tile that takes
								part of an hour only uses that part.
							</li>
							<li>
								<b>A moon cycle</b> is 2 "weeks" of 5 days: 10 days, or 50 turns, from new moon to full
								moon. Your deck resets at the end of each one, not when you rest.
							</li>
							<li>
								<b>Seasons and years</b> could exist too. A lot of witchcraft and the occult follows
								the moon. Some crops only grow in some seasons. A run could start in any season, each
								with its own bonuses: in winter ice spells are stronger and food is scarce.
							</li>
						</ul>
					</section>

					<section id="wl-party">
						<h2>Your party</h2>
						<ul>
							<li>
								<b>You are the wizards</b>, not the leader of an army that happens to have wizards
								in it. You play as two wizards, or a wizard and an apprentice.
							</li>
							<li>
								<b>Units</b> join you: workers, soldiers, traders, librarians. They're lesser
								wizards you don't fully control (see <a href="#wl-units">Units</a>). Horses can work
								too, like at a farm.
							</li>
							<li>
								<b>Orders.</b> Units act on orders, like in Old World. An order costs the wizard who
								gives it actions (time), more the further away the unit is and the less it likes you.
								Specially trained units don't need orders for what they're trained in.
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
								<b>Corps.</b> Units can stack on one tile in an order, front to back (see
								<a href="#wl-corps">Corps</a>). A corps is slower but has more stamina. Ordering the
								leader moves the whole corps. A "follow the leader" mode makes a line, and a
								trailblazing leader speeds up the rest.
							</li>
							<li>
								<b>Outposts.</b> You can build one ring of buildings around an outpost (see
								<a href="#wl-buildings">Buildings</a> for how big each kind of base is). Buildings make
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

					<section id="wl-units">
						<h2>Units</h2>
						<p>
							Units are lesser wizards that you don't fully control. They have the same stats as a
							wizard, usually lower, and the same four bars, plus a <b>loyalty</b> bar. They work tiles,
							build and upgrade, and carry weapons. Each costs food, and silver too if they're hired
							or need supplying.
						</p>
						<ul>
							<li>
								<b>Specialties are traits.</b> There's no separate specialty system: units start with
								some traits and learn more, and the old specialties are those traits. A unit's first
								farming trait makes it a farmer, and upgrades are rarer traits further along.
							</li>
							<li>
								<b>Getting units.</b> Buy them (once), hire them (ongoing pay), lure them (they move
								to one of your outposts) or find them (some events give you one).
							</li>
							<li>
								<b>Learning traits.</b> Units learn by doing the work (farming leads to the farming trait,
								using a bow to the archer trait). It's faster at a school, slower from sharing a tile
								with someone who has the trait, or you can pay someone you meet to teach it.
							</li>
							<li>
								<b>Knowledge bias.</b> Every unit has a bias from 0 to 100 for each trait line, and learns
								it at a bonus of (bias − 50). Some events nudge a bias, like finding a location of legend.
							</li>
							<li>
								<b>Fate.</b> Every unit rolls a d4 at the start of the turn, which only it can use. Your
								wizards can also hand it fate from their shared pool when they give it an order, as part
								of the same action.
							</li>
							<li>
								<b>Civilian or military.</b> Civilian units never start a fight: they only defend when
								they must, or join an attack someone else started. Military traits let a unit start combat
								and defend places.
							</li>
							<li>
								<b>Inhuman units</b> like a dragon, a dog or a bird (which can fly out and scout) can't
								learn traits, but start stronger or with unique abilities.
							</li>
						</ul>
						<p>
							Units' traits, the starting ones and their upgrades, are listed on the
							<button type="button" class="link" on:click={() => pickTab('traits')}>Traits</button> tab.
						</p>
					</section>

					<section id="wl-stats">
						<h2>Stats</h2>
						<p>
							Every character has seven stats: four physical and three mental. In combat they count
							at a tenth of their value; out of combat they count in full.
						</p>
						<div class="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Type</th>
										<th>Stat</th>
										<th>In combat (÷10)</th>
										<th>Out of combat</th>
									</tr>
								</thead>
								<tbody>
									<tr>
										<td rowspan="4"><b>Physical</b></td>
										<td><b>Speed</b></td>
										<td>How many cards you draw: 1 per 10 speed</td>
										<td>Movement points per hour, exactly (50 speed → 50 points)</td>
									</tr>
									<tr>
										<td><b>Strength</b></td>
										<td>Added to your attacks' damage</td>
										<td>How much you can carry</td>
									</tr>
									<tr>
										<td><b>Fortitude</b></td>
										<td>Physical protection</td>
										<td>Your maximum morale</td>
									</tr>
									<tr>
										<td><b>Endurance</b></td>
										<td>How fast your draw counter goes down</td>
										<td>The size of your energy bar</td>
									</tr>
									<tr>
										<td rowspan="3"><b>Mental</b></td>
										<td><b>Intelligence</b></td>
										<td>Lowers your spells' fate cost</td>
										<td>How fast you learn every spell and other skill (80 → 80% of points)</td>
									</tr>
									<tr>
										<td><b>Swagger</b></td>
										<td>Spell draws: swagger ÷ 10, multiplied by magic ability ÷ 100</td>
										<td>
											Helps relationships and trading, like charisma for negotiating in D&amp;D
										</td>
									</tr>
									<tr>
										<td><b>Magic ability</b></td>
										<td>÷ 100, multiplies your spell draws (swagger ÷ 10 × magic ability ÷ 100)</td>
										<td>The multiplier on the mana you generate</td>
									</tr>
								</tbody>
							</table>
						</div>
						<ul>
							<li>
								<b>Mana</b> is, by default, the sum of your other stats (speed, strength, fortitude,
								endurance, intelligence and swagger) × magic ability ÷ 100.
							</li>
							<li>
								Draw rate can be a decimal. Wizards get +0.5 draws a turn for the magic flowing
								through them which is most of the difference between a wizard and a unit.
							</li>
							<li>
								Characters can lean physical (more food) or mental (more rest), or somewhere in
								between. Food drops faster the higher your physical stats, and energy drops faster
								the higher your mental ones (see <a href="#wl-bars">the four bars</a>).
							</li>
						</ul>
					</section>

					<section id="wl-bars">
						<h2>The four bars</h2>
						<p>
							Four bars decide how a wizard is doing: <b>health</b>, <b>energy</b>, <b>morale</b>
							and
							<b>food</b>. Two of them end a wizard, and the other two drain those.
						</p>
						<div class="table-wrap">
							<table>
								<thead>
									<tr><th>Bar</th><th>Size</th><th>At zero</th></tr>
								</thead>
								<tbody>
									<tr
										><td><b>Health</b></td><td><span class="open">Open</span></td><td
											>The wizard dies</td
										></tr
									>
									<tr><td><b>Morale</b></td><td>Fortitude</td><td>The wizard leaves</td></tr>
									<tr
										><td><b>Food</b></td><td
											><span class="open">Open</span> (the desert tummy trait raises it)</td
										><td>Health starts to drain</td></tr
									>
									<tr><td><b>Energy</b></td><td>Endurance</td><td>Morale starts to drain</td></tr>
								</tbody>
							</table>
						</div>

						<h3>Health</h3>
						<ul>
							<li>
								<b>Goes down</b> from damage in combat (fortitude gives physical protection), from ailments
								like poison, and once food hits zero. Too much cold hurts too, if temperature is on.
							</li>
							<li>
								<b>Comes back</b> slowly on its own each turn, by a share of max health that depends
								on how you spent your hours:
								<div class="table-wrap">
									<table>
										<thead
											><tr><th>Hours spent</th><th>Heals (of max health, per turn)</th></tr></thead
										>
										<tbody>
											<tr><td><b>Active</b></td><td>1%</td></tr>
											<tr
												><td><b>Resting</b> (hours left unused, or spent on rest actions)</td><td
													>2%</td
												></tr
											>
											<tr><td><b>Sleeping</b> (only ever a whole turn)</td><td>4%</td></tr>
										</tbody>
									</table>
								</div>
								A turn that mixes them heals the weighted average: 2 hours active and 3 resting heals
								(2 × 1% + 3 × 2%) ÷ 5 = 1.6%. A whole turn asleep heals 4%.
							</li>
							<li>
								<b>To heal quickly:</b> healing spells (Heal works in and out of combat), potions, divine
								healing paid for with faith, and healing aids like a crutch. A holy elemental sword heals
								every friendly unit 1, and fruit heals a little.
							</li>
							<li>
								<b>Places that heal:</b> people heal faster near the Fountain of Youth, at holy sites
								built by a religious leader, and in warm springs like Krosslaug.
							</li>
							<li>Endurance decides how fast ailments like poison wear off.</li>
							<li>A 1UP potion revives a character the moment they die.</li>
						</ul>

						<h3>Morale</h3>
						<ul>
							<li>
								<b>Drifts down every turn.</b> A beautiful tile slows the drop, and an ugly one speeds
								it up. It drains once energy hits zero.
							</li>
							<li>
								<b>Fights:</b> killing an enemy boosts the killer's morale, and winning a fight boosts
								everyone's. A friend dying changes it depending on how close they were, or how much they
								hated each other.
							</li>
							<li>
								<b>Desires</b> boost it when met and lower it when they aren't.
							</li>
							<li>
								<b>Raised by:</b> relaxing (more with others), spice with a meal, a chef or foodie in
								the group, alcohol (which slows learning), a love letter, the lyre, a wine party, toys
								from Santa's workshop, holy sites, and companions with high swagger. Pirates get +2 while
								sailing, and their crew +1.
							</li>
							<li>
								Hera's marriage means 5% less morale lost while the two wizards are together. Money
								can keep units' morale up if they need all four food types.
							</li>
							<li>
								Units also have a <b>loyalty</b> bar, which decides how much an outpost sends you.
							</li>
						</ul>

						<h3>Food</h3>
						<ul>
							<li>
								<b>Goes down over time</b>, faster the higher your physical stats. At zero you're
								starving, and health drains.
							</li>
							<li>
								<b>Eating</b> fills it, and a balanced meal fills it more (see
								<a href="#wl-food">Food</a> for types and slots). The cornucopia fits any slot for free.
							</li>
							<li>
								Survivalists need 1 less food a turn, and the Cauldron of the Dagda means its holder
								never needs food. Scavengers get more food from hunting.
							</li>
							<li>A wine party fills hunger a little, along with morale and some energy.</li>
						</ul>

						<h3>Energy</h3>
						<ul>
							<li>
								<b>Goes down with every action</b>, since every action is work, unless that action
								has the <b>rest</b> trait (reading, for example). It drops faster the higher your mental
								stats. A low-level character working flat out tires in 2–3 days.
							</li>
							<li>
								<b>Also drained by</b> carrying too much (weighed down), skipping sleep (a fatigue card),
								heat if temperature is on, and Sid's escape hatch (75% of his current energy).
							</li>
							<li>
								<b>Rest refills it:</b>
								<b>sleeping</b> is night only and the best rest. It takes a whole turn, and you draw
								no cards the turn after, but you can be attacked in the night, and units woken up
								are startled. <b>Napping</b> is sleep during the day: less than sleeping, more than
								relaxing. <b>Relaxing</b> is daytime and the least rest, but boosts morale, and units
								who relax together get on better.
							</li>
							<li>
								<b>Helps:</b> a pillow or mattress, a wine party, and the Fountain of Youth (3 rest a
								part of day for units within 3 tiles). An energy drink gives +15 energy now but −6 for
								each of the next 3 turns, so it costs 3 overall.
							</li>
							<li>
								<b>Saves energy:</b> the General's whistle makes orders cheaper. Tools like the pickaxe
								and plow make actions faster instead, so they take fewer hours.
							</li>
							<li>
								<b>Mana is separate.</b> Spells cost mana, counted the usual card-game way, not energy.
							</li>
						</ul>
						<p class="aside">
							<span class="open">Open</span> Is thirst a fifth bar, or a difficulty setting?
						</p>
					</section>

					<section id="wl-fate">
						<h2>Fate</h2>
						<p>
							There's no chance system: nothing succeeds or fails on a hidden roll, so you can plan
							around everything. Instead, Wealthless Wizards uses the fate system from
							<a href={resolve('/WealthyWizards')}>Wealthy Wizards</a>.
						</p>
						<ul>
							<li>
								<b>Every wizard has their own fate</b>, a modifier that can be positive or negative.
							</li>
							<li>
								<b>Roll at the start of each turn:</b> a d20 for each wizard, plus that wizard's fate.
							</li>
							<li>
								<b>One shared pool.</b> Both wizards' totals are added together, and either wizard can
								spend from it. Wizards can hand some to a unit when they give it an order, as part of
								that action, so the unit can take actions that need fate.
							</li>
							<li>
								<b>Units roll a d4</b> each turn, for their own use only.
							</li>
							<li>
								<b>Fate replaces chance.</b> Anything that used to have a chance of working now costs
								fate instead, and works if you can pay. Bonuses that used to raise a chance now lower
								the fate cost.
							</li>
							<li>
								<b>Costs by kind:</b> in general, melee attacks cost less fate than ranged attacks, and
								ranged attacks cost less than spells.
							</li>
							<li>
								<b>Tiered and repeatable spells.</b> Some spells can be cast at a higher tier, or again,
								by paying more fate.
							</li>
							<li>
								<b>Randomness can still exist</b> in places, but never in whether a spell succeeds or
								fails.
							</li>
							<li>
								<b>Religion is mostly a way of manipulating fate.</b> The evil (dark) side exploits
								it, and the good (holy) side aligns you with it. See <a href="#wl-faith">Faith</a>.
							</li>
							<li>
								When a character dies they lose 1 fate permanently. Reaching a certain level gains 1
								fate (2 if they're behind).
							</li>
						</ul>
						<p class="aside">
							<span class="open">Open</span> Whether the rest of Wealthy Wizards' fate rules carry over:
							overspending at a cost, saving leftover fate, and losing your turn when the roll comes
							out below 0.
						</p>
					</section>

					<section id="wl-draw">
						<h2>Drawing cards</h2>
						<ul>
							<li>
								<b>Starting deck:</b> 4 explore (explores a tile, or works one you know), 1 soothe,
								1 extract, 1 sense, 1 outpost blueprint, plus basic blocks from your starting
								defensive gear and 1–3 attacks from your starting weapon, so the size depends on
								what you start with. See
								<button type="button" class="link" on:click={() => pickTab('gameplay')}
									>Gameplay</button
								>.
							</li>
							<li>
								<b>Everyone has their own hand.</b> Both wizards and every unit you control hold and
								play their own cards.
							</li>
							<li>
								<b>Draws per turn:</b> 1 card for every 10 speed (50 speed draws 5).
							</li>
							<li><b>After sleeping</b> you draw no cards at all that turn.</li>
							<li>
								<b>Spell draws:</b> extra draws that only pull spells, equal to swagger ÷ 10 × magic
								ability ÷ 100 (50 swagger and 80 magic ability give 4). They still come from the same
								deck, not a separate spell deck.
							</li>
							<li>
								<b>Tutored draws</b>, which fetch a particular kind of card, take a random matching
								card from the deck, not the first one in it.
							</li>
						</ul>
					</section>

					<section id="wl-exhaust">
						<h2>Exhaust</h2>
						<p>
							Exhaust is a keyword on cards that shouldn't come round every time you cycle your
							deck, like some blueprints. In practice an exhaust card comes round about once every
							two weeks.
						</p>
						<ul>
							<li>
								<b>Playing an exhaust card</b> takes it out of your deck, and puts an
								<b>exhaustion</b> card in its place.
							</li>
							<li>
								<b>Exhaustion</b> costs 0.5 mana and 1 hour, and draws 1 card. It's a dead card that
								cycles: playing it only replaces itself.
							</li>
							<li>
								<b>Holding it hurts.</b> If exhaustion is still in your hand at the end of your turn,
								you lose 1 energy.
							</li>
							<li>
								<b>Coming back.</b> An exhausted card returns later. Cupid's arrow, for example, comes
								back after a recall effect.
							</li>
						</ul>
						<p class="aside">
							<span class="open">Open</span> What brings an exhausted card back in general, and whether
							its exhaustion card leaves the deck when it does.
						</p>
					</section>

					<section id="wl-corps">
						<h2>Corps</h2>
						<p>
							Units can form a <b>corps</b>: they stack on a single tile and move as one. You put
							them in order, one unit to each place, so by default a corps holds up to 3:
							<b>front</b>, <b>middle</b> and <b>back</b>.
						</p>
						<h3>Attacking a corps</h3>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Attack</th><th>Who it can hit</th><th>Extra fate</th></tr></thead>
								<tbody>
									<tr><td><b>Melee</b></td><td>Only the front unit</td><td>None</td></tr>
									<tr
										><td><b>Ranged</b></td><td>One specific unit, anywhere in the order</td><td
											>1 per place back (2 to reach the back of 3)</td
										></tr
									>
									<tr><td><b>Area (AOE)</b></td><td>Everyone</td><td>None</td></tr>
								</tbody>
							</table>
						</div>
						<h3>Shared protection</h3>
						<p>
							The catch with standing further back: everyone in front of you adds to your
							protection. The back unit gets bonuses from both units ahead of it, the middle from
							the front. There's no minimum damage, so a well-protected unit can take 0 from a hit.
						</p>
						<h3>Flanking</h3>
						<ul>
							<li>
								<b>Partly flanked</b> (enemies on 2 tiles around the corps that aren't next to each other:
								the second one is on any of the 3 tiles roughly opposite the first): attackers can hit
								anyone in it and pay no extra fate, and only half the shared protection applies.
							</li>
							<li>
								<b>Fully surrounded</b> (3 enemies evenly spaced around it, or 4 anywhere around it):
								attacks ignore shared protection completely.
							</li>
							<li>
								Flanking never gets past <b>personal protection</b>, the protection a unit has from
								its own armor and fortitude.
							</li>
							<li>
								<b>Lobbed</b> is a keyword on attacks: a lobbed attack ignores shared protection for
								its damage, but still pays the extra fate to reach further back.
							</li>
						</ul>
						<p class="aside">
							<span class="open">Open</span> How much protection each unit in front shares, and what
							barreling attacks do now.
						</p>
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
								In a corps, units in front protect the ones behind (see <a href="#wl-corps">Corps</a
								>). Range decides where you can stand and who you can reach.
							</li>
							<li>
								<b>Lobbed</b> attacks (like a bow) ignore a corps' shared protection for damage, but
								not for fate (see <a href="#wl-corps">Corps</a>). <b>Barreling</b> attacks hit the front.
							</li>
							<li>
								Flanking a corps lets attackers reach anyone in it, and weakens or removes its
								shared protection.
							</li>
							<li>
								You can move between hexes during a fight, which costs movement. Summons can come in
								from different directions. <span class="open">Open</span> How to handle enemies spread
								over several hexes, and reinforcements.
							</li>
						</ul>
						<h3>Cards</h3>
						<ul>
							<li>
								Each card lists three values: its cost (actions or mana), its damage bonus (usually
								strength) and its fate cost (lowered by intelligence).
							</li>
							<li>
								Spells and attacks share one deck. Speed sets your draws and swagger and magic
								ability add spell-only draws (see <a href="#wl-draw">Drawing cards</a>).
							</li>
							<li>
								Each character can carry unspent mana over to their next turn, up to a maximum: 1 by
								default, and items can raise it. The cap is what stops you over-preparing; to save
								more, brew it into liquid mana potions. Mana can turn into actions (neutral mana →
								mana → neutral action → action).
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
							<li>
								In-combat upgrades (lower cost, more damage) last until your deck resets at the end
								of the moon cycle.
							</li>
						</ul>
						<div class="options">
							<h4>Earlier draft</h4>
							<p>
								Everyone in the fight shares one combined deck. Draw 2 cards per wizard and 1 per
								unit. Each wizard has their own mana, plus a party pool anyone can spend.
							</p>
						</div>
						<h3>Day and night</h3>
						<ul>
							<li>By day, whoever starts a fight attacks, and it opens in attack mode.</li>
							<li>
								At night your units and buildings can be attacked. The chance grows with how much
								unexplored land is nearby and how dangerous it is.
							</li>
							<li>
								Defenders get a bonus from the building they're in. Units woken up by an attack are
								<b>startled</b>, a debuff.
							</li>
						</ul>
						<h3>Spell schools</h3>
						<ul>
							<li><b>Physical:</b> weak on its own, and grows with strength.</li>
							<li><b>Fire:</b> damage.</li>
							<li><b>Ice:</b> protection and slowing.</li>
							<li><b>Dark:</b> high power, at a cost other than mana.</li>
							<li><b>Arcane:</b> all-round.</li>
							<li><b>Divine:</b> <span class="open">Open</span></li>
						</ul>
						<h3>Weapons and armor</h3>
						<ul>
							<li>
								<b>Armor</b> is what you wear. It gives <b>protection</b>, which cuts the damage you
								take from every hit. Protection is <b>physical</b>, <b>magical</b> or
								<b>universal</b> (either kind). Fortitude gives physical protection.
							</li>
							<li>
								<b>Shielding</b> absorbs damage once, then it's gone. Fortifying and some cards give
								it.
							</li>
							<li>
								A weapon changes one kind of spell or keyword: extra damage, a mana discount, a
								bonus effect, or a "whenever you cast" effect. It can also add copies of its own
								cards.
							</li>
							<li>Equipment slots: hand, off-hand and clothes (or hat, chest and lower).</li>
							<li>
								<b>Shields</b> work like weapons: they power basic block cards, or add a special card
								of their own to your deck that does something based on the shield. There's no direction
								to pick; flanking covers that.
							</li>
							<li>
								Bows could need arrows, with special arrows too. Thrown weapons leave your deck
								until you pick them up.
							</li>
						</ul>
						<h3>Buildings in combat</h3>
						<ul>
							<li><b>Obelisk:</b> +1 to all combat within 1 hex.</li>
							<li>
								<b>Archer tower:</b> start each combat with some 0-cost damage spells that draw a
								card. It can be upgraded to a <b>spotlight</b>, which costs light each night but
								sees further and makes attacks less likely.
							</li>
							<li><b>Fortifications:</b> every unit starts combat with 1 shielding.</li>
						</ul>
					</section>

					<section id="wl-energy">
						<h2>Fatigue</h2>
						<p>
							Your <b>energy bar</b> is one of <a href="#wl-bars">the four bars</a>. Fatigue is how
							a tired character's deck gets worse.
						</p>
						<ul>
							<li>
								When your deck reshuffles, you get a <b>fatigue</b> card. The first costs 0 to play,
								and each one after costs 1 more, up to 10.
							</li>
							<li>
								Your deck resets once a moon cycle (every 50 turns): all fatigue clears, the counter
								resets and you draw a new hand.
							</li>
							<li>Not sleeping adds a fatigue card.</li>
							<li>
								Carrying too much adds <b>weighed down</b> cards (1 mana: draw a card) to your deck,
								more the heavier you are. That makes it punishing to send one overloaded person into
								a fight.
							</li>
							<li>
								Removing cards from your deck is never impossible, but bigger decks get rewards too.
								More cycles mean more fatigue cards.
							</li>
						</ul>
					</section>

					<section id="wl-cards">
						<h2>Learning spells</h2>
						<ul>
							<li>
								For how learned cards and gear cards get into your deck, see
								<button type="button" class="link" on:click={() => pickTab('gameplay')}
									>Gameplay</button
								>.
							</li>
							<li>
								<b>Spell schools:</b> fire, ice, water, divine, holy, dark, arcane and more. Some characters
								are better with some schools (Pylion with fire, Bex with arcane).
							</li>
							<li>
								<b>Civilian and military spells.</b> Civilian spells are what a wizard does out in the
								world: Heal (which works in combat too), Blessing of the farm, Pickpocket (Sid: steal
								silver from a building or person. It's a tiered spell: the more fate you spend, the higher
								the tier and the less likely you are to be caught, and getting caught has consequences),
								Franchise (Bobby: a building starts working for his company). Military spells go in your
								combat deck.
							</li>
							<li>
								<b>Knowledge</b> pays for new spells, and teachers and tutors take gold too. Every cast
								permanently (for the rest of the run) takes 1 off learning any spell, 5 off its school
								and 25 off that exact spell.
							</li>
							<li>
								Learning spells of one school makes its rarer spells more likely to turn up. Your
								reputation can matter too: evil schools show up more for the infamous.
							</li>
							<li>
								<b>Teachers and tutors</b> let you target a specific card, even a legendary, for gold
								and knowledge, instead of the study screen's random pulls.
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

					<section id="wl-research">
						<h2>Knowledge & research</h2>
						<p>
							Wizards spend <b>knowledge</b> in a shop that offers 4 spells, 3 buildings
							(blueprints) and 2 traits. A <b>research project</b> refreshes the shop and boosts your
							research bar.
						</p>
						<p>
							The <b>research bar</b> runs from 0 to 10. The higher it is, the rarer what turns up, and
							each level gives 1 wisdom. An average run should reach level 4, a solid one 6, and it takes
							an insane run to hit 10.
						</p>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Research level</th><th>Unlocks</th></tr></thead>
								<tbody>
									<tr><td><b>2</b></td><td>A 5th spell in the shop</td></tr>
									<tr><td><b>4</b></td><td>A 4th building in the shop</td></tr>
									<tr><td><b>6</b></td><td>A 3rd trait in the shop</td></tr>
									<tr
										><td><b>8</b></td><td>Mystical spells can be learned (usually out of reach)</td
										></tr
									>
								</tbody>
							</table>
						</div>
						<p>
							The bar fills with a tenth of the knowledge you gain, plus extra from universities,
							books, scrolls and research projects.
						</p>
					</section>

					<section id="wl-shops">
						<h2>Shops & rewards</h2>
						<ul>
							<li>
								<b>Shops</b> take silver for artifacts, units to hire, temporary blueprints, potions,
								food and gold.
							</li>
							<li>
								<b>Traveling salesmen</b> are more likely to carry rare artifacts and blueprints, but
								move on once you've visited and take longer to restock.
							</li>
							<li>
								<b>Cities</b> are permanent. They stock more than salesmen, and sell food, but charge
								5% more.
							</li>
							<li>
								<b>Winning a battle</b> gives wizards knowledge and units combat experience. Enemies
								drop artifacts and silver; animals drop food.
							</li>
						</ul>
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
								<b>From the land.</b> Tiles hold silver, ME (magic essence), food and maybe gold. You
								can spend part of a day working the land you're on.
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
								<b>Gold</b> gives mana and ME to whoever holds it, and can permanently upgrade one spell.
								It comes as nuggets, ingots and blocks (see Gameplay). Gold left in a city gives that
								city mana, for things like magic farming.
							</li>
							<li>
								<b>Light and heat</b> could be resources: candles, wood and bulbs help at night; clothes
								and shelter keep you warm through the seasons.
							</li>
							<li>
								<b>Building.</b> Costs resources, with ME covering any shortfall. A builder can make
								a building cheaper or faster. At an outpost, materials come from what it produces; away
								from one you need them up front.
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

					<section id="wl-buildings">
						<h2>Buildings</h2>
						<p>
							A building needs its blueprint first, learned with knowledge, then resources to build
							it. Magic essence covers whatever resources you're short of (see
							<button type="button" class="link" on:click={() => pickTab('gameplay')}
								>Gameplay</button
							>).
						</p>
						<h3>Bases</h3>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Base</th><th>Size</th><th>Notes</th></tr></thead>
								<tbody>
									<tr
										><td><b>Tent</b></td><td>A triangle of 3 tiles</td><td
											>Temporary, and can be carried. Sleeps 3</td
										></tr
									>
									<tr
										><td><b>Outpost</b></td><td>1 tile and the 6 around it (7)</td><td
											>Buildings go in the ring around it</td
										></tr
									>
									<tr
										><td><b>Castle</b></td><td>A triangle of 3 tiles and the 9 around it (12)</td
										><td></td></tr
									>
								</tbody>
							</table>
						</div>
						<h3>Blueprints</h3>
						<p>
							Blueprints come in five rarities, and a higher research level makes the rarer ones
							more likely. A rare roll (a 0.1% legendary) gets a small discount, worked out from its
							base odds, so rarer buildings get cheaper over time. Upgrades need the base building
							first, and show up as blueprints of their own.
						</p>

						<div class="table-wrap">
							<table>
								<thead><tr><th>Building</th><th>Rarity</th><th>Effect</th></tr></thead>
								<tbody>
									<tr
										><td><b>Wood walls</b></td><td>Filler</td><td
											>Add to any building. A fortification bonus when attacking or defending from
											it</td
										></tr
									>
									<tr
										><td><b>Farm</b></td><td>Filler</td><td
											>Takes all the food from its tile. Needs a worker</td
										></tr
									>
									<tr
										><td><b>Mine</b></td><td>Filler</td><td
											>Takes all the ME from its tile. Needs a worker</td
										></tr
									>
									<tr
										><td><b>Silo</b></td><td>Filler</td><td
											>Upgrades a farm (or mine). Stores more food, which doesn't rot. Wood, stone
											or steel: 50, 100 or 150</td
										></tr
									>
									<tr
										><td><b>Outpost</b></td><td>Common (~20%)</td><td
											>Takes all the resources on its tile, like a city in other games. Buildings
											next to it are cheaper, and it attracts units</td
										></tr
									>
									<tr
										><td><b>School</b></td><td>Common</td><td
											>Teaches units (+1 a part of day, at lower levels). Wizards within 1 tile gain
											knowledge faster</td
										></tr
									>
									<tr
										><td><b>Blacksmith</b></td><td>Common</td><td
											>Turns silver and ME into artifacts</td
										></tr
									>
									<tr
										><td><b>Water wheel</b></td><td>Common</td><td
											>Add to a building next to a river. 1 ME a turn</td
										></tr
									>
									<tr
										><td><b>Stone walls</b></td><td>Common</td><td
											>Add to any building. More fortification than wood</td
										></tr
									>
									<tr><td><b>Brewery</b></td><td>Rare (~5%)</td><td>Turns ME into potions</td></tr>
									<tr
										><td><b>Archer tower</b></td><td>Rare</td><td
											>Worked by a unit with a ranged weapon, it attacks and defends any building
											within 2 tiles, with a 2-height advantage</td
										></tr
									>
									<tr
										><td><b>Military academy</b></td><td>Rare</td><td
											>Upgrades a school or university. Draws in units with more strength, speed and
											fighting bias. +1 learning for archers and swordsmen</td
										></tr
									>
									<tr
										><td><b>Wizard academy</b></td><td>Rare</td><td
											>Upgrades a school or university. Draws in units with spellcaster bias and
											some knowledge. +1 learning for spellcasters</td
										></tr
									>
									<tr
										><td><b>Pop-up castle</b></td><td>Epic (~1%)</td><td
											>A much stronger outpost that comes with walls and a farm</td
										></tr
									>
									<tr
										><td><b>University</b></td><td>Epic</td><td
											>Upgrades a school. +3 a part of day at every level, and boosts wizards'
											knowledge and research</td
										></tr
									>
									<tr
										><td><b>Moving structure</b></td><td>Legendary (~0.1%)</td><td
											>Add to any building, which then moves like a unit (1 tile a part of day).
											From time spent in the labyrinth, or maybe Baba Yaga's house</td
										></tr
									>
								</tbody>
							</table>
						</div>
						<p class="aside">
							Only one of each legendary can exist in a game, and most are found in some unique way.
						</p>
					</section>

					<section id="wl-food">
						<h2>Food</h2>
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
							<li>
								Food rots over time. Salt halves how fast; spice adds a morale bonus. Both can go
								into potions too.
							</li>
							<li>
								Animals are food on the hoof: cattle give twice the meat, and a horse can be ridden
								until it dies.
							</li>
							<li>
								The cornucopia can go in any slot for free. A button can eat your best mix
								automatically.
							</li>
						</ul>
						<div class="options">
							<h4>Earlier draft</h4>
							<p>
								Four food types: <b>grain</b> (wheat, corn, rice; eaten 1 to 1), <b>protein</b>
								(beans, fish, hunted meat; eaten 2 at a time, with a small chance to raise strength or
								speed), <b>fruit</b> (bananas from the rainforest, berries picked while exploring;
								eaten 3 at a time, and heals a little) and <b>vegetables</b> (eaten 2 at a time). Corn
								counts as grain and vegetable. Rivers and oceans might be endless fishing.
							</p>
						</div>
					</section>

					<section id="wl-morale">
						<h2>Morale, traits & relationships</h2>
						<p>Morale itself is one of <a href="#wl-bars">the four bars</a>.</p>
						<ul>
							<li>
								<b>Loyalty</b> decides how much an outpost sends you.
							</li>
							<li>
								<b>Relationships.</b> It's usually better if your two wizards like each other, though
								hating each other has its niche benefits.
							</li>
							<li>
								<b>Interests.</b> Everyone has a hidden interest vector. You learn more of it (their
								favorite, their least favorite, how much) as they warm to you. It decides how fast they
								learn a task and how much they enjoy it, and big events can change it.
							</li>
							<li>
								<b>Traits</b> can be temporary or permanent, and their strength is rolled, so the
								same trait can be good or bad. Gaining traits makes similar, rarer ones more likely.
								They're all listed on the
								<button type="button" class="link" on:click={() => pickTab('traits')}>Traits</button
								> tab.
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
						<h2>Faith</h2>
						<p>
							Religion is mostly a way of manipulating <a href="#wl-fate">fate</a>: the evil (dark)
							side exploits it, and the good (holy) side aligns you with it.
						</p>
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
								<b>Obligations.</b> Trade favors: an immediate reward now, a challenge you must complete
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
							difficulty. At the start, resources barely exist: only magic essence, and food with no
							types.
						</p>
						<ol class="unlocks">
							<li>The start: Merlin and Knick</li>
							<li>Resources (building materials): Candice</li>
							<li>Food that rots, food types and water: Frank the Founder</li>
							<li>Time, moon cycles and seasons: the witch, or Thomas</li>
							<li>Temperature and weather: Pylion</li>
							<li>Memory: people recognize you, hostility grows, and fame takes hold</li>
							<li>Cartography: the map locks in, and the hunt for the City of Gold begins</li>
						</ol>
						<p>
							Some mechanics unlock through account levels, others by finishing things. The final
							ascension level could lock in everything that came before: the map, the wizards, the
							religions.
						</p>
						<h3>Difficulty levels</h3>
						<p>
							Ten levels, each unlocked by beating the one before. Every level adds 2 tiles to the
							edge of the map (more to explore, so runs go longer while monsters scale up), raises
							all costs by 1%, and makes enemies grow 5% faster (up to 50%). Each level also adds
							one twist, and they stack:
						</p>
						<ul>
							<li>Each wizard starts with a curse (a negative trait).</li>
							<li>Food decays, 2% a turn.</li>
							<li>Low funding: 25% less of every starting resource.</li>
							<li>
								<b>Origin flag:</b> a wizard must carry it at all times and bring it to the City of Gold.
								It weighs 10 and is a useless card in combat. It could be a random mystery object, or
								a task for each wizard.
							</li>
							<li>
								<b>Fighting forest:</b> monsters are 10% more aggressive, and fewer passive animals.
							</li>
							<li><b>Mother's guidance:</b> monsters start working together.</li>
							<li><b>Multiple protectors:</b> a second boss, and 5% more monsters.</li>
							<li>
								<b>Desolate waste:</b> resources are 25% less likely to spawn and give 25% less.
							</li>
						</ul>
						<p class="aside">
							Other twists to consider: body temperature (too hot tires you, too cold hurts you),
							resources that make building cost 10% more, and needing water (the lava land has
							none).
							<span class="open">Open</span> How this fits with unlocking the world, which also brings
							in rotting food and water.
						</p>
						<h3>Custom wizards</h3>
						<p>
							Get units (not just wizards) to the City of Gold to unlock custom wizards: set their
							stats, and get a random mix of two other wizards' card sets and one of their traits.
						</p>
					</section>

					<section id="wl-epithets">
						<h2>Epithets</h2>
						<p>
							Epithets are achievements that fill in the blank in "Merlin the ___". Every wizard
							unlocks their own by surviving to the City of Gold, and others come from notable feats
							(escaping the labyrinth, becoming a king). Once unlocked, any character can pick one
							at the start of a run (your two wizards can't pick the same one), and each has its own
							effect. The full list is on the
							<button type="button" class="link" on:click={() => pickTab('epithets')}
								>Epithets tab</button
							>.
						</p>
					</section>
				</article>
			{:else if tab === 'epithets'}
				<article>
					<section>
						<h2>Epithets</h2>
						<p>
							Epithets are achievements that fill in the blank in "Merlin the ___". Once one is
							unlocked, any character can pick it at the start of a run, and each one has its own
							effect. Your two wizards can't pick the same epithet.
						</p>
						<h3>Character epithets</h3>
						<p>
							Every wizard has an epithet of their own, unlocked when that wizard survives all the
							way to the City of Gold. (In the earlier draft, only if they get there without an
							epithet already.)
						</p>
						<div class="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Epithet</th>
										<th>How to unlock</th>
										<th>Effect</th>
									</tr>
								</thead>
								<tbody>
									<tr>
										<td><b>the Magnificent</b></td>
										<td>Get Merlin to the City of Gold alive</td>
										<td><span class="open">Open</span></td>
									</tr>
									<tr>
										<td><b>the Knight</b></td>
										<td>Get Knick to the City of Gold alive</td>
										<td>1 universal protection and +3 swagger</td>
									</tr>
									<tr>
										<td><b>the Bright</b></td>
										<td>Get Bex to the City of Gold alive</td>
										<td>+3 wisdom, and start at research level 1</td>
									</tr>
									<tr>
										<td><b>the Founder</b></td>
										<td>Get Frank to the City of Gold alive</td>
										<td><span class="open">Open</span></td>
									</tr>
									<tr>
										<td><b>the Contractor</b></td>
										<td>Get Candice to the City of Gold alive</td>
										<td><span class="open">Open</span></td>
									</tr>
									<tr>
										<td><b>the Architect</b></td>
										<td>Get Archie to the City of Gold alive</td>
										<td>Blueprints cost 5% less, and rarer blueprints are 5% more likely</td>
									</tr>
									<tr>
										<td><b>the Pyromancer</b></td>
										<td>Get Pylion to the City of Gold alive</td>
										<td><span class="open">Open</span></td>
									</tr>
									<tr>
										<td><b>the Timeturner</b></td>
										<td>Get Thomas to the City of Gold alive</td>
										<td><span class="open">Open</span></td>
									</tr>
									<tr>
										<td><b>the Witch</b></td>
										<td>Get Wyla to the City of Gold alive</td>
										<td><span class="open">Open</span></td>
									</tr>
									<tr>
										<td><b>the Sly</b></td>
										<td>Get Sid to the City of Gold alive</td>
										<td><span class="open">Open</span></td>
									</tr>
									<tr>
										<td><b>the Mad</b></td>
										<td>Get Maximus to the City of Gold alive</td>
										<td><span class="open">Open</span></td>
									</tr>
									<tr>
										<td><b>Business</b></td>
										<td>Get Bobby to the City of Gold alive. It's the one epithet without "the"</td>
										<td><span class="open">Open</span></td>
									</tr>
									<tr>
										<td><b>the General</b></td>
										<td>
											Get Gladys to the City of Gold alive. Once she has it, nobody calls her by her
											real name again
										</td>
										<td><span class="open">Open</span></td>
									</tr>
								</tbody>
							</table>
						</div>
						<h3>Achievement epithets</h3>
						<p>Earned by doing something notable on a run.</p>
						<div class="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Epithet</th>
										<th>How to unlock</th>
										<th>Effect</th>
									</tr>
								</thead>
								<tbody>
									<tr>
										<td><b>the Remembered</b></td>
										<td>Win a run with one wizard dead. The other remembers them</td>
										<td><span class="open">Open</span></td>
									</tr>
									<tr>
										<td><b>the Legend</b></td>
										<td>Get a character to max notoriety</td>
										<td><span class="open">Open</span></td>
									</tr>
									<tr>
										<td><b>the Myth</b></td>
										<td>Create a myth</td>
										<td><span class="open">Open</span></td>
									</tr>
									<tr>
										<td><b>the Alliterate</b></td>
										<td>Find every alliteration</td>
										<td><span class="open">Open</span></td>
									</tr>
									<tr>
										<td><b>the Captain</b></td>
										<td>Climb El Capitan for the first time</td>
										<td><span class="open">Open</span></td>
									</tr>
									<tr>
										<td><b>the Pirate</b></td>
										<td>Finish the pirate quest</td>
										<td
											>Sail better and raid the king's trade, but receive none. +2 happiness to you
											and +1 to your crew while sailing</td
										>
									</tr>
									<tr>
										<td><b>the King</b></td>
										<td>
											Find Falias, the northernmost of the four Irish islands, and be accepted as
											king by the Stone of Fál. The stronger you are when you find it, the better
											the odds it accepts you
										</td>
										<td>
											Changes how the rules work: you're now the king of a kingdom, not just a
											wizard on a quest. <span class="open">Open</span> Exactly how
										</td>
									</tr>
									<tr>
										<td><b>the Ancient</b></td>
										<td><span class="open">Open</span></td>
										<td>Read and speak forgotten languages, which opens up old magic</td>
									</tr>
									<tr>
										<td><b>the Lost</b></td>
										<td>Lose a run inside the labyrinth</td>
										<td><span class="open">Open</span></td>
									</tr>
									<tr>
										<td><b>Not named yet</b></td>
										<td>Escape the labyrinth</td>
										<td><span class="open">Open</span></td>
									</tr>
									<tr>
										<td><b>Not named yet</b></td>
										<td>The highest goodness, and the worst badness</td>
										<td><span class="open">Open</span></td>
									</tr>
								</tbody>
							</table>
						</div>
					</section>
				</article>
			{:else if tab === 'wizards'}
				<article>
					<p class="intro">
						The characters so far. Each should have their own way of earning knowledge and, ideally,
						their own mechanic. Some can be found out in the world instead of picked at the start.
					</p>
					<p>
						Each wizard also has three <b>treasures</b>: one they start with, one unlocked at a
						certain level, and one discovered out on the map. Their epithet comes once they reach
						the City of Gold.
					</p>
					<div class="cards-2">
						<div class="card">
							<h3>Merlin the Magnificent</h3>
							<p class="small">Magic ability, swagger, intelligence · low fortitude</p>
							<p>One of the two wizards you start with.</p>
							<p>All-round spells. <b>Established wizard:</b> starts at research level 1.</p>
						</div>
						<div class="card">
							<h3>Knick the Knight</h3>
							<p class="small">Fortitude, strength, endurance · low speed</p>
							<p>
								Gives a defensive bonus to everyone in his corps. Chivalry never dies: blocking
								damage for someone else improves their relationship.
							</p>
							<ul>
								<li><b>Ol' Trusty</b> (start): a weapon that gives about +5 strength.</li>
								<li>
									<b>Squire</b> (unlocked): a starting unit who must stay with Knick until they become
									a knight. Can learn two trait lines, and starts with the swordsman trait and a sword.
								</li>
								<li>
									<b>Horse</b> (found wandering the plains): +10 carrying and +5 speed, and eats 1 food
									a turn.
								</li>
							</ul>
							<p class="small">Called "Knoble" in the earlier draft, and tank-themed.</p>
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
							<p class="small">Earlier draft: money and corruption</p>
							<ul>
								<li><b>Well funded:</b> your party starts with twice the silver.</li>
								<li>
									<b>Salesman:</b> 25% more silver when he sells, and everything that costs silver is
									10% cheaper.
								</li>
								<li>
									<b>Magicless:</b> spells cost more fate, cost more to buy and turn up rarer.
								</li>
								<li>
									<b>Franchising:</b> make a building part of Bobby's business. Outposts within 5 tiles
									draw 5% more units and turn 25% of what they make into silver, plus 1 silver.
								</li>
							</ul>
						</div>
						<div class="card">
							<h3>Bex the Bright</h3>
							<p class="small">Intelligence, magic ability · low strength</p>
							<ul>
								<li>Combo and spell damage, and good with arcane.</li>
								<li>Learns by teaching units, and her study session works out of combat too.</li>
								<li>Chaos: an adaptive random spell each turn, which helps her learn faster.</li>
							</ul>
							<ul>
								<li>
									<b>Endless book</b> (start): a book that never runs out, but gives less than a normal
									one.
								</li>
								<li>
									<b>Elbow pads</b> (unlocked): everyone within 2 hexes of Bex gets +1 knowledge a part
									of day.
								</li>
								<li>(discovered) <span class="open">Open</span></li>
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
							<ul>
								<li><b>Super compass</b> (start): see 3 extra tiles.</li>
								<li>
									<b>Nomad trait</b> (discovered, by learning the lifestyle from traders and salesmen):
									he can't start or help with buildings, but pitches a tent wherever he sleeps, for protection
									and better sleep, and farms that tile overnight. It could be boosted to harvest more,
									or half as much with a 2 in 3 chance of leaving the resource.
								</li>
							</ul>
						</div>
						<div class="card">
							<h3>Gladys, the General</h3>
							<p class="small">
								Goes by Gladys until she earns her epithet; after that, only "the General"
							</p>
							<ul>
								<li>Units with her gain more XP, and armies are slowed less.</li>
								<li>Learns by leading units in combat.</li>
								<li>
									A whistle makes orders cheaper and longer range. Rally cry (2 mana): 1 neutral
									mana and remove a fatigue; upgraded, it also draws.
								</li>
								<li>"Each unit draws a card." Gives neutral mana to the party.</li>
								<li>
									<b>Banner:</b> every unit within 3 tiles rolls a die one size larger (a d6 instead
									of a d4), and the other wizard rolls a d22 instead of a d20.
								</li>
								<li>Joins after you recruit enough units from the armory.</li>
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
							<h3>Archie the Architect</h3>
							<p>Buildings he designs yield 5% more. Leans towards slow play.</p>
							<ul>
								<li>
									<b>Battery</b> (start): stored at a building, it makes 1 ME a part of day for 5 days,
									and gets lighter as it's used.
								</li>
							</ul>
						</div>
						<div class="card">
							<h3>Pylion the Pyromancer</h3>
							<p>Fire. Arrives with temperature and weather.</p>
						</div>
						<div class="card">
							<h3>Thomas the Timeturner</h3>
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
							<h3>Sid the Sly</h3>
							<p>The first time his deck cycles, he ignores the fatigue card.</p>
							<ul>
								<li>
									<b>Stolen chest</b> (discovered, by stealing it from a city): Sid has to spend time
									picking it open (an active rest): it has a total fate cost that he slowly ticks down
									until it opens. Inside are two random artifacts and 100 knowledge.
								</li>
								<li><b>Escape artist:</b> gets out of combat more easily.</li>
								<li>
									<b>Escape hatch:</b> drains 75% of his current rest (at least 15% of his max) to teleport
									him to your nearest outpost.
								</li>
							</ul>
						</div>
						<div class="card">
							<h3>Maximus the Mad</h3>
							<p>Has a mulligan.</p>
							<p class="small">Chaos, randomness and bending fate</p>
							<ul>
								<li><b>Rabbit's foot</b> (start): raises his fate.</li>
								<li>
									<b>Wild card</b> (unlocked): when drawn, casts random spells that add up to a cost
									of X, where X is how many times it's been drawn this game. Then draw a card.
								</li>
							</ul>
						</div>
						<div class="card">
							<h3>A king</h3>
							<p>
								Joins once you've done enough. Or a unit gets promoted to king when you find the
								four Irish islands.
							</p>
						</div>
					</div>
				</article>
			{:else if tab === 'traits'}
				<article class="rules">
					<p class="intro">
						Every trait so far. Wizards and units both have traits. They can be temporary or
						permanent, and how strong a trait is gets rolled, so the same trait can turn out good or
						bad. Gaining a trait makes similar, rarer ones more likely.
					</p>

					<section>
						<h2>Unit trait lines</h2>
						<p>
							These are what used to be units' specialties. Units learn them by doing the work, at a
							school, from someone on their tile who has the trait, or by paying a teacher (see
							<button type="button" class="link" on:click={() => pickTab('rules')}>Units</button> in
							the rules draft). Civilian traits never let a unit start a fight; military ones do.
						</p>
						<h3>Starting traits</h3>
						<p>The first trait in each line. Most units start with some of these.</p>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Trait</th><th>Kind</th><th>Effect</th></tr></thead>
								<tbody>
									<tr
										><td><b>Farmer</b></td><td>Civilian</td><td>+1 food while working a farm</td
										></tr
									>
									<tr
										><td><b>Teacher</b></td><td>Civilian</td><td
											>+1 knowledge to everyone studying at their school. Might be dropped so that
											any unit can teach</td
										></tr
									>
									<tr><td><b>Builder</b></td><td>Civilian</td><td>Construction goes faster</td></tr>
									<tr><td><b>Miner</b></td><td>Civilian</td><td>+1 ME while working a mine</td></tr>
									<tr
										><td><b>Craftsman</b></td><td>Civilian</td><td
											>Exchanges goods, like at a blacksmith. <span class="open">Open</span> Its exact
											effect</td
										></tr
									>
									<tr
										><td><b>Explorer</b></td><td>Civilian</td><td
											>+10 movement. Wanders the map and looks after itself, with some military uses</td
										></tr
									>
									<tr
										><td><b>Archer</b></td><td>Military</td><td
											>+1 range, and ranged attacks cost less fate</td
										></tr
									>
									<tr><td><b>Swordsman</b></td><td>Military</td><td>+1 melee damage</td></tr>
									<tr
										><td><b>Spellcaster</b></td><td>Military</td><td
											>Units can't cast at all without it. Gets a bolt spell</td
										></tr
									>
								</tbody>
							</table>
						</div>
						<h3>Trait upgrades</h3>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Upgrade</th><th>From</th><th>Effect</th></tr></thead>
								<tbody>
									<tr
										><td><b>Horticulture</b></td><td>Farmer</td><td
											>Spend farming knowledge to make a resource type give +1 silver, ME or food
											everywhere</td
										></tr
									>
									<tr
										><td><b>Planter</b></td><td>Farmer</td><td
											>A chance to collect seed from a farmed resource and plant it somewhere new</td
										></tr
									>
									<tr
										><td><b>Programmer</b></td><td>Farmer and craftsman</td><td
											>Production carries on at night. Maybe counts as two workers</td
										></tr
									>
									<tr
										><td><b>Architect</b></td><td>Builder</td><td
											>Can start constructions and discover blueprints</td
										></tr
									>
									<tr
										><td><b>Rapid fire</b></td><td>Archer</td><td
											>Fires faster: +1 copy of their weapon and +1 draw</td
										></tr
									>
									<tr
										><td><b>Expanded learning</b></td><td>Teacher</td><td
											>Their school reaches 1 more tile</td
										></tr
									>
									<tr
										><td><b>Classroom experience</b></td><td>Teacher</td><td
											>Teaches 1 more student at a time</td
										></tr
									>
									<tr
										><td><b>Religious leader</b></td><td>Spellcaster</td><td
											>Can build holy sites: better outposts that help morale and healing, maybe
											with miracles</td
										></tr
									>
									<tr
										><td><b>Religious advancement</b></td><td>Religious leader</td><td
											>Can set up beliefs</td
										></tr
									>
									<tr
										><td><b>Elementalist</b></td><td>Spellcaster</td><td
											>Upgrades each element separately</td
										></tr
									>
									<tr
										><td><b>Witch</b></td><td>Spellcaster</td><td>Comes with the witch expansion</td
										></tr
									>
									<tr
										><td><b>Survivalist</b></td><td>Explorer</td><td>Needs 1 less food a turn</td
										></tr
									>
									<tr
										><td><b>Climber</b></td><td>Explorer</td><td
											>Uphill costs only 2, and can climb cliffs at twice the uphill cost</td
										></tr
									>
									<tr
										><td><b>Trader</b></td><td>Craftsman</td><td
											>Runs trade between places in range: moves resources between yours, or sells
											what you don't want in another city. Earns on the road, but can be attacked</td
										></tr
									>
								</tbody>
							</table>
						</div>
					</section>

					<section>
						<h2>Character traits</h2>
						<p>Personal traits any wizard or unit can have, often picked up during a run.</p>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Trait</th><th>Effect</th><th>How you get it</th></tr></thead>
								<tbody>
									<tr
										><td><b>Scavenger</b></td><td
											>More food from traveling and from killing animals (like a deer). Often
											temporary</td
										><td>Picked up during a run</td></tr
									>
									<tr
										><td><b>Desert tummy</b></td><td>Raises your maximum food. Often temporary</td
										><td>Picked up during a run</td></tr
									>
									<tr
										><td><b>Foodie</b></td><td
											>Gains some morale from eating, doubled when the meal has spice</td
										><td><span class="open">Open</span></td></tr
									>
									<tr
										><td><b>Chef</b></td><td
											>Everyone in their group gains some morale from eating (less than a foodie),
											doubled with spice</td
										><td><span class="open">Open</span></td></tr
									>
									<tr
										><td><b>Heavy sleeper</b></td><td
											>Isn't woken by night attacks while resting, and rests a set percentage better</td
										><td><span class="open">Open</span></td></tr
									>
									<tr
										><td><b>Sluggish</b></td><td>Starts every combat with a fatigue card</td><td
											><span class="open">Open</span></td
										></tr
									>
									<tr
										><td><b>Greed</b></td><td
											>A morale boost from gaining money, with diminishing returns. Fall short of a
											threshold and it lowers morale instead</td
										><td>Bobby starts with it</td></tr
									>
									<tr
										><td><b>Adaptive learning</b></td><td
											>The first spell you cast each turn costs 1 less, until you rest</td
										><td><span class="open">Open</span></td></tr
									>
									<tr
										><td><b>Fearless</b></td><td
											>Removes the movement penalty for revealing new terrain (or reduces it for a
											whole group), but can't flee, or has to wait longer to</td
										><td><span class="open">Open</span></td></tr
									>
									<tr
										><td><b>Unnamed</b></td><td
											>Once you go through your whole deck in a fight, +1 mana (and maybe a draw)
											for the rest of it</td
										><td><span class="open">Open</span> Could be a passive instead</td></tr
									>
								</tbody>
							</table>
						</div>
					</section>

					<section>
						<h2>Promotions and roles</h2>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Trait</th><th>Effect</th><th>How you get it</th></tr></thead>
								<tbody>
									<tr
										><td><b>Commander</b></td><td
											>Can give a few orders to its own corps, so you need fewer of yours</td
										><td>A promotion</td></tr
									>
									<tr
										><td><b>General</b></td><td
											>Like a commander, it can give a few orders to its own group</td
										><td>A promotion</td></tr
									>
									<tr
										><td><b>Trailblazer</b></td><td
											>Leading a corps in "follow the leader" mode, the units behind travel faster</td
										><td>A promotion</td></tr
									>
									<tr
										><td><b>Researcher</b></td><td
											>Working a library makes a book or scroll every 6 parts of day instead of 8,
											and they are 10% better</td
										><td>Earlier draft: a specialty</td></tr
									>
									<tr
										><td><b>Librarian</b></td><td
											>Works a library like the Library of Alexandria for knowledge and research,
											and makes money trading books</td
										><td><span class="open">Open</span> May be the same as researcher</td></tr
									>
								</tbody>
							</table>
						</div>
					</section>

					<section>
						<h2>Unique traits</h2>
						<p>Traits from a particular wizard, place or difficulty.</p>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Trait</th><th>Effect</th><th>How you get it</th></tr></thead>
								<tbody>
									<tr
										><td><b>Nomad</b></td><td
											>Frank can't start or help with buildings, but pitches a tent wherever he
											sleeps and farms that tile overnight</td
										><td>Frank learns the lifestyle from traders and salesmen</td></tr
									>
									<tr
										><td><b>Super</b></td><td>+3 strength and speed during the day</td><td
											>The first wizard to reach the Fortress of Solitude</td
										></tr
									>
									<tr
										><td><b>Demigod</b></td><td>A gift from one of the 12 gods, chosen from 3</td
										><td>The first summit of Mount Olympus, for one of your party</td></tr
									>
									<tr
										><td><b>Sinner</b></td><td>+3 wisdom, and a penalty</td><td
											>Both wizards, once the Garden of Eden reaches 15 temptation</td
										></tr
									>
									<tr
										><td><b>Curse</b></td><td>A negative trait</td><td
											>Every wizard starts with one at the curse difficulty</td
										></tr
									>
								</tbody>
							</table>
						</div>
						<p class="aside">
							Wisdom isn't one of the seven stats any more, so what sinner's +3 wisdom becomes is
							<span class="open">Open</span>.
						</p>
					</section>

					<section>
						<h2>Action traits</h2>
						<p>
							Actions can have traits too. The only one so far is <b>rest</b>: actions with it (like
							reading) don't drain energy.
						</p>
					</section>
				</article>
			{:else if tab === 'items'}
				<article>
					<section>
						<h2>Artifacts</h2>
						<p>
							Found, bought, made at a blacksmith or dropped by enemies. Legendary ones whose home
							didn't spawn can still turn up with traveling salesmen.
						</p>
						<h3>Weapons</h3>
						<p>
							Each unit and wizard can have one weapon equipped. Every weapon also sets the time and
							fate cost of its <button
								type="button"
								class="link"
								on:click={() => pickTab('gameplay')}>basic strike</button
							>.
						</p>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Weapon</th><th>Effect</th></tr></thead>
								<tbody>
									<tr
										><td><b>Elemental sword</b></td><td
											>Takes on the school of the last spell cast. Fire: +1 damage. Holy: heal every
											friendly unit 1. Ice: gain 3 shielding</td
										></tr
									>
									<tr
										><td><b>Silver rod</b></td><td
											>Gain a silver every time this character casts a spell</td
										></tr
									>
									<tr
										><td><b>Pickaxe</b></td><td
											>A weak weapon, but mining is 10% faster even when it isn't equipped</td
										></tr
									>
									<tr
										><td><b>Axe</b></td><td
											>A better weapon than the pickaxe, and more wood from working a forest</td
										></tr
									>
									<tr><td><b>Ballista</b></td><td>Good against cities. Heavy</td></tr>
									<tr
										><td><b>The First Wand (legendary)</b></td><td
											>In combat your spells cost no base fate (higher tiers and repeats still cost
											fate), +2 mana and +1 draw</td
										></tr
									>
									<tr
										><td><b>Golden Rod (legendary)</b></td><td
											>The first spell you cast each battle permanently becomes its golden version,
											and you find gold more often. Heavier than most</td
										></tr
									>
									<tr
										><td><b>Wand++ (legendary)</b></td><td
											>Every number in combat is 1 higher. Might be hard to build</td
										></tr
									>
									<tr
										><td><b>Wand of Light (legendary)</b></td><td><span class="open">Open</span></td
										></tr
									>
								</tbody>
							</table>
						</div>
						<h3>Wearables</h3>
						<p>
							Each unit and wizard can wear one or two. They give protection (knight's armor: 1
							universal), a unique ability (sticky gloves) or a passive (more mana, more damage of a
							type, cheaper spells, more speed).
						</p>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Wearable</th><th>Effect</th></tr></thead>
								<tbody>
									<tr><td><b>Knight's armor</b></td><td>Provides 1 universal protection</td></tr>
									<tr
										><td><b>Sticky gloves</b></td><td
											>A unique ability. <span class="open">Open</span></td
										></tr
									>
									<tr
										><td><b>Swift boots</b></td><td>+2 speed, +3 movement and +1 draw in combat</td
										></tr
									>
									<tr
										><td><b>Wings</b></td><td
											>+3 speed. Going downhill is free, and you can go down cliffs</td
										></tr
									>
									<tr><td><b>Nerd frames</b></td><td>+8 wisdom, −2 speed, −2 strength</td></tr>
									<tr
										><td><b>Wizard's hat</b></td><td
											>+1 mana in combat, and civilian spells cost 10% less</td
										></tr
									>
								</tbody>
							</table>
						</div>
						<h3>Collectables</h3>
						<p>Carry as many as your carrying capacity allows.</p>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Collectable</th><th>Effect</th></tr></thead>
								<tbody>
									<tr
										><td><b>Journal</b></td><td
											>Quietly stores 5–50% of its holder's knowledge and research, up to about 5–40
											parts of day's worth. Passing it to the other wizard drains it and uses a
											charge (1–10, or unlimited). Lose a run with a full journal and it can be
											found later</td
										></tr
									>
									<tr
										><td><b>Scroll</b></td><td>Read instantly for knowledge, research or a spell</td
										></tr
									>
									<tr
										><td><b>Book</b></td><td
											>Read over time (an active rest) for knowledge, research or spells. 1–5
											charges, more than a scroll, with a better chance of rare spells and of
											teaching traits</td
										></tr
									>
									<tr
										><td><b>Daedalus' Journal (legendary)</b></td><td
											>Only found in the labyrinth. A book that hugely boosts knowledge and gives
											the moving-building upgrade</td
										></tr
									>
									<tr><td><b>Pillow</b></td><td>A small boost to sleep and naps. Light</td></tr>
									<tr
										><td><b>Mattress</b></td><td
											>A bigger boost to sleep and naps. Heavy, and can be left at a building</td
										></tr
									>
									<tr
										><td><b>Energy drink</b></td><td
											>+15 energy this turn, then −6 energy for each of the next 3 turns</td
										></tr
									>
									<tr
										><td><b>Lyre</b></td><td
											>An active rest that boosts the whole party's morale while taking up only one
											character</td
										></tr
									>
									<tr
										><td><b>Phone</b></td><td
											>While a wizard holds it, every place you've found that has a phone is visible</td
										></tr
									>
									<tr
										><td><b>Ender chest</b></td><td
											>Holds 150, shared between every chest. The first comes as a pair, like
											phones; single ones turn up later</td
										></tr
									>
									<tr><td><b>Backpack</b></td><td>+25 carrying capacity</td></tr>
									<tr><td><b>Plow</b></td><td>Working for food is 15% faster</td></tr>
									<tr><td><b>Hammer</b></td><td>+25% while working on a construction</td></tr>
									<tr
										><td><b>Computer</b></td><td
											>Left at a workplace, it works like a worker. Held in combat, it shows more
											information. <span class="open">Open</span> Which: expected damage, odds, a suggested
											move, your deck</td
										></tr
									>
									<tr><td><b>Aimbot</b></td><td>Spells and critical hits cost less fate</td></tr>
									<tr
										><td><b>Cauldron</b></td><td
											>Lets its carrier brew. At a brewery, brewing costs 10% less</td
										></tr
									>
									<tr><td><b>Perpetual machine (epic)</b></td><td>An endless battery</td></tr>
									<tr
										><td><b>Coupon book (legendary)</b></td><td
											>A sale every time you walk into a shop?</td
										></tr
									>
								</tbody>
							</table>
						</div>
						<h3>Treasures and other items</h3>
						<p>
							Everything else the notes mention. Each wizard's own treasures (Ol' Trusty, the super
							compass, the battery and the rest) are on their cards on the Wizards tab, and the Four
							Treasures are on the World tab.
						</p>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Item</th><th>Where from</th><th>Effect</th></tr></thead>
								<tbody>
									<tr
										><td><b>Cupid's arrow</b></td><td><span class="open">Open</span></td><td
											>Shoot it in combat (it's exhausted, and comes back after a recall effect), or
											use it out of combat to bring two people closer</td
										></tr
									>
									<tr
										><td><b>Love letter</b></td><td><span class="open">Open</span></td><td
											>Improves morale. The letter is "reigning truth"</td
										></tr
									>
									<tr
										><td><b>Cornucopia</b></td><td><span class="open">Open</span></td><td
											>Goes in any food slot for free. In the misc slot it might offer a choice, or
											scale up everything else</td
										></tr
									>
									<tr
										><td><b>Tom Riddle's diary</b></td><td>A journal you pick up</td><td
											>Spawns a basilisk</td
										></tr
									>
									<tr
										><td><b>Other people's journals</b></td><td>Found on the map</td><td
											>Finding one makes its writer more famous</td
										></tr
									>
									<tr
										><td><b>Santa's sack</b></td><td>Santa's workshop</td><td
											><span class="open">Open</span></td
										></tr
									>
									<tr
										><td><b>The Minotaur's horn</b></td><td>Kill the Minotaur in the labyrinth</td
										><td><span class="open">Open</span></td></tr
									>
									<tr
										><td><b>Endless wine bottle</b></td><td>Dionysus, at Olympus</td><td
											>Throw a party while resting: morale, hunger and a little rest</td
										></tr
									>
									<tr
										><td><b>Fountain of Youth water</b></td><td
											>The Fountain of Youth, once industrialized</td
										><td>Sells high. Boosts morale, or makes potions stronger</td></tr
									>
									<tr
										><td><b>Whistle</b></td><td>The General</td><td
											>Orders take less time and reach further</td
										></tr
									>
									<tr
										><td><b>Time stone</b></td><td>Thomas</td><td
											>Costs mana to use and builds up its own magic each turn, adding fast-forward
											and rewind cards</td
										></tr
									>
									<tr
										><td><b>Origin flag</b></td><td>A difficulty twist</td><td
											>Must be carried to the City of Gold. Weighs 10, and is a useless card in
											combat</td
										></tr
									>
									<tr
										><td><b>Crutch</b></td><td><span class="open">Open</span></td><td
											>A healing aid that speeds up passive healing</td
										></tr
									>
									<tr
										><td><b>Shields</b></td><td><span class="open">Open</span></td><td
											>Works like a weapon: powers your basic block cards, or adds a special card of
											its own based on the shield. No direction to pick</td
										></tr
									>
									<tr
										><td><b>Arrows</b></td><td><span class="open">Open</span></td><td
											>Bows might need them, and special arrows could exist</td
										></tr
									>
									<tr
										><td><b>Candles, wood and bulbs</b></td><td><span class="open">Open</span></td
										><td>Light sources that give bonuses at night</td></tr
									>
									<tr
										><td><b>Alcohol</b></td><td><span class="open">Open</span></td><td
											>Boosts morale, but slows learning</td
										></tr
									>
								</tbody>
							</table>
						</div>
					</section>

					<section>
						<h2>Potions</h2>
						<p>
							One-use bottles, some for combat and some for outside it. Brewed from ME (better at a
							brewery), bought, or found.
						</p>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Potion</th><th>Rarity</th><th>Effect</th></tr></thead>
								<tbody>
									<tr
										><td><b>Bomb (or FrF)</b></td><td>Common</td><td
											>10 damage to one enemy and 5 to those next to it</td
										></tr
									>
									<tr
										><td><b>Poison</b></td><td>Common / epic</td><td
											>Minor (common): 1 damage over 5 turns. Major (epic): 3 damage a turn until
											the enemy dies</td
										></tr
									>
									<tr
										><td><b>Carrot juice</b></td><td>Common</td><td
											>Permanently see 1 tile further</td
										></tr
									>
									<tr
										><td><b>Invisibility</b></td><td>Rare</td><td
											>Invisible to enemies for a day (5 turns)</td
										></tr
									>
									<tr
										><td><b>Bottle of roids</b></td><td>Rare</td><td>+1 strength, permanently</td
										></tr
									>
									<tr
										><td><b>Love potion</b></td><td>Rare</td><td
											>Instantly improves how two friendly characters get on, or how a city or
											trader sees your team</td
										></tr
									>
									<tr
										><td><b>Teleportation</b></td><td>Rare</td><td
											>Go anywhere you've already found</td
										></tr
									>
									<tr
										><td><b>Flight</b></td><td>Rare–epic</td><td
											>Five random common potion effects</td
										></tr
									>
									<tr
										><td><b>1UP</b></td><td>Epic</td><td>Revives a character the moment they die</td
										></tr
									>
									<tr
										><td><b>Lightning in a bottle</b></td><td>Epic</td><td
											>25 damage to one enemy</td
										></tr
									>
									<tr
										><td><b>Oracle juice</b></td><td>Legendary</td><td
											>Reveals the City of Gold and every tile around it</td
										></tr
									>
									<tr
										><td><b>The Big Kahuna</b></td><td>Legendary</td><td
											>Wipe out a city, or 50 damage to every enemy in a fight</td
										></tr
									>
									<tr
										><td><b>Mirror dimension</b></td><td>Legendary</td><td
											>Sends your whole group to the mirror dimension? <span class="open">Open</span
											></td
										></tr
									>
									<tr
										><td><b>Liquid luck</b></td><td><span class="open">Open</span></td><td
											>Everything this character does for a day has the best outcome</td
										></tr
									>
									<tr
										><td><b>Liquid mana</b></td><td><span class="open">Open</span></td><td
											>Gives 1 mana. Brew it to store mana beyond your carry-over max</td
										></tr
									>
								</tbody>
							</table>
						</div>
					</section>
				</article>
			{:else if tab === 'world'}
				<article>
					<section>
						<h2>Locations of legend</h2>
						<p>
							Places from myth and history, hidden in the fog as rumors. Finding one makes its
							stories grow, and it gets richer for later expeditions.
						</p>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Location</th><th>What it does</th></tr></thead>
								<tbody>
									<tr><td><b>Sierra de la Plata</b></td><td>The mountain of silver</td></tr>
									<tr><td><b>Norumbega</b></td><td>A city of riches</td></tr>
									<tr><td><b>Paititi</b></td><td>Another city of riches</td></tr>
									<tr><td><b>Camelot</b></td><td>Still to be worked out</td></tr>
									<tr><td><b>Mount Meru</b></td><td>Still to be worked out</td></tr>
									<tr><td><b>Atlantis</b></td><td>Still to be worked out</td></tr>
									<tr
										><td><b>Muspelheim</b></td><td
											>Fire monsters, as a place or as the monsters themselves</td
										></tr
									>
									<tr
										><td><b>Niflheim</b></td><td
											>Muspelheim's frozen partner. There should be an ice biome too</td
										></tr
									>
									<tr
										><td><b>Ryūgū-jō</b></td><td>The undersea palace of the Japanese dragon</td></tr
									>
									<tr
										><td><b>Mount Olympus</b></td><td
											>For real. A mountain that, the first time you summit it, gives one of your
											party a demigod trait (see Olympus below)</td
										></tr
									>
									<tr
										><td><b>The Labyrinth</b></td><td
											>Anywhere. A constantly shifting maze with the Minotaur and lesser beasts
											inside, so getting out isn't easy. Kill the Minotaur for its horn. Escape for
											an epithet, or lose the run inside and become the Lost. Spend long enough in
											it to find Daedalus' Journal and the moving-building blueprint</td
										></tr
									>
									<tr
										><td><b>Library of Alexandria</b></td><td
											>Found in deserts, more often near rivers. Holds 5 random books or scrolls
											(room for 10), and keeps what you leave. A unit working it makes a book or
											scroll every 8 parts of day (6 for a researcher, and 10% better). A wizard who
											can see it gets 1 research a turn. A librarian also makes money trading books</td
										></tr
									>
									<tr
										><td><b>Fountain of Youth</b></td><td
											>People heal faster nearby, and units within 3 tiles get 3 rest a part of day.
											Units may work non-stop. Once industrialized it's walled off, bottled and sold</td
										></tr
									>
									<tr
										><td><b>Garden of Eden</b></td><td
											>Any green area. Makes 5 food, gives +1 food to every tile around it, and
											can't be built on. Each time a wizard comes within 3 tiles it gains a
											temptation (the wizard gains 3 knowledge, maybe 1 research). At 15, both
											wizards become sinners: +3 wisdom, and a penalty</td
										></tr
									>
									<tr
										><td><b>Scholomance</b></td><td
											>Dark and devil spells cost less to learn for each part of a day spent there.
											A battle with the devil. Might clash with the witch expansion</td
										></tr
									>
									<tr
										><td><b>Hogwarts</b></td><td
											>Helps you learn. Choose a house for a bonus, with a tree that protects it</td
										></tr
									>
									<tr
										><td><b>Santa's workshop</b></td><td
											>Makes toys (money and morale). Get an elf, and Santa's sack</td
										></tr
									>
									<tr
										><td><b>Baba Yaga's house</b></td><td
											>Wanders around a forest. Meeting it can go well or badly</td
										></tr
									>
									<tr
										><td><b>Fortress of Solitude</b></td><td
											>In frozen biomes. Nobody there can be attacked. The first wizard to arrive
											gets the "super" trait: +3 strength and speed during the day</td
										></tr
									>
									<tr
										><td><b>The four Irish islands</b></td><td
											>The Four Treasures of the Tuatha Dé Danann: four cities, each with a treasure
											(see below)</td
										></tr
									>
									<tr
										><td><b>The beanstalk</b></td><td
											>Plant beans near something magical and a stalk may grow. Climb it if you can</td
										></tr
									>
									<tr
										><td><b>The Aerie</b></td><td
											>On top of a plateau; the trick is getting up there</td
										></tr
									>
									<tr
										><td><b>El Capitan</b></td><td
											>Climb it for the first time to earn the Captain epithet</td
										></tr
									>
									<tr><td><b>Rainbows and pots of gold</b></td><td>Still to be worked out</td></tr>
									<tr
										><td><b>Roanoke</b></td><td
											>The colony's sudden disappearance can be part of the world</td
										></tr
									>
									<tr
										><td><b>The gates of hell</b></td><td
											>An alternate ending, not necessarily a violent one</td
										></tr
									>
									<tr
										><td><b>The edge of the world</b></td><td
											>Makes finding the map's edge a reward instead of just a wall</td
										></tr
									>
									<tr
										><td><b>The Golden Circle</b></td><td
											>In Iceland. A location of legend, or at least something with more around it</td
										></tr
									>
									<tr
										><td><b>Bárður's legend</b></td><td
											>"The legend of Bordur" from the notes: probably Bárður Snæfellsás, the
											half-troll guardian of Snæfellsjökull. <span class="open">Open</span></td
										></tr
									>
									<tr
										><td><b>Þorri</b></td><td
											>The Icelandic winter god (Iceland has only winter and spring), and his
											midwinter feast, Þorrablót</td
										></tr
									>
									<tr
										><td><b>Iceland's legends</b></td><td
											>How its land masses formed, its fantastic beasts, and the folk tales below</td
										></tr
									>
								</tbody>
							</table>
						</div>

						<p class="aside">
							Legendary artifacts whose location didn't spawn can still turn up with traveling
							salesmen.
						</p>
						<h3>Olympus</h3>
						<p>Pick who in your party receives the gift, then choose from 3 of the 12 gods.</p>
						<div class="options">
							<h4>Options: how the gods choose</h4>
							<ul>
								<li>
									Which god bestows something on you is limited by their bias: only gods who favor
									you will offer a gift.
								</li>
								<li>
									The gods still give you the choice, but you may have to complete a quest before
									the reward arrives. How hard it is depends on how that god sees you.
								</li>
							</ul>
						</div>
						<div class="table-wrap">
							<table>
								<thead><tr><th>God</th><th>Gift</th></tr></thead>
								<tbody>
									<tr
										><td><b>Zeus</b></td><td>Learn a lightning spell: a powerful lobbed attack</td
										></tr
									>
									<tr
										><td><b>Hera</b></td><td
											>Marries your two wizards: their relationship goes to max, they lose 5% less
											morale while together, and either can cast the other's spells in combat</td
										></tr
									>
									<tr
										><td><b>Poseidon</b></td><td
											>Learn tsunami: a crashing wave that weakens the further back it goes</td
										></tr
									>
									<tr
										><td><b>Demeter</b></td><td
											>A farm blessing that permanently gives +1 food, and 4 more food when this
											character works a tile</td
										></tr
									>
									<tr
										><td><b>Athena</b></td><td>+10 wisdom, and 5% more knowledge from combat</td
										></tr
									>
									<tr><td><b>Apollo</b></td><td>A bonus during the day</td></tr>
									<tr
										><td><b>Artemis</b></td><td
											>A bonus at night, more food from hunting, and two quick shots</td
										></tr
									>
									<tr
										><td><b>Ares</b></td><td
											>+5 strength, and every unit within 2 tiles gets +1 to all military traits</td
										></tr
									>
									<tr
										><td><b>Hephaestus</b></td><td
											>+1 armor, and craftsmen need 10% fewer resources</td
										></tr
									>
									<tr><td><b>Aphrodite</b></td><td>+10 swagger</td></tr>
									<tr><td><b>Hermes</b></td><td>+10 speed</td></tr>
									<tr
										><td><b>Dionysus</b></td><td
											>+3 swagger, and an endless wine bottle to throw a party while resting:
											morale, hunger and a little rest</td
										></tr
									>
								</tbody>
							</table>
						</div>
						<h3>The Four Treasures of the Tuatha Dé Danann</h3>
						<p>
							Four cities, each holding a unique artifact. Each spawns in a set direction from the
							City of Gold, so finding one hints at where it is.
						</p>
						<div class="table-wrap">
							<table>
								<thead
									><tr><th>City</th><th>Direction</th><th>Treasure</th><th>Effect</th></tr></thead
								>
								<tbody>
									<tr
										><td><b>Falias</b></td><td>North</td><td>Stone of Fál (Lia Fáil)</td><td
											>Stays put. It can cry out for one of your wizards, making them a king who can
											found a nation. The stronger you are when you find it, the better the odds it
											accepts you. The Hill of Tara spawns next to it</td
										></tr
									>
									<tr
										><td><b>Gorias</b></td><td>East</td><td>Spear of Lugh</td><td
											>A weapon. All its holder's attacks count as lobbed and ignore armor, and it
											adds a unique spell to the deck</td
										></tr
									>
									<tr
										><td><b>Findias</b></td><td>South</td><td>Sword of Light (Núada's)</td><td
											>A weapon. In legend no one escaped it once drawn, and no one could resist it. <span
												class="open">Open</span
											></td
										></tr
									>
									<tr
										><td><b>Murias</b></td><td>West</td><td>Cauldron of the Dagda</td><td
											>Its holder no longer needs food</td
										></tr
									>
								</tbody>
							</table>
						</div>
						<p class="aside">
							Unlike the legend, gathering all four does nothing special, besides making you very
							strong.
						</p>
						<h3>Iceland</h3>
						<p>
							Folk tales from the Iceland photos. Any of them could become a location, an encounter
							or an item. <span class="open">Open</span> Which ones, and what they do.
						</p>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Legend</th><th>Where</th><th>The story</th></tr></thead>
								<tbody>
									<tr
										><td><b>Þrasi's chest of gold</b></td><td>Skógafoss</td><td
											>A settler hid a chest of gold behind the waterfall. Three men tried to pull
											it out with a hook in its iron ring, but the ring came loose; it now hangs on
											the church door at Skógar. "Rewards the one who ventures there with endless
											riches, great and small"</td
										></tr
									>
									<tr
										><td><b>The Fálki well</b></td><td>Öndverðarnes</td><td
											>An ancient well with three sources: fresh water, holy water (very healthy)
											and ale. Drawing from it after sundown brings bad luck</td
										></tr
									>
									<tr
										><td><b>The seal skin</b></td><td>Reynisfjara</td><td
											>Once a year seals come ashore and shed their skins to dance. A man hid one
											skin and married the seal-woman; years later she found the key and returned to
											the sea ("seven children in the sea, and seven on land"), and ever after
											brought him fish and luck</td
										></tr
									>
									<tr
										><td><b>The merman of Vogar</b></td><td>Vogar (Heifer Bays)</td><td
											>A farmer caught a merman, who told him where buried gold was. Released, it
											sent him a herd of grey sea-cows, the best milk cows in Iceland</td
										></tr
									>
									<tr
										><td><b>Sæmundur the Wise</b></td><td>Oddi</td><td
											>Studied at the Black School, which taught magic. He tricked the Devil into
											carrying him home as a seal, then hit it with his Psalter just before land</td
										></tr
									>
									<tr
										><td><b>Egill's treasure</b></td><td>Mosfell</td><td
											>The saga hero Egill Skallagrímsson buried two chests of English silver there</td
										></tr
									>
									<tr
										><td><b>Rauðhöfði (Redhead)</b></td><td>Hvalfjörður</td><td
											>A man who refused to own his child by an elven woman was cursed into a
											red-headed whale that drowned many. A pastor with magic led it up the Glymur
											waterfall to Whale Lake, where it died; its bones are still there</td
										></tr
									>
									<tr
										><td><b>The Serpent of Skorradalur</b></td><td>Skorradalur Lake</td><td
											>A slug kept on a gold ring grew into a monstrous serpent, put down by a
											hymn-writer's incantations. Monsters were also said to live in Baulárvellir
											Lake, and sea-cows in Haukadalur Lake</td
										></tr
									>
									<tr
										><td><b>The trolls of the west</b></td><td>Kerlingarskarð, Hítardalur</td><td
											>Trolls who prank travelers. Hít held great feasts for giants, and one
											trollwife was turned to stone by the rising sun</td
										></tr
									>
									<tr
										><td><b>Hruni</b></td><td>Hruni church</td><td
											>A pastor's Christmas-night dance got so scandalous that the Devil dragged
											everyone into Hell, church and all</td
										></tr
									>
									<tr
										><td><b>The Fróðá wonders</b></td><td>Fróðá</td><td
											>Strange deaths, blood raining down, and drowned sailors by the hearth, until
											16 ghosts were exorcised</td
										></tr
									>
									<tr
										><td><b>Kampholtsmóri</b></td><td>Kampholt</td><td
											>The ghost of a boy turned out to die in the Haze Famine. He haunts the
											farmer's descendants, and vehicles stall nearby</td
										></tr
									>
									<tr
										><td><b>Móri of Írafell</b></td><td>Möðruvellir</td><td
											>A ghost who crouched on a rafter waiting to be served food like the rest of
											the household</td
										></tr
									>
									<tr
										><td><b>Krosslaug</b></td><td>Lundarreykjadalur</td><td
											>A warm spring where westerners were baptized around 1000 AD, said to heal</td
										></tr
									>
									<tr
										><td><b>Skúli's Run</b></td><td>Kaldidalur</td><td
											>A man condemned to death fled on his horse Sörli, which outran eight pursuers
											and carried him home before dying of exhaustion</td
										></tr
									>
									<tr
										><td><b>The sorcerer burnings</b></td><td>Þingvellir</td><td
											>In the 17th century, alleged sorcerers were burned at the stake in the Fire
											Gorge</td
										></tr
									>
									<tr
										><td><b>Elf stones</b></td><td>Anywhere</td><td
											>Some rocks are home to elves and shouldn't be moved</td
										></tr
									>
									<tr
										><td><b>The Black Death</b></td><td>Maríuhöfn</td><td
											>Arrived by ship in 1402 and killed about half of Iceland</td
										></tr
									>
								</tbody>
							</table>
						</div>
					</section>

					<section>
						<h2>Monsters</h2>
						<p>
							Every monster, beast and boss is on the
							<button type="button" class="link" on:click={() => pickTab('monsters')}
								>Monsters</button
							>
							tab.
						</p>
					</section>

					<section>
						<h2>Quests and towns</h2>
						<p>Every item now lives on the Items tab.</p>
						<ul>
							<li>
								<b>The pirate quest:</b> cursed treasure, maybe the Kraken, and the Pirate epithet. Pirates
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
			{:else if tab === 'monsters'}
				<article class="rules">
					<p class="intro">
						Every monster so far, and how they work. Monsters grow stronger as a run goes on, and
						the world is more dangerous the closer you get to the City of Gold.
					</p>

					<section>
						<h2>How monsters work</h2>
						<h3>Where they appear</h3>
						<ul>
							<li>
								<b>Unexplored land is dangerous.</b> Monsters live out in the wild. The more unexplored
								land around you, and the more dangerous it is, the more likely they are to find you.
							</li>
							<li><b>Buildings push them back.</b> Monsters spawn less near your buildings.</li>
							<li>
								<b>Biomes decide what lives there.</b> The harsh biomes near the City of Gold have their
								own (ice monsters in the arctic, stronger animals in the enchanted forest), and locations
								of legend have their own guardians.
							</li>
							<li>
								<b>They scale up.</b> Monster strength grows exponentially over a run, so a run that
								drags on gets harder.
							</li>
						</ul>
						<h3>How they attack</h3>
						<ul>
							<li>
								<b>At night</b> your units and buildings can be attacked. The odds depend on how much
								unexplored land is nearby and how dangerous it is.
							</li>
							<li>
								<b>Defending:</b> defenders get a bonus from the building they're in, and units
								woken up by an attack are <b>startled</b>. Heavy sleepers aren't woken.
							</li>
							<li>
								<b>By day</b> whoever starts a fight attacks, and it opens in attack mode, so you can
								go after monsters yourself.
							</li>
							<li>
								Fights use the normal combat rules (see
								<button type="button" class="link" on:click={() => pickTab('rules')}>Combat</button>
								in the rules draft): units stacked in corps, where the units in front protect the ones
								behind, and flanking gets past that.
							</li>
						</ul>
						<h3>What they drop</h3>
						<ul>
							<li>
								Winning a fight gives wizards knowledge and units combat experience. Monsters drop
								artifacts and silver; animals drop food.
							</li>
							<li>Killing an enemy boosts the killer's morale, and winning boosts everyone's.</li>
							<li>
								Killing a monster can change how nearby towns see you: thankful if it terrorized
								them, angry if they worshipped it.
							</li>
						</ul>
						<h3>Difficulty</h3>
						<ul>
							<li>Each difficulty level makes monsters grow 5% faster (up to 50%).</li>
							<li>
								<b>Fighting forest:</b> monsters are 10% more aggressive, and passive animals are rarer.
							</li>
							<li><b>Mother's guidance:</b> monsters start working together.</li>
							<li><b>Multiple protectors:</b> a second boss, and 5% more monsters.</li>
						</ul>
					</section>

					<section>
						<h2>Kinds</h2>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Kind</th><th>Who</th><th>Behavior</th></tr></thead>
								<tbody>
									<tr
										><td><b>Passive</b></td><td>Animals</td><td>Never attack. Hunted for food</td
										></tr
									>
									<tr
										><td><b>Neutral</b></td><td>Humans</td><td
											>Only attack when provoked, or when they severely dislike you</td
										></tr
									>
									<tr
										><td><b>Hostile</b></td><td>Monsters</td><td
											>Attack your units and bases, mostly at night</td
										></tr
									>
									<tr
										><td><b>Enemies of legend</b></td><td>Mini-bosses</td><td
											>Guard a place, like Slay the Spire's elites</td
										></tr
									>
									<tr
										><td><b>Final bosses</b></td><td>Guardians of the City of Gold</td><td
											>The last fight of a run</td
										></tr
									>
								</tbody>
							</table>
						</div>
					</section>

					<section>
						<h2>Passive: animals</h2>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Animal</th><th>Where</th><th>Notes</th></tr></thead>
								<tbody>
									<tr
										><td><b>Deer and other game</b></td><td>Everywhere; smaller game in forests</td
										><td>Hunted for meat. Scavengers get more food from them</td></tr
									>
									<tr><td><b>Cattle</b></td><td>Farms and plains</td><td>Twice as much meat</td></tr
									>
									<tr><td><b>Sheep</b></td><td>Farms and plains</td><td>Killed for meat</td></tr>
									<tr
										><td><b>Horses</b></td><td>Wandering the plains</td><td
											>Can be ridden or work a farm, and give meat when they die</td
										></tr
									>
									<tr
										><td><b>Fish</b></td><td>Rivers and oceans</td><td
											>Maybe an endless supply. <span class="open">Open</span></td
										></tr
									>
									<tr
										><td><b>Stronger animals</b></td><td>The enchanted forest</td><td
											>Souped-up versions of normal animals</td
										></tr
									>
								</tbody>
							</table>
						</div>
						<p>
							Some animals can join you as inhuman units instead: a dragon, a dog, or a bird that
							flies out and scouts.
						</p>
					</section>

					<section>
						<h2>Neutral: humans</h2>
						<p>
							People won't attack you unless you provoke them, or they severely dislike you. Your
							notoriety, your evil deeds and how you've treated them all count: a city that hates
							you on sight, or has a reward out for your arrest, can come after you.
						</p>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Who</th><th>Where</th><th>Notes</th></tr></thead>
								<tbody>
									<tr
										><td><b>Towns and cities</b></td><td>Settlements across the map</td><td
											>Trade, quests and help. They can turn on you if you kill a monster they
											worshipped</td
										></tr
									>
									<tr
										><td><b>Traveling salesmen and traders</b></td><td>On the road</td><td
											>Sell rare artifacts and blueprints, then move on</td
										></tr
									>
									<tr
										><td><b>Other wizard groups</b></td><td>Brought by the king's ship</td><td
											>Settlers who may become friends or enemies</td
										></tr
									>
									<tr
										><td><b>Fur tradesmen</b></td><td>On the road</td><td
											>Travel and take pelts from slain animals</td
										></tr
									>
								</tbody>
							</table>
						</div>
					</section>

					<section>
						<h2>Hostile: monsters</h2>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Monster</th><th>Where</th><th>Notes</th></tr></thead>
								<tbody>
									<tr><td><b>Fire monsters</b></td><td>Muspelheim</td><td>From Norse legend</td></tr
									>
									<tr
										><td><b>Ice monsters and yetis</b></td><td>The ice arctic</td><td
											>From Inuit legend</td
										></tr
									>
									<tr
										><td><b>Lesser beasts</b></td><td>The labyrinth</td><td
											>Roam the shifting maze with the Minotaur</td
										></tr
									>
									<tr
										><td><b>Basilisk</b></td><td>Spawned by Tom Riddle's diary</td><td
											>One of the journals you can find</td
										></tr
									>
									<tr
										><td><b>Whomping Willow monster</b></td><td>Forests</td><td
											>A tree that fights back. <span class="open">Open</span></td
										></tr
									>
									<tr
										><td><b>The Lorax</b></td><td>Forests</td><td
											>Comes for anyone clearing a forest</td
										></tr
									>
									<tr
										><td><b>Trolls and ghosts</b></td><td>Iceland</td><td
											>From the folk tales on the World &amp; legends tab</td
										></tr
									>
								</tbody>
							</table>
						</div>
					</section>

					<section>
						<h2>Enemies of legend</h2>
						<p>Mini-bosses, like Slay the Spire's elites.</p>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Enemy</th><th>Where</th><th>Notes</th></tr></thead>
								<tbody>
									<tr
										><td><b>The Minotaur</b></td><td>The labyrinth</td><td
											>Killing it gives you its horn</td
										></tr
									>
									<tr
										><td><b>The Kraken</b></td><td>The sea, maybe on the pirate quest</td><td
											>Killing it can win over the towns it was terrorizing</td
										></tr
									>
									<tr
										><td><b>The devil</b></td><td>Scholomance</td><td
											>A unique battle there. Also a final boss with the witch expansion</td
										></tr
									>
								</tbody>
							</table>
						</div>
					</section>

					<section>
						<h2>Final bosses</h2>
						<p>
							The City of Gold is guarded by a legendary boss, with more added in expansions. The
							multiple protectors difficulty adds a second one.
						</p>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Boss</th><th>Where</th><th>Notes</th></tr></thead>
								<tbody>
									<tr
										><td><b>Cerberus</b></td><td>The City of Gold</td><td>A legendary guardian</td
										></tr
									>
									<tr
										><td><b>A dragon</b></td><td>The City of Gold</td><td>A legendary guardian</td
										></tr
									>
									<tr
										><td><b>The devil</b></td><td>The City of Gold</td><td
											>Added with Wyla's witch expansion</td
										></tr
									>
								</tbody>
							</table>
						</div>
					</section>

					<section>
						<h2>Fantastic beasts of Iceland</h2>
						<p>
							From the poster in the Iceland photos. <span class="open">Open</span> Which kind each one
							is.
						</p>
						<div class="table-wrap">
							<table>
								<thead><tr><th>Beast</th><th>English name</th></tr></thead>
								<tbody>
									<tr><td><b>Sækýr</b></td><td>Sea cow</td></tr>
									<tr><td><b>Fjörulalli</b></td><td>Beach walker</td></tr>
									<tr><td><b>Bjarndýrakóngur</b></td><td>King of the bears</td></tr>
									<tr><td><b>Nykur</b></td><td>Water-horse</td></tr>
									<tr><td><b>Hrosshvalur</b></td><td>Horse-whale</td></tr>
									<tr><td><b>Vatnaormur</b></td><td>Water serpent</td></tr>
									<tr><td><b>Skötumóðir</b></td><td>Skate mother</td></tr>
									<tr><td><b>Selamóðir</b></td><td>Seal mother</td></tr>
									<tr><td><b>Rauðkembingur</b></td><td>Red-crest</td></tr>
									<tr><td><b>Urðarköttur</b></td><td>Ghoul cat</td></tr>
									<tr><td><b>Skeljungur</b></td><td>Shell whale</td></tr>
									<tr><td><b>Skuggabaldur</b></td><td>Shadow Baldur</td></tr>
									<tr><td><b>Öfuguggi</b></td><td>Reverse-fin trout</td></tr>
									<tr><td><b>Eiturgedda</b></td><td>Poisonous pike</td></tr>
									<tr><td><b>Múshveli</b></td><td>Mouse-whale</td></tr>
								</tbody>
							</table>
						</div>
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
