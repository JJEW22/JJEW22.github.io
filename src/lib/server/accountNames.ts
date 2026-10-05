// src/lib/server/accountNames.ts
// Reading and writing a person's name (users.real_name), site-wide.
//
// Set by the person on /account (or the snow page), and overridable by a
// site:admin on /admin. Features that show it keep their own copies in step
// here, in the same transaction as the change, so a name never disagrees with
// itself across the site. Today that's Snow Predictions' display_name on every
// entry linked to the account.

import { sql } from '$lib/server/db';

export class AccountNameError extends Error {
	constructor(
		message: string,
		public status = 400
	) {
		super(message);
	}
}

export async function getAccountName(userId: number): Promise<string | null> {
	const [row] = await sql<{ real_name: string | null }[]>`
		select real_name from users where id = ${userId}
	`;
	return row?.real_name ?? null;
}

// Set an account's name, or clear it with null. Clearing leaves existing snow
// entries showing what they last showed.
export async function setAccountName(userId: number, name: string | null): Promise<void> {
	try {
		await sql.begin(async (tx) => {
			const [hit] =
				await tx`update users set real_name = ${name} where id = ${userId} returning id`;
			if (!hit) throw new AccountNameError(`No account with id ${userId}.`, 404);
			if (name !== null) {
				await tx`
					update snow_predictions set display_name = ${name}, updated_at = now()
					where user_id = ${userId} and display_name <> ${name}
				`;
			}
		});
	} catch (err) {
		// The only unique index reachable is Snow's one-name-per-season.
		if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
			throw new AccountNameError(
				`"${name}" is already the name on someone else's snow prediction in a season this account is in. ` +
					'Pick a different name, or rename the other entry first.',
				409
			);
		}
		throw err;
	}
}
