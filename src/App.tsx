import { useEffect, useState } from 'react'
import './App.css'
import bunadEntriesRaw from './assets/bunader/bunader_with_locations.json'
import { NorwayMap } from './components/NorwayMap'
import {
  averageDistanceKm,
  distanceToScore,
  formatDistanceKm,
  haversineDistanceKm,
  shuffleItems,
  sumScores,
} from './lib/game'
import type { BunadEntry, Coordinates, NorwayGeoJson, RoundResult } from './types'

const MAP_DATA_URL = '/Norge-L.geojson'
const DECORATIVE_FLAG_COUNT = 6
const ROUND_SIZE = 10
const bunadImageModules = import.meta.glob('./assets/bunader/*.{jpg,jpeg,png,webp,avif}', {
  eager: true,
  import: 'default',
}) as Record<string, string>

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to load ${url} (${response.status})`)
  }

  return (await response.json()) as T
}

function isCoordinates(value: unknown): value is Coordinates {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  )
}

function isBunadEntry(value: unknown): value is BunadEntry {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const entry = value as Record<string, unknown>

  return (
    typeof entry.id === 'string' &&
    typeof entry.label === 'string' &&
    typeof entry.place === 'string' &&
    typeof entry.image === 'string' &&
    isCoordinates(entry.coordinates)
  )
}

function parseBunadEntries(value: unknown): BunadEntry[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Forventet minst én bunadoppføring i datasettet.')
  }

  if (!value.every(isBunadEntry)) {
    throw new Error(
      'Ugyldige bunaddata. Hver oppføring må ha id, label, place, image og coordinates.',
    )
  }

  return value
}

function resolveBunadImagePath(imagePath: string) {
  const fileName = imagePath.split('/').at(-1)

  if (!fileName) {
    return imagePath
  }

  const matchedEntry = Object.entries(bunadImageModules).find(([modulePath]) =>
    modulePath.endsWith(`/${fileName}`),
  )

  return matchedEntry?.[1] ?? imagePath
}

function hydrateBunadEntries(value: unknown): BunadEntry[] {
  return parseBunadEntries(value).map((entry) => ({
    ...entry,
    image: resolveBunadImagePath(entry.image),
  }))
}

function buildRoundDeck(entries: BunadEntry[]) {
  return shuffleItems(entries).slice(0, Math.min(ROUND_SIZE, entries.length))
}

function NorwayFlag({ className = '', delayMs = 0 }: { className?: string; delayMs?: number }) {
  return (
    <svg
      className={className}
      viewBox="0 0 22 16"
      aria-hidden="true"
      focusable="false"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <rect width="22" height="16" rx="1.5" fill="#ba0c2f" />
      <rect x="6" width="4" height="16" fill="#ffffff" />
      <rect y="6" width="22" height="4" fill="#ffffff" />
      <rect x="7" width="2" height="16" fill="#00205b" />
      <rect y="7" width="22" height="2" fill="#00205b" />
    </svg>
  )
}

function CelebrationRibbon({ compact = false }: { compact?: boolean }) {
  const flags = Array.from({ length: compact ? 3 : DECORATIVE_FLAG_COUNT }, (_, index) => index)

  return (
    <div className={`celebration-ribbon ${compact ? 'celebration-ribbon--compact' : ''}`}>
      <div className="celebration-ribbon__flags" aria-hidden="true">
        {flags.map((index) => (
          <NorwayFlag key={index} className="norway-flag" delayMs={index * 140} />
        ))}
      </div>
      <span className="celebration-ribbon__text">17. mai-utgave</span>
    </div>
  )
}

function App() {
  const [geoJson, setGeoJson] = useState<NorwayGeoJson | null>(null)
  const [bunads, setBunads] = useState<BunadEntry[]>([])
  const [deck, setDeck] = useState<BunadEntry[]>([])
  const [roundIndex, setRoundIndex] = useState(0)
  const [guess, setGuess] = useState<Coordinates | null>(null)
  const [results, setResults] = useState<RoundResult[]>([])
  const [isRevealed, setIsRevealed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let isActive = true

    async function loadGame() {
      setIsLoading(true)
      setError(null)

      try {
        const mapData = await loadJson<NorwayGeoJson>(MAP_DATA_URL)

        if (!isActive) {
          return
        }

        const parsedEntries = hydrateBunadEntries(bunadEntriesRaw)
        setGeoJson(mapData)
        setBunads(parsedEntries)
        setDeck(buildRoundDeck(parsedEntries))
        setRoundIndex(0)
        setGuess(null)
        setResults([])
        setIsRevealed(false)
      } catch (loadError) {
        if (!isActive) {
          return
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Noe gikk galt ved lasting av kartet og bunaddataene.',
        )
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    void loadGame()

    return () => {
      isActive = false
    }
  }, [reloadToken])

  const totalScore = sumScores(results)
  const averageDistance = averageDistanceKm(results)
  const currentBunad = deck[roundIndex]
  const currentResult = isRevealed ? results.at(-1) ?? null : null
  const isFinished = !isLoading && !error && deck.length > 0 && roundIndex >= deck.length
  const bestResult =
    results.length > 0
      ? results.reduce((best, result) =>
        result.distanceKm < best.distanceKm ? result : best,
      )
      : null

  function restartGame(sourceEntries = bunads) {
    setDeck(buildRoundDeck(sourceEntries))
    setRoundIndex(0)
    setGuess(null)
    setResults([])
    setIsRevealed(false)
  }

  function handleConfirmGuess() {
    if (!currentBunad || !guess || isRevealed) {
      return
    }

    const distanceKm = haversineDistanceKm(guess, currentBunad.coordinates)
    const score = distanceToScore(distanceKm)

    setResults((currentResults) => [
      ...currentResults,
      {
        id: currentBunad.id,
        label: currentBunad.label,
        place: currentBunad.place,
        image: currentBunad.image,
        guess,
        answer: currentBunad.coordinates,
        distanceKm,
        score,
      },
    ])
    setIsRevealed(true)
  }

  function handleNextRound() {
    if (!isRevealed) {
      return
    }

    setRoundIndex((index) => index + 1)
    setGuess(null)
    setIsRevealed(false)
  }

  if (isLoading) {
    return (
      <main className="app-shell app-shell--state">
        <section className="state-card">
          <CelebrationRibbon compact />
          <span className="eyebrow">Laster</span>
          <h1>BunadGuessr</h1>
          <p>Gjør klart Norgeskartet og blander første runde.</p>
        </section>
      </main>
    )
  }

  if (error) {
    return (
      <main className="app-shell app-shell--state">
        <section className="state-card">
          <CelebrationRibbon compact />
          <span className="eyebrow">Lastefeil</span>
          <h1>Kunne ikke starte spillet</h1>
          <p>{error}</p>
          <div className="action-row">
            <button type="button" className="button" onClick={() => setReloadToken((value) => value + 1)}>
              Prøv igjen
            </button>
          </div>
        </section>
      </main>
    )
  }

  if (!geoJson || deck.length === 0) {
    return (
      <main className="app-shell app-shell--state">
        <section className="state-card">
          <CelebrationRibbon compact />
          <span className="eyebrow">Ingen data</span>
          <h1>Fant ingen bunader</h1>
          <p>Legg til oppføringer i <code>src/assets/bunader/bunader_with_locations.json</code> og last inn på nytt.</p>
        </section>
      </main>
    )
  }

  if (isFinished) {
    return (
      <main className="app-shell">
        <header className="app-header">
          <div className="app-header__lead">
            <CelebrationRibbon />
            <span className="eyebrow">Ferdig</span>
            <h3>BunadGuessr</h3>
            <p className="intro">
              Runden er ferdig. Gjennomsnittlig avstand og resultat for hver bunad vises under.
            </p>
          </div>
          <div className="progress-strip">
            <div className="progress-pill">
              <span>Total poengsum</span>
              <strong>{totalScore.toLocaleString()}</strong>
            </div>
            <div className="progress-pill">
              <span>Snittbom</span>
              <strong>{formatDistanceKm(averageDistance)}</strong>
            </div>
            <div className="progress-pill">
              <span>Runder</span>
              <strong>{results.length}</strong>
            </div>
          </div>
        </header>

        <section className="summary-card card">
          <div className="summary-hero">
            <div>
              <span className="eyebrow">Sluttresultat</span>
              <h2>{totalScore.toLocaleString()} poeng</h2>
              <p>
                Beste treff:{' '}
                {bestResult
                  ? `${bestResult.label} med ${formatDistanceKm(bestResult.distanceKm)}`
                  : 'Ingen runder spilt'}
              </p>
            </div>
            <div className="action-row">
              <button type="button" className="button" onClick={() => restartGame()}>
                Spill igjen
              </button>
            </div>
          </div>

          <div className="summary-list">
            {results.map((result) => (
              <article key={result.id} className="summary-row">
                <img
                  className="summary-row__image"
                  src={result.image}
                  alt={`${result.label} from ${result.place}`}
                />
                <div className="summary-row__copy">
                  <h3>{result.label}</h3>
                  <p>{result.place}</p>
                </div>
                <div className="summary-row__metric">
                  <span>Avstand</span>
                  <strong>{formatDistanceKm(result.distanceKm)}</strong>
                </div>
                <div className="summary-row__metric">
                  <span>Poeng</span>
                  <strong>{result.score.toLocaleString()}</strong>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    )
  }

  const isLastRound = roundIndex === deck.length - 1
  const roundNumber = roundIndex + 1

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-header__lead">
          <CelebrationRibbon />
          <span className="eyebrow">17. mai-utfordring</span>
          <h2>BunadGuessr</h2>
          <p className="intro">
            Studer bunaden, og plasser ett gjett på Norgeskartet så nær opphavet som mulig.
          </p>
        </div>
        <div className="progress-strip">
          <div className="progress-pill">
            <span>Runde</span>
            <strong>
              {roundNumber} / {deck.length}
            </strong>
          </div>
          <div className="progress-pill">
            <span>Total poengsum</span>
            <strong>{totalScore.toLocaleString()}</strong>
          </div>
          <div className="progress-pill">
            <span>Status</span>
            <strong>{isRevealed ? 'Vist' : guess ? 'Gjett klart' : 'Venter'}</strong>
          </div>
        </div>
      </header>

      <section className="game-layout">
        <article className="card image-panel">
          <div className="panel-heading">
            <span className="eyebrow">Bunaden i denne runden</span>
            <p>{isRevealed ? 'Fasiten vises under' : 'Navnet holdes skjult til du bekrefter gjettet ditt.'}</p>
          </div>

          <div className="image-frame">
            <img
              src={currentBunad.image}
              alt={isRevealed ? `${currentBunad.label} fra ${currentBunad.place}` : 'Bunad for denne runden'}
            />
          </div>

          <div className="prompt-card">
            <span className="prompt-card__label">Mål for runden</span>
            <p>{guess ? 'Gjett plassert. Klikk igjen for å justere før du bekrefter.' : 'Klikk på kartet for å plassere gjettet ditt.'}</p>
          </div>

          {currentResult ? (
            <div className="result-card">
              <div>
                <span className="eyebrow">Resultat</span>
                <h2>{currentBunad.label}</h2>
                <p>{currentBunad.place}</p>
              </div>
              <div className="result-metrics">
                <div className="metric-box">
                  <span>Avstand</span>
                  <strong>{formatDistanceKm(currentResult.distanceKm)}</strong>
                </div>
                <div className="metric-box">
                  <span>Poeng i runden</span>
                  <strong>{currentResult.score.toLocaleString()}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="hint-card">
              <span className="eyebrow">Poengberegning</span>
              <p>Poeng regnes ut fra avstand i km. Jo nærmere du gjetter, desto høyere poeng.</p>
            </div>
          )}

          <div className="action-row">
            <button type="button" className="button" onClick={handleConfirmGuess} disabled={!guess || isRevealed}>
              Bekreft gjett
            </button>
            {isRevealed ? (
              <button type="button" className="button button--secondary" onClick={handleNextRound}>
                {isLastRound ? 'Se sluttresultat' : 'Neste bunad'}
              </button>
            ) : (
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setGuess(null)}
                disabled={!guess}
              >
                Fjern gjett
              </button>
            )}
          </div>
        </article>

        <article className="card map-panel">
          <div className="panel-heading panel-heading--map">
            <div>
              <span className="eyebrow">Kart</span>
              <h2>Norge</h2>
            </div>
            <p>Klikk én gang for å plassere gjettet ditt.</p>
          </div>

          <NorwayMap
            key={roundIndex}
            geoJson={geoJson}
            guess={guess}
            answer={isRevealed ? currentBunad.coordinates : null}
            locked={isRevealed}
            onGuess={setGuess}
          />

          <div className="map-footer">
            <p>{isRevealed ? `Riktig opphav: ${currentBunad.place}` : 'Plasser én markør hvor som helst på kartet.'}</p>
            <p>{guess ? 'Markøren din er plassert.' : 'Ingen markør er plassert ennå.'}</p>
          </div>
        </article>
      </section>
    </main>
  )
}

export default App
