<!-- src/routes/ww/+page.svelte -->
<!--
	Wealthy Wizards: the rules to the board game, the games either side of it,
	and the design notes. Hidden: nothing links here, and it asks not to be
	indexed.

	The rules are the 2023 rule book with the 0.2.1 planned fixes applied, gaps
	filled from the older overview doc. Anything still undecided is marked with
	an "Open" tag so it reads as unfinished rather than as a rule.

	notes.txt is the brainstorm file as written, rendered as-is on the Notes tab.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import '../../app.css';
	import notesText from './notes.txt?raw';

	// rules | saga | notes. Kept in the URL hash so a reload stays on the same tab.
	const TABS = [
		{ id: 'rules', label: 'Rules' },
		{ id: 'saga', label: 'Before & after' },
		{ id: 'notes', label: 'Notes' }
	];
	let tab = 'rules';

	onMount(() => {
		const hash = location.hash.slice(1);
		if (TABS.some((t) => t.id === hash)) tab = hash;
	});

	function pickTab(t: string) {
		tab = t;
		history.replaceState(history.state, '', t === 'rules' ? location.pathname : `#${t}`);
	}

	// --- the notes file, as blocks of headings, paragraphs and card lists ---

	type Block =
		| { kind: 'heading'; text: string }
		| { kind: 'para'; text: string }
		| { kind: 'list'; items: { done: boolean; text: string }[] };

	// ✓ marks an idea that made it onto a card, ◦ one that hasn't yet.
	const MARK = /^([✓◦])\s*/;

	function isHeading(line: string): boolean {
		return (line.endsWith(':') && line.length < 40) || /^Wealthy wizards \d/i.test(line);
	}

	function parseNotes(text: string): Block[] {
		const blocks: Block[] = [];
		for (const raw of text.split('\n')) {
			const line = raw.trim();
			if (!line) continue;
			const mark = line.match(MARK);
			if (mark) {
				const item = { done: mark[1] === '✓', text: line.replace(MARK, '') };
				const last = blocks[blocks.length - 1];
				if (last?.kind === 'list') last.items.push(item);
				else blocks.push({ kind: 'list', items: [item] });
			} else if (isHeading(line)) {
				blocks.push({ kind: 'heading', text: line.replace(/:$/, '') });
			} else {
				blocks.push({ kind: 'para', text: line });
			}
		}
		return blocks;
	}

	const notes = parseNotes(notesText);
	let search = '';

	$: needle = search.trim().toLowerCase();
	$: shownNotes = needle
		? notes
				.map((b): Block | null => {
					if (b.kind === 'list') {
						const items = b.items.filter((i) => i.text.toLowerCase().includes(needle));
						return items.length ? { kind: 'list', items } : null;
					}
					return b.kind === 'para' && b.text.toLowerCase().includes(needle) ? b : null;
				})
				.filter((b): b is Block => b !== null)
		: notes;
	$: matchCount = shownNotes.reduce((n, b) => n + (b.kind === 'list' ? b.items.length : 1), 0);
</script>

<svelte:head>
	<title>Wealthy Wizards</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="container">
	<main>
		<header class="hero">
			<p class="eyebrow">A board game</p>
			<h1>Wealthy Wizards</h1>
			<p class="tagline">
				3–6 wizards have finally found the City of Gold. Only one of them gets to rule it.
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

		{#if tab === 'rules'}
			<article class="rules">
				<nav class="toc" aria-label="Rules contents">
					<a href="#ww-story">The story</a>
					<a href="#ww-money">Money</a>
					<a href="#ww-setup">Setting up the city</a>
					<a href="#ww-start">Your starting deck</a>
					<a href="#ww-words">Words to know</a>
					<a href="#ww-passives">Passives</a>
					<a href="#ww-turn">Your turn</a>
					<a href="#ww-land">Land tiles</a>
					<a href="#ww-health">Health & respawning</a>
					<a href="#ww-keywords">Keywords</a>
					<a href="#ww-heroes">Heroes</a>
					<a href="#ww-end">Ending & scoring</a>
				</nav>

				<section id="ww-story">
					<h2>The story</h2>
					<p class="lore">
						After hours upon days upon weeks upon years of treacherous land and walking in circles,
						the mighty fine young wizard that is yourself has finally found the City of Gold. With
						the magical energy harnessed in gold and your determination, there is no doubt you will
						become one of the great wizards of history, the kind they tell stories of for years to
						come.
					</p>
					<p class="lore">
						Scanning the landscape of the city before you, you slowly realize you are not the only
						wizard to have just stumbled across this world of infinite potential. You quickly get
						out your pop-a-castle and prepare to stake your claim to your destiny…
					</p>
					<p class="lore">
						As fortunate as you are, you look down at your feet and find <em>Wizarding 101</em>: an
						introduction into how to be a wizard and settle the City of Gold, by JJEW the Judge.
					</p>
				</section>

				<section id="ww-money">
					<h2>Money</h2>
					<p>The first thing any wizard needs to know about is money.</p>
					<div class="cards-2">
						<div class="card silver">
							<h3>Silver</h3>
							<p>
								The money of men. It won't do you as much good with wizards or in the City of Gold,
								but having some is never a bad idea, because you can exchange it for gold: in the
								city, <b>3 silver merges into 1 gold</b>.
							</p>
						</div>
						<div class="card gold">
							<h3>Gold</h3>
							<p>
								The good stuff. Humans value gold for its beauty, but what they don't realize is
								that gold itself harnesses magic. Gold buys everything the city sells: scrolls to
								cast new spells, blueprints for buildings, and magical artifacts.
							</p>
							<p>
								You can also <b>extract</b> gold: return it to the city and squeeze out
								<b>3 ME</b> (with some added knowledge, even more).
							</p>
						</div>
					</div>
					<h3>Your wealth</h3>
					<p>
						Silver and gold are cards in your deck. Whenever you draw one, it goes into your
						<b>wealth</b> instead of staying in your hand. Your wealth is the money you have
						available to spend. The <b>first time each turn</b> you add a silver to your wealth, draw
						a card.
					</p>
				</section>

				<section id="ww-setup">
					<h2>Setting up the city</h2>
					<p>
						The City of Gold expands with the number of wizards in it. The city's gold is a pile of
						gold cards. When it runs out, the game ends.
					</p>
					<div class="table-wrap">
						<table>
							<thead>
								<tr>
									<th>Players</th>
									<th>City's starting gold</th>
									<th>Board</th>
									<th>Spells & buildings</th>
									<th>Artifacts</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td>3</td>
									<td>40</td>
									<td>Shape A <span class="open">Open</span></td>
									<td>2 fewer copies of each spell, 1 fewer of each building</td>
									<td>2 from each tier, plus 1 more</td>
								</tr>
								<tr>
									<td>4</td>
									<td>50</td>
									<td>Shape A</td>
									<td>Full set</td>
									<td>2 from each tier, plus 2 more</td>
								</tr>
								<tr>
									<td>5</td>
									<td>60</td>
									<td>Shape B</td>
									<td>2 fewer copies of each spell, 1 fewer of each building</td>
									<td>3 from each tier, plus 1 more</td>
								</tr>
								<tr>
									<td>6</td>
									<td>70</td>
									<td>Shape B</td>
									<td>Full set</td>
									<td>3 from each tier, plus 2 more</td>
								</tr>
							</tbody>
						</table>
					</div>
					<p class="aside">
						<span class="open">Open</span> The board shapes still need names and layouts, and the "how
						many different spells and buildings" counts aren't set yet.
					</p>

					<h3>Choosing what's in the city</h3>
					<p>
						For a first game there is a suggested set of spells, buildings and artifacts (the
						alliteration spells), and suggested heroes. <span class="open">Open</span> The suggested
						lists aren't written yet. After your first game or two, everything around the city is random:
					</p>
					<ul>
						<li>
							<b>Spells:</b> shuffle the spell randomizer deck (one copy of each spell, with a different
							card back) and pull the number of spells you need.
						</li>
						<li>
							<b>Buildings:</b> shuffle the whole building stack and pull cards until you have the number
							of different buildings you need, then find their remaining copies. Return copies now if
							your player count needs fewer.
						</li>
						<li>
							<b>Artifacts:</b> sort them by tier (each tier has its own token). Randomly take the number
							you need from each tier, shuffle all the leftovers together, then take the extra ones from
							that pile.
						</li>
					</ul>

					<h3>Choosing heroes</h3>
					<p>
						Heroes are the only part that isn't random. For your first few games, everyone picks the
						hero whose name sounds the most interesting.
						<span class="open">Open</span> A short list of heroes to avoid in a first game still needs
						writing.
					</p>
					<p>
						Once you've played as or with every hero, there is a draft. It happens after the spells,
						buildings and artifacts are chosen. Everyone rolls the die; whoever rolls
						<b>lowest</b> picks first, and the draft goes <b>counter-clockwise</b> from them. The
						player who picked last takes the first turn, and play then goes <b>clockwise</b>.
					</p>
					<p class="aside">
						Mixing new apprentices with old wizards (by games played, not age)? Let the apprentices
						pick by name, and draft the rest afterwards if you like.
					</p>
				</section>

				<section id="ww-start">
					<h2>Your starting deck</h2>
					<p>
						Even as a starting wizard you have a few tricks up your sleeve. You brought 5 silver in
						with you, and finding the City of Gold granted you 2 gold. Shuffle these together with 2
						copies of each starting spell to make your draw pile.
					</p>
					<ul class="checklist">
						<li><b>5</b> Silver</li>
						<li><b>2</b> Gold</li>
						<li><b>2</b> Fireball</li>
						<li><b>2</b> Heal</li>
						<li><b>2</b> Magic Mine <span class="muted">(makes you more money)</span></li>
						<li>Your hero's own cards</li>
					</ul>
					<p>Every wizard starts the game in their castle, with 5 health.</p>
				</section>

				<section id="ww-words">
					<h2>Words to know</h2>
					<dl>
						<dt>Mana</dt>
						<dd>
							What you spend to cast spells. Every wizard gets 2 a turn.
							<span class="open">Open</span> Does unspent mana carry over?
						</dd>
						<dt>Magic Essence (ME)</dt>
						<dd>
							The building block of everything in the universe. You get it by extracting gold, and
							spend it to build and upgrade buildings.
						</dd>
						<dt>Chance</dt>
						<dd>
							How likely a spell is to work. Each spell has a chance from 1 to 20, or ∞. Roll the
							d20 when you cast it: roll <b>under</b> the spell's chance and it works. Any + or − chance
							you have is added to the number on the card.
						</dd>
						<dt>Fate</dt>
						<dd>
							Your standing with luck itself. Some spells and tiles raise or lower it, and healing
							yourself above your maximum health raises it by 1. If your fate plus your roll ever
							comes out below zero, you must spend mana to try to get back up.
							<span class="open">Open</span> What fate starts at and what it does.
						</dd>
						<dt>Notoriety</dt>
						<dd>
							How famous a wizard you are. You gain it by defeating other wizards.
							<span class="open">Open</span> Starting value.
						</dd>
						<dt>Tiers</dt>
						<dd>
							Spells, buildings and artifacts come in tiers (I, II, III). Higher tiers cost more and
							do more.
						</dd>
					</dl>
				</section>

				<section id="ww-passives">
					<h2>Passives</h2>
					<p>A passive is a bonus you get every turn without doing anything.</p>
					<div class="cards-2">
						<div class="card">
							<h3>Every wizard</h3>
							<ul>
								<li><b>+2</b> mana</li>
								<li><b>+5</b> draw (you draw 5 at the end of your turn)</li>
								<li><b>+2</b> move</li>
							</ul>
						</div>
						<div class="card">
							<h3>Your castle</h3>
							<p class="small">Upgrade your castle with ME, like any building.</p>
							<ul>
								<li>Tier I: <b>+1</b> silver, <b>+1</b> ME</li>
								<li>Tier II: also <b>+1</b> chance</li>
								<li>Tier III: also <b>+1</b> mana</li>
							</ul>
							<p class="small">
								If an opponent is standing in your castle at the start of your turn, they get these
								instead of you.
							</p>
						</div>
					</div>
					<p>
						Your hero, your artifacts, your buildings and the tile you stand on can all give you
						more.
					</p>
				</section>

				<section id="ww-turn">
					<h2>Your turn</h2>
					<h3>1. Start of turn</h3>
					<ul>
						<li>
							<b>Roll:</b> roll the d20 to see what your buildings give you. Skip it if you have no buildings
							or don't want anything from them. Draw effects happen as soon as you roll, not at the end
							of your turn.
						</li>
						<li>
							<b>Take your start-of-turn bonuses</b> from your castle and the tile you're standing on.
						</li>
					</ul>

					<h3>2. Do any of these, in any order, as often as you can</h3>
					<div class="action">
						<h4>Empty your wealth (buy)</h4>
						<ol>
							<li>
								<b>Choose what to buy.</b> Buy as many cards from the city as you can afford.
							</li>
							<li>
								<b>Merge your silver.</b> Every 3 silver in your wealth can merge into 1 gold to spend.
								If a card costs silver, pay that silver to the city first and merge the rest.
							</li>
							<li><b>Take the cards.</b> Bought cards go straight into your <b>hand</b>.</li>
							<li>
								<b>Pay taxes.</b> The city has no government, but it does have taxes. Every time you
								empty your wealth you pay <b>1 gold</b>, plus <b>1 gold for every 4 gold</b> the cards
								you bought cost.
							</li>
							<li>
								<b>Keep the rest.</b> Silver you didn't merge and gold you didn't spend go to your discard
								pile.
							</li>
						</ol>
						<p class="aside">
							I once saw a man who didn't pay his taxes to the only city, and he rolled a twenty for
							the rest of his time there. Pay your share.
						</p>
					</div>
					<div class="action">
						<h4>Add money to your wealth</h4>
						<p>Move any money cards in your hand into your wealth.</p>
					</div>
					<div class="action">
						<h4>Cast a spell</h4>
						<p>
							Play a spell from your hand if you can pay its mana, gold and ME. Roll the d20 for its
							chance. Gold spent on casting doesn't send the rest of your wealth to your discard.
						</p>
					</div>
					<div class="action">
						<h4>Move</h4>
						<p>
							Move your wizard to a neighbouring tile for 1 move. Moving into another player's
							castle costs 2.
						</p>
					</div>
					<div class="action">
						<h4>Build</h4>
						<p>
							Build a blueprint from your hand on the tile you're standing on, if you can pay its ME
							and it can go on that kind of tile. Only one copy of each building can be out at a
							time.
						</p>
					</div>
					<div class="action">
						<h4>Upgrade</h4>
						<p>Standing on a building you own, spend the ME it needs to move it up a tier.</p>
					</div>
					<div class="action">
						<h4>Extract essence</h4>
						<p>
							Return 1 gold from your wealth to the city and gain <b>3 ME</b>. This doesn't send the
							rest of your wealth to your discard.
						</p>
					</div>
					<div class="action">
						<h4>Equip an artifact</h4>
						<p>
							Artifacts stay in play instead of going through your deck. You can only replace an
							artifact with one of a higher tier.
							<span class="open">Open</span> How many artifacts a wizard can hold, and which tier they
							start at.
						</p>
					</div>

					<h3>3. End of turn</h3>
					<ul>
						<li>
							<b>Discard</b> every card in your hand. If you emptied your wealth, it goes to your discard
							too.
						</li>
						<li>
							<b>Draw</b> 5 cards, plus any extra draws from your castle, buildings, hero and artifacts.
							When your draw pile runs out, shuffle your discard to make a new one.
						</li>
					</ul>
				</section>

				<section id="ww-land">
					<h2>Land tiles</h2>
					<p>
						The board is a grid of hexagon tiles, each a different part of the city. Every tile has
						three effects: one for <b>starting</b> your turn on it, a <b>passive</b> that's always
						on, and one for <b>building</b> on it.
					</p>
					<div class="table-wrap">
						<table class="land">
							<thead>
								<tr>
									<th>Tile</th>
									<th>Start your turn here</th>
									<th>Passive</th>
									<th>Build here</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td><b>Mountain of minerals</b></td>
									<td>+1 silver</td>
									<td>Merging needs one less silver</td>
									<td>All resource cards get +2 chance</td>
								</tr>
								<tr>
									<td><b>Lake</b></td>
									<td>
										+1 move, and recycle 1 card of each type in the city (you get first pick of the
										new ones)
									</td>
									<td>Nothing</td>
									<td>+1 draw, but it costs 3 more to build</td>
								</tr>
								<tr>
									<td><b>Enchanted forest</b></td>
									<td>+1 mana</td>
									<td>+1 chance to nature spells within 1 hex. Clear it for 2 ME</td>
									<td>+1 mana, but it costs 2 more ME</td>
								</tr>
								<tr>
									<td><b>Rock bed</b></td>
									<td><span class="open">Open</span></td>
									<td>+1 chance to all resource spells</td>
									<td>Costs 1 less</td>
								</tr>
								<tr>
									<td><b>Field</b></td>
									<td>Draw 1</td>
									<td>Nothing</td>
									<td>Nothing</td>
								</tr>
								<tr>
									<td><b>Corrupted land</b></td>
									<td>Take 1 damage, and cast the top tier I spell for free</td>
									<td>+2 chance to dark spells, −1 chance to all others</td>
									<td>−1 fate</td>
								</tr>
								<tr>
									<td><b>Bricks</b></td>
									<td>Nothing</td>
									<td>Nothing</td>
									<td>Nothing</td>
								</tr>
							</tbody>
						</table>
					</div>
				</section>

				<section id="ww-health">
					<h2>Health & respawning</h2>
					<p>
						Every wizard starts with 5 health, which is also the most you can have. Heal above it
						and you gain 1 fate instead. When you drop to 0 health you respawn, as all magic does:
					</p>
					<ol>
						<li>Take your piece off the board.</li>
						<li>
							Wait until your turn, then:
							<ul>
								<li>return 2 money from your wealth to your discard</li>
								<li>discard 2 cards</li>
								<li>lose 1 ME</li>
							</ul>
						</li>
						<li>
							The player who killed you gains 1 notoriety, plus money equal to your notoriety in its
							densest form (gold first, then silver).
						</li>
					</ol>
					<p>
						If your own misused magic kills you on your turn, your turn ends, you lose 1 notoriety,
						and you don't respawn until your next turn.
						<span class="open">Open</span> Where you respawn: your castle?
					</p>
				</section>

				<section id="ww-keywords">
					<h2>Keywords</h2>
					<dl>
						<dt>Cast</dt>
						<dd>Every time you successfully cast a spell, trigger this effect.</dd>
						<dt>Miscast</dt>
						<dd>Every time you fail to cast a spell, trigger this effect.</dd>
						<dt>Half-cast</dt>
						<dd>
							Every time you cast a spell and roll in the lower half of the chance you needed
							(rounded down), trigger this effect. For ∞, or a chance above 20, treat it as 20.
						</dd>
						<dt>Occupied</dt>
						<dd>
							If you start your turn standing on one of your buildings with this keyword, trigger
							this effect.
						</dd>
						<dt>Alliteration</dt>
						<dd>
							Cards whose names alliterate (Molten Mine, Sharp Seeds) work together, and some cards
							reward you for playing them.
						</dd>
					</dl>
				</section>

				<section id="ww-heroes">
					<h2>Heroes</h2>
					<p>
						Every player is a hero with their own passives, spells and buildings.
						<span class="open">Open</span> The full hero list isn't written up yet. What's decided so
						far:
					</p>
					<div class="cards-2">
						<div class="card">
							<h3>Bobby Business</h3>
							<p>
								Gets 1 less mana each turn, but can discard a silver to make mana. Draws a card the
								first <b>two</b> times each turn he adds a silver to his wealth.
							</p>
						</div>
						<div class="card">
							<h3>Bex</h3>
							<p>
								Study session: reserve cards so nobody else can buy them. A card that's already
								reserved costs 1 less tax.
							</p>
						</div>
						<div class="card">
							<h3>The Noble</h3>
							<p>
								Somehow immortal. Never has to go back to his castle or suffer the penalties of
								death, though whoever kills him still gets the reward.
							</p>
						</div>
						<div class="card">
							<h3>Fran</h3>
							<p>When her hand or wealth is empty, a card is added to it.</p>
						</div>
					</div>
				</section>

				<section id="ww-end">
					<h2>Ending & scoring</h2>
					<p>
						The game ends when the city runs out of gold. Whoever has the most
						<b>victory points (VP)</b> rules the City of Gold. A game should take 60–90 minutes, and
						gets quicker as people learn it.
					</p>
					<ul>
						<li><b>1 VP</b> for each gold you own: in your wealth, your deck and your discard.</li>
					</ul>
					<p class="aside">
						<span class="open">Open</span> The older doc also gave points for buildings (2 per tile,
						1 per max-tier building) and 1 per different spell you know. The rule book only counts gold.
						Ties may be broken by fate.
					</p>
				</section>
			</article>
		{:else if tab === 'saga'}
			<article class="saga">
				<p class="intro">
					Wealthy Wizards is the middle of three games. Together they're a story about greed: who we
					hurt along the way, how we take until there's nothing left, and who is left at the end.
				</p>

				<section class="chapter">
					<p class="chapter-num">Before</p>
					<h2>Wealthless Wizards</h2>
					<p class="chapter-sub">
						The journey to the City of Gold. A discussion of who we hurt along the way.
					</p>
					<p>
						A video game: part Civilization, part dungeon run, part Oregon Trail. A party of wizards
						sails from the old world to a vast new one, funded by a king, to find the City of Gold.
						The goal is to make you feel like you're exploring a world that really exists, and,
						slowly, like the villain.
					</p>
					<p>
						It looks like a roguelike, but it's a roguelite that's really a story. Every run changes
						the world, and like John Company does with colonialism, the runs march it towards where
						we're headed: wars between countries, wasteland spreading, nobody left. When a run ends
						it shows you what it cost: how many people and animals you killed, and how much became
						ruin. Even a world of endless fortune couldn't change human greed.
					</p>
					<p>
						It also explains the board game. The City of Gold makes anyone who enters forget most of
						their past. That's why the wizards arrive with almost nothing, and why the rest of the
						world never learns about the city: nobody comes back.
					</p>

					<h3>How it plays</h3>
					<ul>
						<li>
							<b>Your wizards are the heroes</b>, not part of an army. You only see what's around
							them, and you can lose sight of your outposts.
						</li>
						<li>
							<b>Days pass.</b> Turns are split into parts of the day. Exploring happens in daylight
							and your bases can be attacked at night. Seasons and moon cycles may matter too.
						</li>
						<li>
							<b>Resources aren't global.</b> They're held by a party or an outpost and have to be carried,
							traded or teleported. The first place you land becomes your dock.
						</li>
						<li>
							<b>The king wants his cut.</b> Whoever funds the expedition makes demands, and each king
							wants something different: settlements, jewels, gold or knowledge.
						</li>
						<li>
							<b>Deck-building combat.</b> Wizards and units each have cards. Speed, strength, intelligence,
							swagger, fortitude, endurance and magic ability shape both combat and everything outside
							it. Fatigue cards fill your deck as you tire.
						</li>
						<li>
							<b>Morale, traits and relationships.</b> Units like or hate each other, pick up traits
							(foodie, heavy sleeper, scavenger), and react to what you do. Food, rest, heat and light
							all matter.
						</li>
						<li>
							<b>Consequences you can see</b>, not a morality bar: towns that remember you,
							characters who are crushed by what you've done, wonders you can industrialize until
							they're ruined. Fame, notoriety and goodness carry over between runs.
						</li>
						<li>
							<b>Locations of legend</b> hide in the fog as rumours: Camelot, Mount Meru, Muspelheim,
							Norumbega, Ryūgū-jō, the Fountain of Youth, the Library of Alexandria. Legendary guardians,
							like Cerberus, guard the city itself.
						</li>
					</ul>

					<h3>The wizards</h3>
					<div class="cards-2">
						<div class="card">
							<h4>Merlin</h4>
							<p>Magic ability, swagger, intelligence. Low fortitude.</p>
						</div>
						<div class="card">
							<h4>Knick the knight</h4>
							<p>Fortitude, strength, endurance. Low speed. Chivalry never dies.</p>
						</div>
						<div class="card">
							<h4>Bobby Business</h4>
							<p>
								Swagger, strength, fortitude. Low magic ability. Prints counterfeit money and
								launders it through his trading hub.
							</p>
						</div>
						<div class="card">
							<h4>Bex</h4>
							<p>Intelligence, magic ability. Low strength. Combo and spell damage.</p>
						</div>
						<div class="card">
							<h4>Frank the Founder</h4>
							<p>Endurance, speed, swagger. Nothing low. Reveals the resources on a tile.</p>
						</div>
						<div class="card">
							<h4>And more</h4>
							<p>
								Candice the contractor, Archie, Pylion, Thomas and his time stone, the General, and
								Wyla the witch.
							</p>
						</div>
					</div>

					<h3>Unlocking the world</h3>
					<p>The game adds its systems one at a time, each with a new wizard:</p>
					<ol class="unlocks">
						<li>The start: Merlin and Knick</li>
						<li>Building materials: Candice</li>
						<li>Food that rots, food types and water: Frank the Founder</li>
						<li>Temperature and weather: Pylion</li>
						<li>Time, moon cycles and seasons: the witch, or Thomas</li>
						<li>Memory: people recognize you, and fame takes hold</li>
						<li>Cartography: the map locks in, and the hunt for the City of Gold begins</li>
					</ol>
				</section>

				<section class="chapter current">
					<p class="chapter-num">This game</p>
					<h2>Wealthy Wizards</h2>
					<p class="chapter-sub">
						A discussion of how we take until there is no more, and what we value as a society.
					</p>
					<p>
						The wizards who made it are in the city, and it's a race to drain it of gold. The board
						game ends when the city is empty. See the <button
							type="button"
							class="link"
							on:click={() => pickTab('rules')}>Rules</button
						> tab.
					</p>
				</section>

				<section class="chapter">
					<p class="chapter-num">After</p>
					<h2>The third game</h2>
					<p class="chapter-sub">
						The culmination in a leftover land, and understanding who is left.
					</p>
					<p>
						Once the city has been taken for everything it had, what remains? The third game is set
						in the land that's left behind.
						<span class="open">Open</span> Name and details to come.
					</p>
				</section>
			</article>
		{:else}
			<article class="notes">
				<p class="intro">
					Every design note, as written. <span class="done-key">✓</span> marks a card idea that's
					been made, <span class="todo-key">◦</span> one that hasn't yet.
				</p>
				<label class="search">
					<span class="sr-only">Search the notes</span>
					<input type="search" placeholder="Search the notes" bind:value={search} />
					{#if needle}<span class="count">{matchCount} found</span>{/if}
				</label>
				{#each shownNotes as block, i (i)}
					{#if block.kind === 'heading'}
						<h3>{block.text}</h3>
					{:else if block.kind === 'list'}
						<ul class="idea-list">
							{#each block.items as item, j (j)}
								<li class:done={item.done}>
									<span class="mark" aria-label={item.done ? 'made' : 'not made yet'}
										>{item.done ? '✓' : '◦'}</span
									>
									{item.text}
								</li>
							{/each}
						</ul>
					{:else}
						<p>{block.text}</p>
					{/if}
				{:else}
					<p class="muted">Nothing in the notes matches "{search}".</p>
				{/each}
			</article>
		{/if}
	</main>
</div>

<style>
	:global(body) {
		background: #f4efe4;
	}

	.container {
		max-width: 920px;
		margin: 0 auto;
		padding: 2rem;
	}

	main {
		background: #fffdf8;
		border: 1px solid #e8dcc3;
		border-radius: 12px;
		padding: 2.5rem;
		box-shadow: 0 4px 6px -1px rgba(60, 40, 0, 0.08);
		color: #2b2418;
		line-height: 1.6;
	}

	.hero {
		margin-bottom: 1.5rem;
		padding-bottom: 1.25rem;
		border-bottom: 2px solid #e8c766;
	}

	.eyebrow {
		margin: 0;
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #9a7414;
	}

	h1 {
		margin: 0.15rem 0 0.35rem;
		font-family: Georgia, 'Times New Roman', serif;
		font-size: 2.4rem;
		color: #3b2a07;
	}

	.tagline {
		margin: 0;
		color: #6b5a3a;
	}

	h2 {
		margin: 0 0 0.75rem;
		font-family: Georgia, 'Times New Roman', serif;
		font-size: 1.5rem;
		color: #3b2a07;
	}

	h3 {
		margin: 1.5rem 0 0.5rem;
		font-size: 1.05rem;
		color: #4a3810;
	}

	h4 {
		margin: 0 0 0.3rem;
		font-size: 1rem;
		color: #4a3810;
	}

	p {
		margin: 0 0 0.75rem;
	}

	ul,
	ol {
		margin: 0 0 0.75rem;
		padding-left: 1.3rem;
	}

	li {
		margin-bottom: 0.3rem;
	}

	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 1.75rem;
	}

	.tab {
		padding: 0.4rem 1rem;
		background: #fff;
		border: 1px solid #e0d2b4;
		border-radius: 20px;
		font: inherit;
		font-size: 0.92rem;
		color: #5c4a26;
		cursor: pointer;
	}

	.tab:hover {
		border-color: #b8901f;
		color: #8a6510;
	}

	.tab.active {
		background: #b8901f;
		border-color: #b8901f;
		color: #fff;
	}

	section {
		margin-bottom: 2.25rem;
		scroll-margin-top: 1rem;
	}

	.toc {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.5rem;
		margin-bottom: 2rem;
		padding: 0.85rem 1rem;
		background: #faf4e6;
		border-radius: 10px;
	}

	.toc a {
		font-size: 0.88rem;
		color: #8a6510;
		text-decoration: none;
	}

	.toc a:not(:last-child)::after {
		content: '·';
		margin-left: 0.5rem;
		color: #c9b58a;
	}

	.toc a:hover {
		text-decoration: underline;
	}

	.lore {
		font-family: Georgia, 'Times New Roman', serif;
		font-style: italic;
		color: #4a3d25;
	}

	.cards-2 {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 0.85rem;
		margin-bottom: 0.75rem;
	}

	.card {
		padding: 1rem 1.1rem;
		background: #fff;
		border: 1px solid #ece2cc;
		border-radius: 10px;
	}

	.card h3 {
		margin-top: 0;
	}

	.card p:last-child,
	.card ul:last-child {
		margin-bottom: 0;
	}

	.card.gold {
		border-top: 4px solid #d4a72c;
	}

	.card.silver {
		border-top: 4px solid #a9b1b8;
	}

	.small {
		font-size: 0.88rem;
		color: #6b5a3a;
	}

	.aside {
		font-size: 0.9rem;
		color: #6b5a3a;
	}

	.muted {
		color: #8a7b5c;
	}

	.open {
		display: inline-block;
		padding: 0 0.45rem;
		background: #fdecc8;
		border: 1px solid #ecc76b;
		border-radius: 4px;
		font-size: 0.72rem;
		font-weight: 700;
		font-style: normal;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: #7a5500;
		vertical-align: 0.1em;
	}

	.table-wrap {
		overflow-x: auto;
		margin-bottom: 0.75rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.92rem;
	}

	th,
	td {
		padding: 0.55rem 0.7rem;
		border-bottom: 1px solid #ece2cc;
		text-align: left;
		vertical-align: top;
	}

	th {
		background: #faf4e6;
		font-weight: 600;
		color: #4a3810;
	}

	table.land td:first-child {
		white-space: nowrap;
	}

	.checklist {
		columns: 2;
		list-style: none;
		padding-left: 0;
	}

	dl {
		margin: 0;
	}

	dt {
		margin-top: 0.85rem;
		font-weight: 700;
		color: #4a3810;
	}

	dd {
		margin: 0.15rem 0 0;
	}

	.action {
		margin-bottom: 0.65rem;
		padding: 0.8rem 1rem;
		background: #fff;
		border-left: 3px solid #d4a72c;
		border-radius: 0 8px 8px 0;
	}

	.action p:last-child,
	.action ol:last-child {
		margin-bottom: 0;
	}

	.intro {
		font-size: 1.05rem;
		color: #4a3d25;
	}

	.chapter {
		padding: 1.5rem 1.5rem 0.75rem;
		background: #fff;
		border: 1px solid #ece2cc;
		border-radius: 12px;
	}

	.chapter.current {
		background: #fdf6e3;
		border-color: #e8c766;
	}

	.chapter-num {
		margin: 0;
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #9a7414;
	}

	.chapter h2 {
		margin-bottom: 0.2rem;
	}

	.chapter-sub {
		font-family: Georgia, 'Times New Roman', serif;
		font-style: italic;
		color: #6b5a3a;
	}

	.unlocks li::marker {
		font-weight: 700;
		color: #9a7414;
	}

	button.link {
		padding: 0;
		background: none;
		border: none;
		font: inherit;
		color: #8a6510;
		text-decoration: underline;
		cursor: pointer;
	}

	.search {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}

	.search input {
		flex: 1;
		min-width: 0;
		padding: 0.55rem 0.8rem;
		border: 1px solid #e0d2b4;
		border-radius: 8px;
		font: inherit;
		background: #fff;
	}

	.count {
		font-size: 0.88rem;
		color: #6b5a3a;
		white-space: nowrap;
	}

	.notes h3 {
		margin-top: 1.75rem;
		padding-bottom: 0.25rem;
		border-bottom: 1px solid #ece2cc;
	}

	.notes p {
		font-size: 0.95rem;
	}

	.idea-list {
		list-style: none;
		padding-left: 0;
		font-size: 0.95rem;
	}

	.idea-list li {
		display: flex;
		gap: 0.5rem;
	}

	.mark {
		flex: none;
		width: 1rem;
		color: #b3a17a;
	}

	.idea-list li.done .mark,
	.done-key {
		color: #3d7a2e;
		font-weight: 700;
	}

	.todo-key {
		color: #b3a17a;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	@media (max-width: 768px) {
		main {
			padding: 1.25rem 1rem 1.5rem;
		}

		h1 {
			font-size: 2rem;
		}

		.chapter {
			padding: 1.1rem 1rem 0.5rem;
		}

		.checklist {
			columns: 1;
		}

		table.land td:first-child {
			white-space: normal;
		}
	}
</style>
