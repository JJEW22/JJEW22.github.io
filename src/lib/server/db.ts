import postgres from 'postgres';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

// One pooled client for the app. `ssl: 'require'` suits Supabase/Neon; drop it
// (or set ssl: false) for a plain local Postgres.
export const sql = postgres(env.DATABASE_URL, { ssl: 'require' });
