import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson'

export type Coordinates = [number, number]

export type NorwayGeoJson = FeatureCollection<Geometry, GeoJsonProperties>

export type BunadEntry = {
  coordinates: Coordinates
  id: string
  image: string
  label: string
  place: string
}

export type RoundResult = {
  answer: Coordinates
  distanceKm: number
  guess: Coordinates
  id: string
  image: string
  label: string
  place: string
  score: number
}
