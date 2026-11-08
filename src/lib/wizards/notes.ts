// src/lib/wizards/notes.ts
// The Wizards design notes (notes.txt, the brainstorm file as written), read
// into blocks of headings, paragraphs and card lists for the Notes tabs on
// /WealthyWizards and /WealthlessWizards.
//
// One file holds both games' notes. Everything from the "Dunegeon run:"
// heading on is about Wealthless Wizards; everything before it is the board
// game (and the trilogy ideas at the top).

import notesText from './notes.txt?raw';

export type NoteBlock =
	| { kind: 'heading'; text: string }
	| { kind: 'para'; text: string }
	| { kind: 'list'; items: { done: boolean; text: string }[] };

// ✓ marks an idea that made it onto a card, ◦ one that hasn't yet.
const MARK = /^([✓◦])\s*/;
const WEALTHLESS_START = 'Dunegeon run:';

function isHeading(line: string): boolean {
	return (line.endsWith(':') && line.length < 40) || /^Wealthy wizards \d/i.test(line);
}

export function parseNotes(text: string): NoteBlock[] {
	const blocks: NoteBlock[] = [];
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

const split = notesText.indexOf(WEALTHLESS_START);

export const wealthyNotes = parseNotes(split < 0 ? notesText : notesText.slice(0, split));
export const wealthlessNotes = parseNotes(split < 0 ? '' : notesText.slice(split));

// The blocks that mention `search`, with lists cut down to their matching
// items. Headings are dropped while searching: on their own they read as
// matches.
export function searchNotes(blocks: NoteBlock[], search: string): NoteBlock[] {
	const needle = search.trim().toLowerCase();
	if (!needle) return blocks;
	const out: NoteBlock[] = [];
	for (const b of blocks) {
		if (b.kind === 'list') {
			const items = b.items.filter((i) => i.text.toLowerCase().includes(needle));
			if (items.length) out.push({ kind: 'list', items });
		} else if (b.kind === 'para' && b.text.toLowerCase().includes(needle)) {
			out.push(b);
		}
	}
	return out;
}

export function countNotes(blocks: NoteBlock[]): number {
	return blocks.reduce((n, b) => n + (b.kind === 'list' ? b.items.length : 1), 0);
}
