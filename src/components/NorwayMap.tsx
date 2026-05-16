import { geoMercator, geoPath, type GeoPermissibleObjects } from 'd3-geo'
import {
  useId,
  useRef,
  type MouseEvent,
} from 'react'
import type { Coordinates, NorwayGeoJson } from '../types'

const VIEWBOX_WIDTH = 760
const VIEWBOX_HEIGHT = 760
const MAP_PADDING = 18
const DEFAULT_ZOOM = 9
const DEFAULT_VIEW = {
  zoom: DEFAULT_ZOOM,
  panX: -3350,
  panY: -1450,
}

type MapPoint = {
  x: number
  y: number
}

type NorwayMapProps = {
  answer: Coordinates | null
  geoJson: NorwayGeoJson
  guess: Coordinates | null
  locked: boolean
  onGuess: (coordinates: Coordinates) => void
}

export function NorwayMap({
  answer,
  geoJson,
  guess,
  locked,
  onGuess,
}: NorwayMapProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const idBase = useId().replaceAll(':', '')
  const surfaceGradientId = `${idBase}-surface`
  const landGradientId = `${idBase}-land`

  const shape = geoJson as GeoPermissibleObjects
  const projection = geoMercator().fitExtent(
    [
      [MAP_PADDING, MAP_PADDING],
      [VIEWBOX_WIDTH - MAP_PADDING, VIEWBOX_HEIGHT - MAP_PADDING],
    ],
    shape,
  )
  const outlinePath = geoPath(projection)(shape) ?? ''

  function getViewBoxPoint(clientX: number, clientY: number): MapPoint | null {
    const svg = svgRef.current

    if (!svg) {
      return null
    }

    const rect = svg.getBoundingClientRect()

    if (rect.width === 0 || rect.height === 0) {
      return null
    }

    return {
      x: ((clientX - rect.left) / rect.width) * VIEWBOX_WIDTH,
      y: ((clientY - rect.top) / rect.height) * VIEWBOX_HEIGHT,
    }
  }

  function unprojectPoint(point: MapPoint): Coordinates | null {
    if (!projection.invert) {
      return null
    }

    const projectedPoint: [number, number] = [
      (point.x - DEFAULT_VIEW.panX) / DEFAULT_VIEW.zoom,
      (point.y - DEFAULT_VIEW.panY) / DEFAULT_VIEW.zoom,
    ]
    const coordinates = projection.invert(projectedPoint)

    if (!coordinates) {
      return null
    }

    return [coordinates[0], coordinates[1]]
  }

  function projectCoordinates(coordinates: Coordinates | null): [number, number] | null {
    if (!coordinates) {
      return null
    }

    const point = projection(coordinates)

    return point ? [point[0], point[1]] : null
  }

  function handleMapClick(event: MouseEvent<SVGSVGElement>) {
    if (locked) {
      return
    }

    const point = getViewBoxPoint(event.clientX, event.clientY)

    if (!point) {
      return
    }

    const coordinates = unprojectPoint(point)

    if (!coordinates) {
      return
    }

    onGuess(coordinates)
  }

  const guessPoint = projectCoordinates(guess)
  const answerPoint = projectCoordinates(answer)

  return (
    <div className="map-stage">
      <svg
        ref={svgRef}
        className="norway-map"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        role="img"
        aria-label="Interactive Norway map for bunad guessing"
        onClick={handleMapClick}
      >
        <defs>
          <linearGradient id={surfaceGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f7fbff" />
            <stop offset="100%" stopColor="#dce9f7" />
          </linearGradient>
          <linearGradient id={landGradientId} x1="15%" y1="0%" x2="85%" y2="100%">
            <stop offset="0%" stopColor="#fffdf8" />
            <stop offset="100%" stopColor="#efe1ce" />
          </linearGradient>
        </defs>

        <rect
          x="0"
          y="0"
          width={VIEWBOX_WIDTH}
          height={VIEWBOX_HEIGHT}
          rx="30"
          fill={`url(#${surfaceGradientId})`}
        />

        <g transform={`translate(${DEFAULT_VIEW.panX} ${DEFAULT_VIEW.panY})`}>
          <g transform={`scale(${DEFAULT_VIEW.zoom})`}>
            <path className="norway-map__land" d={outlinePath} fill={`url(#${landGradientId})`} />

            {guessPoint && answerPoint ? (
              <line
                className="norway-map__line"
                x1={guessPoint[0]}
                y1={guessPoint[1]}
                x2={answerPoint[0]}
                y2={answerPoint[1]}
              />
            ) : null}

            {guessPoint ? (
              <g className="map-marker map-marker--guess" transform={`translate(${guessPoint[0]} ${guessPoint[1]})`}>
                <circle className="map-marker__pulse" r="3.2" />
                <circle className="map-marker__ring" r="2" />
                <circle className="map-marker__core" r="1" />
              </g>
            ) : null}

            {answerPoint ? (
              <g
                className="map-marker map-marker--answer"
                transform={`translate(${answerPoint[0]} ${answerPoint[1]})`}
              >
                <circle className="map-marker__pulse" r="3.8" />
                <circle className="map-marker__ring" r="2.2" />
                <circle className="map-marker__core" r="1.1" />
              </g>
            ) : null}
          </g>
        </g>
      </svg>
    </div>
  )
}
