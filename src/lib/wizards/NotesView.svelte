<!-- src/lib/wizards/NotesView.svelte -->
<!-- A searchable list of design notes, for the Notes tab on both Wizards pages. -->
<script lang="ts">
	import { countNotes, searchNotes, type NoteBlock } from './notes';

	export let blocks: NoteBlock[];

	let search = '';

	$: shown = searchNotes(blocks, search);
	$: searching = search.trim() !== '';
</script>

<article class="notes">
	<slot />
	<label class="search">
		<span class="sr-only">Search the notes</span>
		<input type="search" placeholder="Search the notes" bind:value={search} />
		{#if searching}<span class="count">{countNotes(shown)} found</span>{/if}
	</label>
	{#each shown as block, i (i)}
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
