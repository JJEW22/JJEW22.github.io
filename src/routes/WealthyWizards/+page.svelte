<!-- src/routes/WealthyWizards/+page.svelte -->
<!--
	Wealthy Wizards: the rules to the board game, the trilogy it sits in, and its
	design notes. Hidden: nothing links here except /WealthlessWizards, and it
	asks not to be indexed.

	The rules are the 2023 rule book, updated with the decisions in the notes
	review: fate replaces the per-spell roll, a Splendor-style tiered market,
	5 silver to a gold. Anything still undecided is marked with an "Open" tag so
	it reads as unfinished rather than as a rule.

	The Notes tab is the board-game half of $lib/wizards/notes.txt, as written.
	The styles live in $lib/wizards/wizards.css, shared with /WealthlessWizards.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import '../../app.css';
	import '$lib/wizards/wizards.css';
	import NotesView from '$lib/wizards/NotesView.svelte';
	import { wealthyNotes } from '$lib/wizards/notes';

	// rules | saga | notes. Kept in the URL hash so a reload stays on the same tab.
	const TABS = [
		{ id: 'rules', label: 'Rules' },
		{ id: 'saga', label: 'The trilogy' },
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
</script>

<svelte:head>
	<title>Wealthy Wizards</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="wizards">
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
						<a href="#ww-fate">Fate</a>
						<a href="#ww-setup">Setting up the city</a>
						<a href="#ww-start">Your starting deck</a>
						<a href="#ww-words">Words to know</a>
						<a href="#ww-passives">Passives</a>
						<a href="#ww-turn">Your turn</a>
						<a href="#ww-land">Land tiles</a>
						<a href="#ww-health">Health & dying</a>
						<a href="#ww-keywords">Keywords</a>
						<a href="#ww-heroes">Heroes</a>
						<a href="#ww-end">Ending & scoring</a>
					</nav>

					<section id="ww-story">
						<h2>The story</h2>
						<p class="lore">
							After hours upon days upon weeks upon years of treacherous land and walking in
							circles, the mighty fine young wizard that is yourself has finally found the City of
							Gold. With the magical energy harnessed in gold and your determination, there is no
							doubt you will become one of the great wizards of history, the kind they tell stories
							of for years to come.
						</p>
						<p class="lore">
							Scanning the landscape of the city before you, you slowly realize you are not the only
							wizard to have just stumbled across this world of infinite potential. You quickly get
							out your pop-a-castle and prepare to stake your claim to your destiny…
						</p>
						<p class="lore">
							As fortunate as you are, you look down at your feet and find <em>Wizarding 101</em>:
							an introduction into how to be a wizard and settle the City of Gold, by JJEW the
							Judge.
						</p>
					</section>

					<section id="ww-money">
						<h2>Money</h2>
						<p>The first thing any wizard needs to know about is money.</p>
						<div class="cards-2">
							<div class="card silver">
								<h3>Silver</h3>
								<p>
									The money of men. It won't do you as much good with wizards or in the City of
									Gold, but having some is never a bad idea, because you can exchange it for gold:
									in the city, <b>5 silver merges into 1 gold</b>.
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
									You can also <b>extract</b> gold: squeeze either <b>2 mana</b> or <b>1 ME</b> out of
									it, and put it in your discard pile. It comes round again.
								</p>
							</div>
						</div>
						<h3>Your wealth</h3>
						<p>
							Silver and gold are cards in your deck. Whenever you draw one, it goes into your
							<b>wealth</b> instead of staying in your hand. Your wealth is the money you have
							available to spend. Whenever you add a <b>gold</b> to your wealth, draw a card.
						</p>
					</section>

					<section id="ww-fate">
						<h2>Fate</h2>
						<p>
							Every wizard has a <b>fate</b>: a number that says how much luck is on their side. It
							starts at <b>0</b> (some heroes start elsewhere) and only changes permanently.
						</p>
						<ul>
							<li>
								<b>Roll for your turn.</b> At the start of your turn, roll the d20 and add your fate.
								That total is the fate you have to spend this turn.
							</li>
							<li>
								<b>Spend it on spells.</b> A spell's <b>chance</b> is how much fate it costs to get its
								effect. Some spells have tiers: spend more for a bigger effect.
							</li>
							<li>
								<b>Tempting fate.</b> You may spend up to 3 more fate than you have, but it lowers your
								fate by 1 for the rest of the game.
							</li>
							<li>
								<b>Saving it.</b> End your turn with 5 or more fate left over and your fate goes up by
								1 for good.
							</li>
							<li>
								<b>Bad luck.</b> If your roll plus your fate comes out below 0, you skip your turn.
							</li>
							<li>
								Dying lowers your fate by 1. Healing yourself above your maximum health raises it by
								1. Some cards and tiles raise or lower it too.
							</li>
						</ul>
					</section>

					<section id="ww-setup">
						<h2>Setting up the city</h2>
						<p>
							The City of Gold expands with the number of wizards in it. The city's gold is a pile
							of gold cards. When it runs out, the game ends.
						</p>
						<div class="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Players</th>
										<th>City's starting gold</th>
										<th>Board</th>
									</tr>
								</thead>
								<tbody>
									<tr>
										<td>3</td>
										<td>35</td>
										<td>Shape A</td>
									</tr>
									<tr>
										<td>4</td>
										<td>45</td>
										<td>Shape A</td>
									</tr>
									<tr>
										<td>5</td>
										<td>55</td>
										<td>Shape B</td>
									</tr>
									<tr>
										<td>6</td>
										<td>65</td>
										<td>Shape B</td>
									</tr>
								</tbody>
							</table>
						</div>

						<h3>The board</h3>
						<p>
							The board is built from Catan tiles, using the standard number of each.
							<b>Shape A</b> is the standard Catan board, and <b>Shape B</b> is the 5–6 player expansion
							board. The Mountain of minerals goes in the middle, and the sheep tiles are turned over
							to become lakes.
						</p>
						<div class="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Tile</th>
										<th>Made from</th>
										<th>Shape A</th>
										<th>Shape B</th>
									</tr>
								</thead>
								<tbody>
									<tr>
										<td><b>Mountain of minerals</b></td>
										<td>Mountain, stacked on a sheep tile</td>
										<td>1</td>
										<td>1</td>
									</tr>
									<tr>
										<td><b>Rock bed</b></td>
										<td>Mountain</td>
										<td>2</td>
										<td>4</td>
									</tr>
									<tr>
										<td><b>Lake</b></td>
										<td>Sheep, turned over</td>
										<td>3</td>
										<td>5</td>
									</tr>
									<tr>
										<td><b>Enchanted forest</b></td>
										<td>Forest</td>
										<td>4</td>
										<td>6</td>
									</tr>
									<tr>
										<td><b>Field</b></td>
										<td>Wheat</td>
										<td>4</td>
										<td>6</td>
									</tr>
									<tr>
										<td><b>Bricks</b></td>
										<td>Bricks</td>
										<td>3</td>
										<td>5</td>
									</tr>
									<tr>
										<td><b>Corrupted land</b></td>
										<td>Desert</td>
										<td>1</td>
										<td>2</td>
									</tr>
									<tr class="total">
										<td><b>Tiles on the board</b></td>
										<td>(Catan tiles used)</td>
										<td>18 <span class="muted">(19)</span></td>
										<td>29 <span class="muted">(30)</span></td>
									</tr>
								</tbody>
							</table>
						</div>

						<h3>The market</h3>
						<p>
							Everything the city sells (spells, building blueprints and artifacts) comes in three
							<b>tiers</b>. Shuffle each tier into its own deck and lay cards from it face up. Those
							face-up cards are what can be bought. Whenever one is bought, flip a new card from
							that tier's deck to replace it.
						</p>
						<p class="aside">
							<span class="open">Open</span> How many cards are face up in each tier, and whether that
							changes with the number of players. For a first game there will also be a suggested set
							of cards (the alliteration spells).
						</p>

						<h3>Choosing heroes</h3>
						<p>
							For your first few games, everyone picks the hero whose name sounds the most
							interesting.
							<span class="open">Open</span> A short list of heroes to avoid in a first game still needs
							writing.
						</p>
						<p>
							Once you've played as or with every hero, there is a draft. Everyone rolls the die;
							whoever rolls <b>lowest</b> picks first, and the draft goes <b>counter-clockwise</b>
							from them. The player who picked last takes the first turn, and play then goes
							<b>clockwise</b>.
						</p>
						<p class="aside">
							Mixing new apprentices with old wizards (by games played, not age)? Let the
							apprentices pick by name, and draft the rest afterwards if you like.
						</p>
					</section>

					<section id="ww-start">
						<h2>Your starting deck</h2>
						<p>
							Even as a starting wizard you have a few tricks up your sleeve. You brought 5 silver
							in with you, and finding the City of Gold granted you 2 gold. Shuffle these together
							with the starting spells to make your draw pile.
						</p>
						<ul class="checklist">
							<li><b>5</b> Silver</li>
							<li><b>2</b> Gold</li>
							<li><b>2</b> Fireball</li>
							<li><b>1</b> Heal</li>
							<li><b>2</b> Magic Mine <span class="muted">(makes you more money)</span></li>
							<li>Your hero's own cards</li>
						</ul>
						<p>
							Every wizard starts the game in their castle with 5 health and 0 fate, then draws 4
							cards.
						</p>
					</section>

					<section id="ww-words">
						<h2>Words to know</h2>
						<dl>
							<dt>Mana</dt>
							<dd>
								What you spend to cast spells. Every wizard gets 2 a turn, and extracting a gold
								gives 2 more. Use it or lose it: unspent mana doesn't carry over to your next turn.
							</dd>
							<dt>Magic Essence (ME)</dt>
							<dd>
								The building block of everything in the universe. You get it by extracting gold, and
								spend it to build and upgrade buildings.
							</dd>
							<dt>Fate</dt>
							<dd>
								Your luck. Your fate plus your start-of-turn roll is what you spend to cast spells.
								See <a href="#ww-fate">Fate</a>.
							</dd>
							<dt>Chance</dt>
							<dd>
								How much fate a spell costs. A "+1 chance" bonus makes spells cost 1 less fate, and
								"−1 chance" makes them cost 1 more.
							</dd>
							<dt>Tiers</dt>
							<dd>
								Spells, buildings and artifacts come in tiers I, II and III. Higher tiers cost more,
								pay more tax and do more.
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
									<li><b>+4</b> draw (at the end of your turn)</li>
									<li><b>+2</b> move</li>
								</ul>
							</div>
							<div class="card">
								<h3>Your castle</h3>
								<p class="small">Each tier costs 2 ME to upgrade to, and adds to the one before.</p>
								<ul>
									<li>Tier I: <b>+1</b> silver, <b>+1</b> ME</li>
									<li>Tier II: also <b>+1</b> chance</li>
									<li>Tier III: also <b>+1</b> mana</li>
								</ul>
								<p class="small">
									If an opponent is standing in your castle at the start of your turn, they get
									these instead of you.
								</p>
							</div>
						</div>
						<p>
							Your hero, your artifact, your buildings and the tile you stand on can all give you
							more.
						</p>
					</section>

					<section id="ww-turn">
						<h2>Your turn</h2>
						<h3>1. Start of turn</h3>
						<ul>
							<li>
								<b>Roll:</b> roll the d20 and add your fate. That's your fate to spend this turn (if
								it's below 0, your turn is skipped). The same roll decides what your buildings give you.
								Draw effects from buildings happen as soon as you roll.
							</li>
							<li>
								<b>Take your start-of-turn bonuses</b> from your castle and the tile you're standing
								on.
							</li>
						</ul>

						<h3>2. Do any of these, in any order, as often as you can</h3>
						<div class="action">
							<h4>Empty your wealth (buy)</h4>
							<ol>
								<li>
									<b>Choose what to buy</b> from the face-up cards in the market. Buy as many as you
									can afford.
								</li>
								<li>
									<b>Merge your silver.</b> Every 5 silver in your wealth can merge into 1 gold to spend.
									If a card costs silver, pay that silver to the city first and merge the rest.
								</li>
								<li>
									<b>Take the cards.</b> Bought cards go straight into your <b>hand</b>, unless they
									say otherwise. Flip new cards into the market to replace them.
								</li>
								<li>
									<b>Pay taxes.</b> The city has no government, but it does have taxes. The gold you
									spend comes back to you, except for <b>1 gold per tier</b> of each card you bought
									(1 for tier I, 2 for tier II, 3 for tier III), which goes back to the city.
								</li>
								<li>
									<b>Keep the rest.</b> Everything else in your wealth goes to your discard pile: the
									gold you spent but didn't pay in tax, gold you didn't spend, and silver you didn't
									merge.
								</li>
							</ol>
							<p class="aside">
								I once saw a man who didn't pay his taxes to the only city, and he rolled a twenty
								for the rest of his time there. Pay your share.
							</p>
						</div>
						<div class="action">
							<h4>Add money to your wealth</h4>
							<p>Move any money cards in your hand into your wealth.</p>
						</div>
						<div class="action">
							<h4>Cast a spell</h4>
							<p>
								Play a spell from your hand by paying its mana, any gold or ME it asks for, and its
								chance in fate. There's no roll: if you can pay, it works.
							</p>
						</div>
						<div class="action">
							<h4>Move</h4>
							<p>
								Move your wizard to a neighboring tile for 1 move. Moving into another player's
								castle costs 2.
							</p>
						</div>
						<div class="action">
							<h4>Build</h4>
							<p>
								Build a blueprint from your hand on the tile you're standing on, if you can pay its
								ME and it can go on that kind of tile.
							</p>
						</div>
						<div class="action">
							<h4>Upgrade</h4>
							<p>
								Standing on a building you own (your castle included), spend the ME it needs to move
								it up a tier.
							</p>
						</div>
						<div class="action">
							<h4>Extract gold</h4>
							<p>
								Move 1 gold from your wealth to your discard pile and gain <b>2 mana</b> or
								<b>1 ME</b>. This doesn't send the rest of your wealth to your discard.
							</p>
						</div>
						<div class="action">
							<h4>Equip an artifact</h4>
							<p>
								Artifacts stay in play instead of going through your deck. You can only have
								<b>one</b> at a time, and can only replace it with one of a higher tier.
							</p>
						</div>

						<h3>3. End of turn</h3>
						<ul>
							<li>
								<b>Keep your hand.</b> You don't discard the cards you didn't play. Cards you did play,
								and your wealth if you emptied it, are already in your discard.
							</li>
							<li>
								<b>Draw 4</b> cards, plus any extra draws from your buildings, hero and artifact. When
								your draw pile runs out, shuffle your discard to make a new one.
							</li>
							<li>
								<b>Check your fate:</b> 5 or more left over raises your fate by 1.
							</li>
						</ul>
					</section>

					<section id="ww-land">
						<h2>Land tiles</h2>
						<p>
							The board is a grid of hexagon tiles, each a different part of the city. Every tile
							has three effects: one for <b>starting</b> your turn on it, a <b>passive</b> that's
							always on, and one for <b>building</b> on it. The board is built from Catan tiles; the
							second column says which is which.
						</p>
						<div class="table-wrap">
							<table class="land">
								<thead>
									<tr>
										<th>Tile</th>
										<th>Catan tile</th>
										<th>Start your turn here</th>
										<th>Passive</th>
										<th>Build here</th>
									</tr>
								</thead>
								<tbody>
									<tr>
										<td><b>Mountain of minerals</b></td>
										<td>Mountain, stacked on a sheep tile</td>
										<td>+1 silver</td>
										<td>Merging needs one less silver (4 for a gold)</td>
										<td>All resource cards get +2 chance</td>
									</tr>
									<tr>
										<td><b>Lake</b></td>
										<td>Any tile, blue back up</td>
										<td>
											+1 move, and recycle 1 face-up card of each tier in the market (you get first
											pick of the new ones)
										</td>
										<td>Nothing</td>
										<td>+1 draw, but it costs 3 more to build</td>
									</tr>
									<tr>
										<td><b>Enchanted forest</b></td>
										<td>Forest (trees)</td>
										<td>+1 mana</td>
										<td>+1 chance to nature spells within 1 hex. Clear it for 2 ME</td>
										<td>+1 mana, but it costs 2 more ME</td>
									</tr>
									<tr>
										<td><b>Rock bed</b></td>
										<td>Mountain</td>
										<td>Nothing</td>
										<td>+1 chance to all resource spells</td>
										<td>Costs 1 less</td>
									</tr>
									<tr>
										<td><b>Field</b></td>
										<td>Wheat</td>
										<td>Draw 1</td>
										<td>Nothing</td>
										<td>Nothing</td>
									</tr>
									<tr>
										<td><b>Corrupted land</b></td>
										<td>Desert</td>
										<td>Take 1 damage, and cast the top tier I spell for free</td>
										<td>+2 chance to dark spells, −1 chance to all others</td>
										<td>−1 fate</td>
									</tr>
									<tr>
										<td><b>Bricks</b></td>
										<td>Bricks</td>
										<td>Nothing</td>
										<td>Nothing</td>
										<td>Nothing</td>
									</tr>
								</tbody>
							</table>
						</div>
					</section>

					<section id="ww-health">
						<h2>Health & dying</h2>
						<p>
							Every wizard has 5 health, and that maximum never changes. Heal above it and you gain
							1 fate instead. When you drop to 0 health you respawn, as all magic does:
						</p>
						<ol>
							<li>Take your piece off the board.</li>
							<li>Lose 1 fate for the rest of the game.</li>
							<li>Discard 1 card from your hand and 1 card from your wealth.</li>
							<li>
								The player who killed you adds money to their wealth equal to your fate, ignoring
								the minus sign (a wizard at −3 fate is worth 3).
								<span class="open">Open</span> Paid in silver, gold, or from the city?
							</li>
							<li>At the start of your next turn, you come back to life in your castle.</li>
						</ol>
						<p>If your own magic kills you on your turn, your turn ends.</p>
					</section>

					<section id="ww-keywords">
						<h2>Keywords</h2>
						<dl>
							<dt>Cast</dt>
							<dd>Every time you cast a spell, trigger this effect.</dd>
							<dt>Occupied</dt>
							<dd>
								If you start your turn standing on one of your buildings with this keyword, trigger
								this effect.
							</dd>
							<dt>Alliteration</dt>
							<dd>
								Cards whose names alliterate (Molten Mine, Sharp Seeds) work together, and some
								cards reward you for playing them.
							</dd>
						</dl>
						<p class="aside">
							<span class="open">Open</span> The rule book also had <b>Miscast</b> (when a spell
							fails) and <b>Half-cast</b> (when you roll low). Spells no longer roll, so they need a
							new meaning or to go.
						</p>
					</section>

					<section id="ww-heroes">
						<h2>Heroes</h2>
						<p>
							Every player is a hero with their own passives, spells and buildings.
							<span class="open">Open</span> The full hero list isn't written up yet. What's decided
							so far:
						</p>
						<div class="cards-2">
							<div class="card">
								<h3>Bobby Business</h3>
								<p>
									Starts the game at <b>−1 fate</b>. Has a card that draws 3 cards; discard any of
									them that aren't silver.
								</p>
							</div>
							<div class="card">
								<h3>Bex</h3>
								<ul>
									<li>The first spell she gets in each tier costs less.</li>
									<li>
										Study session: reserve cards so nobody else can buy them. A card that's already
										reserved costs 1 less tax.
									</li>
								</ul>
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
							<li>
								<b>1 VP</b> for each gold you own: in your wealth, your hand, your deck and your discard
							</li>
							<li><b>1 VP</b> for each building you have on the board</li>
							<li><b>1 VP</b> for each point of fate (fate below 0 costs you points)</li>
							<li><b>1 VP</b> for each different spell you own</li>
						</ul>
					</section>
				</article>
			{:else if tab === 'saga'}
				<article class="saga">
					<p class="intro">
						Wealthy Wizards is the middle of three games. Together they're a story about greed: who
						we hurt along the way, how we take until there's nothing left, and who is left at the
						end.
					</p>

					<section class="chapter">
						<p class="chapter-num">Before</p>
						<h2>Wealthless Wizards</h2>
						<p class="chapter-sub">
							The journey to the City of Gold. A discussion of who we hurt along the way.
						</p>
						<p>
							A video game: part Civilization, part dungeon run, part Oregon Trail. A party of
							wizards sails from the old world to a vast new one, funded by a king, to find the City
							of Gold. It's meant to feel like exploring a world that really exists, and, slowly,
							like being the villain.
						</p>
						<p>
							It also explains this game. The City of Gold makes anyone who enters forget most of
							their past. That's why the wizards arrive with almost nothing, and why the rest of the
							world never learns about the city: nobody comes back.
						</p>
						<p>
							<a href={resolve('/WealthlessWizards')}>Read the Wealthless Wizards draft →</a>
						</p>
					</section>

					<section class="chapter current">
						<p class="chapter-num">This game</p>
						<h2>Wealthy Wizards</h2>
						<p class="chapter-sub">
							A discussion of how we take until there is no more, and what we value as a society.
						</p>
						<p>
							The wizards who made it are in the city, and it's a race to drain it of gold. The
							board game ends when the city is empty. See the <button
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
							Once the city has been taken for everything it had, what remains? The third game is
							set in the land that's left behind.
							<span class="open">Open</span> Name and details to come.
						</p>
					</section>
				</article>
			{:else}
				<NotesView blocks={wealthyNotes}>
					<p class="intro">
						The board game's design notes, as written. <span class="done-key">✓</span> marks a card
						idea that's been made, <span class="todo-key">◦</span> one that hasn't yet. The
						Wealthless Wizards notes are on
						<a href={resolve('/WealthlessWizards')}>its own page</a>.
					</p>
				</NotesView>
			{/if}
		</main>
	</div>
</div>
