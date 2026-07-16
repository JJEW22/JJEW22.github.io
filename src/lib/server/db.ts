// src/lib/server/db.ts
import postgres from 'postgres';
import { env } from '$env/dynamic/private';

type Sql = ReturnType<typeof postgres>;

let _sql: Sql | null = null;
function client(): Sql {
    if (!_sql) {
        if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
        _sql = postgres(env.DATABASE_URL, { ssl: 'require' });
    }
    return _sql;
}

// Lazy proxy: the connection (and the env-var check) happens on FIRST USE, not at
// import time. This keeps the module safe to import during the build's route
// analysis, where DATABASE_URL isn't set. `sql\`...\`` and `sql.json(...)` both work.
export const sql = new Proxy(function () {} as unknown as Sql, {
    apply(_target, _thisArg, args: any[]) {
        return (client() as any)(...args);
    },
    get(_target, prop) {
        const c = client() as any;
        const value = c[prop];
        return typeof value === 'function' ? value.bind(c) : value;
    }
}) as Sql;
