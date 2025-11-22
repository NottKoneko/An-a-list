// Simple helpers for AniList + fuzzy matching

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Small alias map to cover shorthand or odd phrases
const ALIAS_MAP = {
  aot: 'attack on titan',
  jjk: 'jujutsu kaisen',
  'opm': 'one punch man',
  'mha': 'my hero academia',
  'fma': 'fullmetal alchemist',
}

function applyAlias(input) {
  const normalized = normalize(input)
  return ALIAS_MAP[normalized] ?? input
}

function levenshteinDistance(a, b) {
  if (a === b) return 0

  const aLen = a.length
  const bLen = b.length

  if (aLen === 0) return bLen
  if (bLen === 0) return aLen

  const prevRow = Array.from({ length: bLen + 1 }, (_, i) => i)
  const currRow = new Array(bLen + 1)

  for (let i = 1; i <= aLen; i++) {
    currRow[0] = i
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      currRow[j] = Math.min(
        prevRow[j] + 1, // deletion
        currRow[j - 1] + 1, // insertion
        prevRow[j - 1] + cost // substitution
      )
    }
    prevRow.splice(0, prevRow.length, ...currRow)
  }

  return prevRow[bLen]
}

// Normalized Levenshtein similarity (0–1)
function similarity(a, b) {
  const na = normalize(a)
  const nb = normalize(b)

  if (na.length === 0 && nb.length === 0) return 1
  if (na.length === 0 || nb.length === 0) return 0

  const distance = levenshteinDistance(na, nb)
  const maxLen = Math.max(na.length, nb.length)
  return 1 - distance / maxLen
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

  const aliasedInput = applyAlias(trimmed)

  const candidates = await searchAnimeOnAniList(aliasedInput)
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
    const bestScore = Math.max(...titles.map((t) => similarity(aliasedInput, t)))
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
