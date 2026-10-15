/**
 * Small teaching datasets as raw text rows run through the same conversion as user data
 * (rowsToDataset), so they follow the same coding rules as imported CSVs.
 */
import { rowsToDataset, type ClassDataset } from './dataset'

const speed = rowsToDataset(
  ['Grade', 'Bumpiness', 'Speed_Limit', 'Speed'],
  [
    ['steep', 'bumpiness', 'yes', 'slow'],
    ['steep', 'smooth', 'yes', 'slow'],
    ['flat', 'bumpiness', 'no', 'fast'],
    ['steep', 'smooth', 'no', 'fast'],
  ],
  'Speed',
)

const eight = rowsToDataset(
  ['a1', 'a2', 'class'],
  [
    ['1', '2', '0'],
    ['1', '3', '0'],
    ['2', '1', '0'],
    ['2', '2', '0'],
    ['3', '2', '0'],
    ['3', '3', '1'],
    ['4', '4', '1'],
    ['4', '4', '1'],
  ],
  'class',
)

const weather = rowsToDataset(
  ['outlook', 'temperature', 'humidity', 'wind', 'play'],
  [
    ['sunny', 'hot', 'high', 'weak', 'no'],
    ['sunny', 'hot', 'high', 'strong', 'no'],
    ['overcast', 'hot', 'high', 'weak', 'yes'],
    ['rain', 'mild', 'high', 'weak', 'yes'],
    ['rain', 'cool', 'normal', 'weak', 'yes'],
    ['rain', 'cool', 'normal', 'strong', 'no'],
    ['overcast', 'cool', 'normal', 'strong', 'yes'],
    ['sunny', 'mild', 'high', 'weak', 'no'],
    ['sunny', 'cool', 'normal', 'weak', 'yes'],
    ['rain', 'mild', 'normal', 'weak', 'yes'],
    ['sunny', 'mild', 'normal', 'strong', 'yes'],
    ['overcast', 'mild', 'high', 'strong', 'yes'],
    ['overcast', 'hot', 'normal', 'weak', 'yes'],
    ['rain', 'mild', 'high', 'strong', 'no'],
  ],
  'play',
)

export const PRESETS: Record<'speed' | 'eight' | 'weather', ClassDataset> = { speed, eight, weather }
