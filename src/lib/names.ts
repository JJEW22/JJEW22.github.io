// src/lib/names.ts
// A person's name on their account (users.real_name): site-wide, separate from
// the username (the login and screen name). Client-safe so forms and endpoints
// validate it the same way.

export type CheckedName = { ok: true; value: string } | { ok: false; error: string };

export const NAME_MAX = 60;

export function checkName(name: unknown): CheckedName {
	const trimmed = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
	if (!trimmed) return { ok: false, error: 'A name is needed.' };
	if (trimmed.length > NAME_MAX) {
		return { ok: false, error: `That name is too long (${NAME_MAX} characters).` };
	}
	return { ok: true, value: trimmed };
}
