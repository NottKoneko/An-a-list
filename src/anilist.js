// Simple helpers for AniList + fuzzy matching

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenSet(str) {
  return new Set(normalize(str).split(' ').filter(Boolean))
}

// Very simple Jaccard similarity on tokens (0–1)
function similarity(a, b) {
  const sa = tokenSet(a)
  const sb = tokenSet(b)

  if (sa.size === 0 || sb.size === 0) return 0

  let intersection = 0
  for (const t of sa) {
    if (sb.has(t)) intersection++
  }
  const union = sa.size + sb.size - intersection
  return intersection / union
}

// Call AniList search API
export async function searchAnimeOnAniList(search) {
  const query = `
    query ($search: String) {
      Page(perPage: 5) {
        media(search: $search, type: ANIME) {
          id
          title {
            romaji
            english
            native
          }
          coverImage {
            medium
          }
          seasonYear
        }
      }
    }
  `

  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables: { search } }),
  })

  if (!res.ok) {
    console.error('AniList error', await res.text())
    return []
  }

  const json = await res.json()
  return json.data?.Page?.media ?? []
}

// High-level: given a raw line of text, return match info
export async function matchAnime(rawInput) {
  const trimmed = rawInput.trim()
  if (!trimmed) return null

  const candidates = await searchAnimeOnAniList(trimmed)
  if (!candidates.length) {
    return {
      raw: trimmed,
      type: 'no-match',
      candidates: [],
    }
  }

  // score candidates
  const scores = candidates.map((c) => {
    const titles = [c.title.english, c.title.romaji, c.title.native].filter(Boolean)
    const bestScore = Math.max(...titles.map((t) => similarity(trimmed, t)))
    return { anime: c, score: bestScore }
  })

  scores.sort((a, b) => b.score - a.score)

  const best = scores[0]
  const second = scores[1]

  const AUTO_THRESHOLD = 0.7
  const MARGIN_MIN = 0.2

  const margin = second ? best.score - second.score : 1

  if (best.score >= AUTO_THRESHOLD && margin >= MARGIN_MIN) {
    return {
      raw: trimmed,
      type: 'auto',
      best,
      candidates: scores,
    }
  }

  return {
    raw: trimmed,
    type: 'review',
    best,
    candidates: scores,
  }
}
