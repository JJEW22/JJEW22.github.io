// src/lib/server/appMeta.ts
// Key/value scratch table (sql/012_feature_cron.sql), shared by the sync jobs'
// bookkeeping and the admin-controlled visibility flags.
import { sql } from '$lib/server/db';

export async function getMeta(key: string): Promise<string | null> {
    const row = (await sql`select value from app_meta where key = ${key}`)[0];
    return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
    await sql`insert into app_meta (key, value, updated_at) values (${key}, ${value}, now())
              on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

// Admin toggle for "everyone can browse everyone else's predicted final table".
// Off until an admin flips it, and flippable back off at any time.
export const REVEAL_TABLES_KEY = 'reveal_table_predictions';

// A missing row reads as off, so this is safe before the flag is ever written.
// It also swallows errors rather than 500ing the pages that read it on every load.
export async function getFlag(key: string): Promise<boolean> {
    try {
        return (await getMeta(key)) === 'true';
    } catch (err) {
        console.error(`appMeta: flag "${key}" lookup failed — has sql/012_feature_cron.sql been run?`, err);
        return false;
    }
}

export async function setFlag(key: string, on: boolean): Promise<void> {
    await setMeta(key, on ? 'true' : 'false');
}
