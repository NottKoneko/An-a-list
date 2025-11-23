# An-a-list

## Configuration

Set the following environment variables (for local development, use a `.env` file). The Google Custom Search fallback refines messy inputs before re-running AniList lookups with the improved phrase.

```
VITE_GOOGLE_CSE_API_KEY=<your Google Custom Search JSON API key>
VITE_GOOGLE_CSE_CX=<your custom search engine ID configured for anime sites>
```

### Cloudflare Variables and Secrets

If you deploy on Cloudflare Pages, set the values in **Settings → Environment variables**:

- Add `VITE_GOOGLE_CSE_API_KEY` as a **Secret** (because it is sensitive).
- Add `VITE_GOOGLE_CSE_CX` as a regular **Variable**.

Redeploy after adding the variables so the values are available to Vite at build time.
