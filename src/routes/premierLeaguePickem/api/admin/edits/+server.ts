// src/routes/premierLeaguePickem/api/admin/edits/+server.ts
// The override log, for the Admin tab. Admin-only: it names who changed whose
// entry, which is exactly the sort of thing that shouldn't be guessable from
// outside the admin group.
import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { requireAdmin } from '$lib/server/roles';
import type { RequestHandler } from './$types';

interface Row {
    id: string;
    kind: string;
    fixture_id: string | null;
    matchweek: number | null;
    before: any;
    after: any;
    note: string | null;
    created_at: Date;
    admin_name: string;
    target_name: string;
}

export const GET: RequestHandler = async ({ url, request, locals }) => {
    requireAdmin(locals.user, url, 'pickem:admin', request.headers);

    const rows = await sql<Row[]>`
        select e.id, e.kind, e.fixture_id, e.matchweek, e.before, e.after, e.note, e.created_at,
               coalesce(a.display_name, a.username) as admin_name,
               coalesce(t.display_name, t.username) as target_name
        from admin_edits e
        join users a on a.id = e.admin_id
        join users t on t.id = e.target_id
        order by e.created_at desc
        limit 200`;

    return json({
        ok: true,
        edits: rows.map((r) => ({
            id: String(r.id),
            kind: r.kind,
            fixtureId: r.fixture_id,
            matchweek: r.matchweek,
            before: r.before,
            after: r.after,
            note: r.note,
            at: r.created_at,
            admin: r.admin_name,
            target: r.target_name,
            // An admin editing their own entry is legal but worth surfacing.
            self: r.admin_name === r.target_name
        }))
    });
};
