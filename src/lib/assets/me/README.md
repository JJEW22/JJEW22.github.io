# Me page project images

One image per project card on `/me`, named after the project's `image` key in
`src/routes/me/+page.svelte`:

| Project | File |
|---|---|
| Snow Predictions | `snow.*` |
| March Madness Bracket | `marchMadness.*` |
| JP Pizza Bracket | `pizzaBracket.*` |
| Premier League Pickem | `premierLeaguePickem.*` |
| meSoup | `meSoup.*` |
| Krillion, rescored | `krillion.*` |
| Ultra tracker | `ultra.*` |

Any of `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif` or `.svg`. Cards are 200px tall and
about 350px wide, cropped to fill, so a landscape image around 800x450 works well.
A project with no file here keeps the folder placeholder. JP Flicks uses its logo
from `src/lib/assets/` instead.
