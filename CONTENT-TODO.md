# Content to fill in

Everything on the site that is **not** sourced from something public is listed
here, so it can be dealt with in one pass.

The rule the site was built on: nothing about Jack was invented. Every fact on
the page came from the [ElectricJack GitHub profile](https://github.com/ElectricJack),
the pinned repositories' own READMEs, or the
[Outrider site](https://electricjack.github.io/outrider-ide/). Where a fact was
needed and no public source had it, there is a placeholder instead of a guess.

## How placeholders are marked

Each one carries `class="is-placeholder" data-todo="content-N"` in
`src/index.html`, and an HTML comment above it saying what it wants. They render
with a dashed amber outline and a small `TODO content-N` chip, so an unfinished
page is obvious rather than quietly wrong.

`npm run build` prints how many are left:

```
placeholders 5 unfilled: content-3, content-4, content-5, content-6, content-7
```

To retire one: replace the copy, then delete the `is-placeholder` class and its
`data-todo` attribute. When the count reaches zero, delete this file and the
`.is-placeholder` rules in `src/styles.css`.

(Four of the nine below are in `<head>` or a comment rather than on a rendered
element, so the build's count of five is lower than this list of nine.)

---

## content-1 — meta description

**Where:** `src/index.html`, `<meta name="description">`
**Why it's a placeholder:** it paraphrases the GitHub bio, which is fine as a
stopgap but is not how you'd describe yourself to a stranger in 155 characters.
**What it needs:** one sentence, under 155 characters, that would make sense as
the grey line under a search result.

## content-2 — share image

**Where:** `src/index.html`, the commented-out `og:image` and
`twitter:card` tags
**What it needs:** a 1200×630 PNG at `public/og.png`, then uncomment both tags.
Until then the page ships `twitter:card = summary`, which is correct for a site
with no image — a `summary_large_image` card with no image renders as a blank
rectangle, so don't uncomment one without the other.

## content-3 — hero tagline

**Where:** the lead paragraph under the `Jack Kern` headline
**Currently:** *"Background in software engineering for games, turned agentic
systems architect."* — that is **verbatim from the GitHub bio**, not written for
this page. The second sentence ("I build instruments for reading code…") is an
inference drawn from what the four projects have in common; it is defensible but
it is not something you have said in public.
**What it needs:** the same idea in your own voice, or a decision to keep the
bio as-is and drop the placeholder marker.

## content-4 — the about paragraph

**Where:** `#about`, first paragraph
**Why it's a placeholder:** *no public source describes your career*, so this is
the one block on the page with no factual basis at all. It currently contains
instructions to itself.
**What it needs:** two or three sentences — where you started, what you shipped
in games, what pulled you toward agentic systems. The second paragraph in that
section is real (it only describes the four projects) and can stay.

## content-5 — portrait

**Where:** `#about`, the `JK` monogram box
**What it needs:** a square photo, at least 600×600, at `public/jack.jpg`. Then
replace the `div.portrait__placeholder` with:

```html
<img src="/jack.jpg" width="600" height="600" alt="Jack Kern" loading="lazy" />
```

`width` and `height` are not optional — the page currently scores CLS 0 and an
unsized image is the usual way to lose that. Update the `figcaption` too, or
delete it.

Alternative considered and rejected: pulling the GitHub avatar from
`avatars.githubusercontent.com`. It is public, but it costs a third-party
connection on the critical path for the one image on the page.

## content-6 — the Elsewhere section

**Where:** `#writing`, the note above the link list
**Why it's a placeholder:** no blog, newsletter, RSS feed or talk list was found
on any public profile. The section exists because the brief asked for one, not
because there was anything to put in it.
**What it needs:** a decision. Either add real links, or delete the whole
`#writing` section and its `Elsewhere` entry in the nav — an empty section is
worse than no section.

## content-7 — social links

**Where:** `#writing`, the last list item
**Currently:** GitHub and X are real (both are listed on the GitHub profile).
The fourth row is a placeholder for everything else.
**What it needs:** add LinkedIn / Mastodon / Bluesky / itch.io / anything else
as `<li><a href="…" rel="me noopener">Name</a><span class="links__note">…</span></li>`,
or delete the row. Keep `rel="me"` on anything you want
[IndieAuth](https://indieauth.com/) to treat as yours.

## content-8 — the contact address

**Where:** `#contact`, the `mailto:` button
**Currently:** `jack.w.kern@gmail.com` — the address **you have already
published** on your GitHub profile, which is why it was used rather than
invented.
**What it needs:** a yes or a swap. A GitHub profile is already scraped, but an
apex domain with a `mailto:` is scraped harder. If you'd rather not, the options
are an alias (`hi@jackkern.com`, which GoDaddy can forward), a contact form
(needs a third-party endpoint — the site is otherwise serverless), or dropping
the button and leaving "File an issue".

## content-9 — structured data

**Where:** the `application/ld+json` block at the end of `src/index.html`
**Currently:** `name`, `url`, `worksFor`, `address` and `sameAs` are all sourced
from the public GitHub profile.
**What it needs:** a `jobTitle` (the profile doesn't state one), and any extra
profile URLs added for content-7 mirrored into `sameAs`.

---

## Not a placeholder — deliberately sourced

For the record, so nobody "fixes" these into something unsourced:

| On the page | Source |
| --- | --- |
| `Oakland, CA` | GitHub profile `location` |
| `Aristocrat Technologies` | GitHub profile `company` |
| `Rust · C/C++ · C# · Python · TS` | GitHub profile bio (`c/c++/c#/js/ts/py`) plus each pinned repo's primary language |
| Outrider card | [outrider-ide README](https://github.com/ElectricJack/outrider-ide) and its site |
| Agent Queue card | [agent-queue README](https://github.com/ElectricJack/agent-queue) |
| Matter Engine card | [matter-engine README](https://github.com/ElectricJack/matter-engine) |
| Quilt Trader card | [quilt-trader README](https://github.com/ElectricJack/quilt-trader) |
| `24 public repositories` | GitHub profile `public_repos` — **this one goes stale**; it is a hand-written number, not a live count |
| `@ElectricJack` on X | GitHub profile `twitter_username` |
