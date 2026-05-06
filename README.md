# form-at

## Pending / backlog

### Missing — would break real usage

1. **Artwork on sets** — `sets.ts` has `artwork?: string` and `Player.tsx` uses it for the Media Session API lock screen display. Neither set has an artwork URL. Lock screen just shows text, no album art. Add a cover art / event flyer URL to each set.

2. **Analytics dashboard** — you asked for plays by date range and listened seconds by month. The D1 schema has the right data and indices (`started_at`, `listened_seconds`) but there is no page or query UI for it yet.

### Quick wins

3. **Cloudflare Web Analytics** — the script is commented out in `__root.tsx`. Add your token from the CF dashboard → Web Analytics and uncomment it.

4. **Set `description` and `duration` fields** — both sets in `sets.ts` are missing these. The detail page and archive list have UI ready for them.

5. **Mobile player track info** — title and artist in the bottom bar are `hidden sm:block`. On mobile there is no visible text telling you what is playing.

### Longer term

6. **Better Auth** — gating community features behind login. Mentioned in `CLAUDE.md` as not yet built.

7. **Custom domain** — update the `og:url` and `og:image` URLs in `__root.tsx` once a domain is set up. Social crawlers cache these aggressively so updating early matters.

8. **Social share image** — `og:image` currently uses the square F icon. A 1200×630 banner (event flyer crop on navy background) would give much richer link previews on Instagram, Twitter, etc.
