import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [
        sveltekit(),
        {
            name: 'inject-build-date',
            transform(code, id) {
                if (id.includes('src/routes/+page.svelte')) {
                    const date = new Date().toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });
                    return code.replace('__BUILD_DATE__', `"${date}"`);
                }
                return code;
            }
        }
    ]
});
