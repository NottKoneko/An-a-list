import { useEffect, useState } from 'react'
import { matchAnime } from './anilist'

const STORAGE_KEY = 'animeList_v0'
const QUEUE_KEY = 'animeQueue_v0'

function getLocalStorage() {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function loadFromStorage(key, fallback) {
  const storage = getLocalStorage()
  if (!storage) return fallback

  try {
    const raw = storage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function saveToStorage(key, value) {
  const storage = getLocalStorage()
  if (!storage) return

  try {
    storage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.warn('Unable to persist data to localStorage', e)
  }
}

function App() {
  const [inputText, setInputText] = useState('')
  const [animeList, setAnimeList] = useState([])
  const [queue, setQueue] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [storageHealthy, setStorageHealthy] = useState(true)

  useEffect(() => {
    const storage = getLocalStorage()

    if (!storage) {
      setStorageHealthy(false)
      return
    }

    setAnimeList(loadFromStorage(STORAGE_KEY, []))
    setQueue(loadFromStorage(QUEUE_KEY, []))
  }, [])

  useEffect(() => {
    saveToStorage(STORAGE_KEY, animeList)
  }, [animeList])

  useEffect(() => {
    saveToStorage(QUEUE_KEY, queue)
  }, [queue])

  async function handleProcess() {
    const lines = inputText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    if (!lines.length) return

    setIsProcessing(true)

    const results = []
    for (const line of lines) {
      try {
        const r = await matchAnime(line)
        if (r) results.push(r)
      } catch (e) {
        console.error('Error matching', line, e)
      }
    }

    const newList = [...animeList]
    const newQueue = [...queue]

    for (const r of results) {
      if (r.type === 'auto' && r.best?.anime) {
        const a = r.best.anime
        if (!newList.some((x) => x.id === a.id)) {
          newList.push({
            id: a.id,
            title: a.title.english || a.title.romaji || a.title.native,
            seasonYear: a.seasonYear,
            cover: a.coverImage?.medium,
            rawInput: r.raw,
          })
        }
      } else {
        newQueue.push(r)
      }
    }

    setAnimeList(newList)
    setQueue(newQueue)
    setIsProcessing(false)
  }

  function handleApprove(queueIndex, candidateIndex = 0) {
    const item = queue[queueIndex]
    const pick = item.candidates[candidateIndex]
    if (!pick) return

    const a = pick.anime

    if (!animeList.some((x) => x.id === a.id)) {
      const newList = [
        ...animeList,
        {
          id: a.id,
          title: a.title.english || a.title.romaji || a.title.native,
          seasonYear: a.seasonYear,
          cover: a.coverImage?.medium,
          rawInput: item.raw,
        },
      ]
      setAnimeList(newList)
    }

    const newQueue = [...queue]
    newQueue.splice(queueIndex, 1)
    setQueue(newQueue)
  }

  function handleDiscard(queueIndex) {
    const newQueue = [...queue]
    newQueue.splice(queueIndex, 1)
    setQueue(newQueue)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '1.5rem',
        background: '#050914',
        color: '#f9fafb',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        AniList Helper v0
      </h1>
      {!storageHealthy && (
        <p style={{ marginBottom: '0.75rem', color: '#fbbf24' }}>
          Storage is disabled in this browser, so your list won&apos;t be saved across refreshes.
        </p>
      )}
      <p style={{ marginBottom: '1rem', opacity: 0.8 }}>
        Paste anime names (one per line). I&apos;ll try to match them and auto-add confident ones.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)',
          gap: '1.25rem',
          alignItems: 'flex-start',
        }}
      >
        {/* Left: input */}
        <div
          style={{
            background: '#0f172a',
            padding: '1rem',
            borderRadius: '0.75rem',
            boxShadow: '0 10px 30px rgba(15,23,42,0.8)',
          }}
        >
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={'one punch man\njjk\nattack on titian\nre zero season 2'}
            style={{
              width: '100%',
              minHeight: '180px',
              background: '#020617',
              color: '#e5e7eb',
              borderRadius: '0.5rem',
              border: '1px solid #1f2937',
              padding: '0.75rem',
              resize: 'vertical',
            }}
          />
          <button
            onClick={handleProcess}
            disabled={isProcessing}
            style={{
              marginTop: '0.75rem',
              padding: '0.5rem 1rem',
              borderRadius: '999px',
              border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #ec4899, #fbbf24)',
              color: '#0f172a',
              fontWeight: 600,
              cursor: isProcessing ? 'default' : 'pointer',
              opacity: isProcessing ? 0.6 : 1,
            }}
          >
            {isProcessing ? 'Processing...' : 'Process input'}
          </button>
        </div>

        {/* Right: lists */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* My List */}
          <section
            style={{
              background: '#020617',
              padding: '1rem',
              borderRadius: '0.75rem',
              border: '1px solid #111827',
            }}
          >
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
              ✅ My Anime List ({animeList.length})
            </h2>
            {animeList.length === 0 && <p style={{ opacity: 0.7 }}>Nothing yet. Add some anime!</p>}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '0.75rem',
              }}
            >
              {animeList.map((a) => (
                <div
                  key={a.id}
                  style={{
                    background: '#020617',
                    borderRadius: '0.75rem',
                    border: '1px solid #111827',
                    padding: '0.5rem',
                  }}
                >
                  {a.cover && (
                    <img
                      src={a.cover}
                      alt={a.title}
                      style={{
                        width: '100%',
                        borderRadius: '0.5rem',
                        marginBottom: '0.4rem',
                      }}
                    />
                  )}
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{a.title}</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>{a.seasonYear || '—'}</div>
                  <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>from: {a.rawInput}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Queue */}
          <section
            style={{
              background: '#020617',
              padding: '1rem',
              borderRadius: '0.75rem',
              border: '1px solid #111827',
            }}
          >
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
              ❓ Needs Review ({queue.length})
            </h2>
            {queue.length === 0 && <p style={{ opacity: 0.7 }}>No ambiguous results right now.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {queue.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    borderRadius: '0.75rem',
                    border: '1px solid #111827',
                    padding: '0.75rem',
                    background: '#020617',
                  }}
                >
                  <div style={{ fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                    <span style={{ opacity: 0.7 }}>Input:</span> <code style={{ fontSize: '0.8rem' }}>{item.raw}</code>
                  </div>
                  {item.candidates.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>No candidates found.</div>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                      }}
                    >
                      {item.candidates.slice(0, 3).map((c, cIdx) => {
                        const anime = c.anime
                        const title = anime.title.english || anime.title.romaji || anime.title.native
                        return (
                          <div
                            key={cIdx}
                            style={{
                              borderRadius: '0.75rem',
                              border: '1px solid #1f2937',
                              padding: '0.5rem',
                              maxWidth: '200px',
                            }}
                          >
                            {anime.coverImage?.medium && (
                              <img
                                src={anime.coverImage.medium}
                                alt={title}
                                style={{
                                  width: '100%',
                                  borderRadius: '0.5rem',
                                  marginBottom: '0.35rem',
                                }}
                              />
                            )}
                            <div
                              style={{
                                fontSize: '0.85rem',
                                fontWeight: 600,
                              }}
                            >
                              {title}
                            </div>
                            <div
                              style={{
                                fontSize: '0.7rem',
                                opacity: 0.7,
                                marginBottom: '0.25rem',
                              }}
                            >
                              Score: {c.score.toFixed(2)}
                            </div>
                            <button
                              onClick={() => handleApprove(idx, cIdx)}
                              style={{
                                marginTop: '0.15rem',
                                width: '100%',
                                borderRadius: '999px',
                                border: 'none',
                                padding: '0.25rem 0.5rem',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                background: 'linear-gradient(135deg,#22c55e,#a3e635)',
                                color: '#022c22',
                                fontWeight: 600,
                              }}
                            >
                              Confirm
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <button
                    onClick={() => handleDiscard(idx)}
                    style={{
                      marginTop: '0.5rem',
                      borderRadius: '999px',
                      border: 'none',
                      padding: '0.25rem 0.75rem',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      background: '#111827',
                      color: '#f9fafb',
                    }}
                  >
                    Discard
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default App
