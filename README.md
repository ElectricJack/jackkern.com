# jackkern.com

The personal site at **[jackkern.com](https://jackkern.com)** — one HTML page,
one stylesheet, 3 kB of JavaScript, published to GitHub Pages by GitHub Actions.

No framework, no dependencies, no lockfile. `npm install` does nothing here
because there is nothing to install; the build is a Node script that uses only
builtins.

```bash
npm run dev      # http://localhost:4321 — serves src/ over public/
npm run build    # -> dist/
npm run preview  # serve dist/, i.e. exactly what ships
npm run check    # build, then link-check including external URLs
```

Copy that still needs writing is in **[CONTENT-TODO.md](CONTENT-TODO.md)**.

## Layout

```
src/index.html      the page
src/styles.css      the whole design system, tokens at the top
src/site.js         theme toggle, nav current-section marker, footer year
public/             copied verbatim into dist/ (CNAME, favicon, robots, sitemap)
tools/build.mjs     public/ + src/ -> dist/, inlining the CSS
tools/link-check.mjs  runs over dist/, not src/
tools/dev.mjs       local server
```

## Why it is built this way

**No framework.** Astro was the obvious candidate — it is what
`agent-queue-web` uses — but its leverage is component composition, content
collections, MDX and partial hydration, and a single page with five anchored
sections uses none of them. What it would have added is a lockfile, a few
hundred transitive dependencies and an upgrade treadmill. If this site ever
grows a blog, that trade flips; today it does not.

**The CSS is inlined into the page at build time.** At ~11 kB minified the
stylesheet is smaller than the round trip it would cost, and inlining removes
the only render-blocking request on the critical path. `src/index.html` keeps a
normal `<link>` so it works unbuilt; `tools/build.mjs` swaps it for a `<style>`.

**No web fonts.** The type is a system stack, so the page ships zero font bytes
and there is no FOUT to design around. `lighthouserc.json` asserts
`resource-summary:font:size` is 0 — adding a font is a deliberate act that has
to move that line.

**Dark by default, light on request.** Tokens are declared for dark on `:root`
and redeclared for light under both `prefers-color-scheme` and
`[data-theme="light"]`, so the toggle can beat the OS in either direction. An
inline script in `<head>` applies the saved choice before first paint; without
JavaScript the media query is all there is, and the page is still correct.

**Placeholders are visible.** Unwritten copy renders with a dashed amber outline
and a `TODO content-N` chip rather than as plausible-looking filler. See
CONTENT-TODO.md.

### Budgets

CI holds the built page to `lighthouserc.json`: performance ≥ 95, accessibility,
best-practices and SEO at 100, CLS ≤ 0.01, and hard caps on script, font and
total transfer size. Measured locally over three mobile runs:

| | perf | a11y | best practices | SEO | FCP | LCP | CLS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| dist/index.html | 100 / 99 / 100 | 100 | 100 | 100 | 0.7–0.8 s | 0.9–1.0 s | 0 |

Whole page, everything included: **31 kB**.

Run it yourself with `npm run lighthouse` (fetches `@lhci/cli` via npx; needs a
local Chrome).

> On WSL, that command litters the repo with `undefined:/…` and
> `\\wsl.localhost\…` directories — chrome-launcher detects WSL, takes its
> Windows branch, and cannot resolve a Windows AppData path to put the throwaway
> Chrome profile in, so it lands relative to the working directory. They are
> `.gitignore`d and safe to delete. CI runs on plain Linux and never hits it.

## Deploying

`main` deploys itself. `.github/workflows/deploy.yml` builds, link-checks, and
publishes `dist/` with `actions/deploy-pages`. `.github/workflows/ci.yml` runs
the same build plus the external link check and the Lighthouse budget on every
pull request.

`public/CNAME` contains `jackkern.com` and is copied into `dist/`. For a site
published by Actions the custom domain comes from the *artifact* — if that file
ever goes missing, the domain silently reverts to `electricjack.github.io/jackkern.com`.
`tools/build.mjs` fails the build if `dist/CNAME` is absent.

### Repository settings — already done

Both were set through the API and need no clicking:

```bash
gh api -X POST repos/ElectricJack/jackkern.com/pages -f build_type=workflow
gh api -X PUT  repos/ElectricJack/jackkern.com/pages -f cname=jackkern.com -f build_type=workflow
gh api repos/ElectricJack/jackkern.com/pages   # verify
```

The verified state is `build_type: workflow`, `cname: jackkern.com`. If it ever
needs redoing by hand: **Settings → Pages**, set *Source* to **GitHub Actions**,
then under *Custom domain* enter `jackkern.com` and press **Save**.

## DNS — what you still have to do

This is the only step that is not automated, because the domain is at a
registrar, not on GitHub.

`jackkern.com` is registered through **GoDaddy** (`ns15/ns16.domaincontrol.com`)
and today it still points at a **parking page**:

```
$ dig +short jackkern.com A
13.248.243.5
76.223.105.230
```

Those two records have to be **deleted**, not left alongside the new ones. DNS
round-robins across every A record it finds, so leaving them means a share of
visitors keep landing on the parked page.

In GoDaddy: *My Products → jackkern.com → DNS → Manage Zones*. Delete the two
existing `A` records for `@`, then make the zone match this:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| A | @ | 185.199.108.153 | 600 |
| A | @ | 185.199.109.153 | 600 |
| A | @ | 185.199.110.153 | 600 |
| A | @ | 185.199.111.153 | 600 |
| CNAME | www | electricjack.github.io | 600 |

All four A records are required — they are GitHub Pages' anycast edge, and
GitHub's own checks expect the full set.

There is already a `CNAME` for `www` pointing at `jackkern.com`; repoint it at
`electricjack.github.io` (no trailing dot needed in GoDaddy's UI). Optionally
add the `AAAA` records from
[GitHub's apex-domain docs](https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site#configuring-an-apex-domain)
for IPv6.

### Then, once it has propagated

```bash
dig +short jackkern.com A          # expect the four 185.199.x.153 addresses
dig +short www.jackkern.com CNAME  # expect electricjack.github.io.
```

**Enforce HTTPS last.** GitHub only issues the Let's Encrypt certificate after
the apex resolves to its IPs, so the checkbox is not available until the records
above are live — it currently reads `https_enforced: false`. Once DNS resolves,
go to **Settings → Pages** and tick **Enforce HTTPS** (or
`gh api -X PUT repos/ElectricJack/jackkern.com/pages -F https_enforced=true`).
Propagation is usually minutes on a 600 s TTL, occasionally a few hours.

Until that is ticked, `http://jackkern.com` will serve but will not redirect,
and the `https://` links in this README will not resolve.

## Licence

[MIT](LICENSE).
