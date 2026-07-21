// src/lib/server/email.ts
import { env } from '$env/dynamic/private';

// From-address must be on a domain you've verified in Resend for real delivery.
// resend.dev only delivers to the account owner (fine for testing "to me").
const FROM = env.FROM_EMAIL || 'Pickem <onboarding@resend.dev>';
export const ADMIN_EMAIL = env.ADMIN_EMAIL || 'john.e.wilkins22@gmail.com';

export async function sendEmail(opts: { to: string; subject: string; text: string }): Promise<{ ok: boolean; skipped?: boolean }> {
    if (!env.RESEND_API_KEY) {
        console.log('[email:noop] would send', { to: opts.to, subject: opts.subject });
        return { ok: false, skipped: true };
    }
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: FROM, to: [opts.to], subject: opts.subject, text: opts.text })
        });
        if (!res.ok) {
            console.error('[email] send failed', res.status, await res.text());
            return { ok: false };
        }
        return { ok: true };
    } catch (err) {
        console.error('[email] send error', err);
        return { ok: false };
    }
}