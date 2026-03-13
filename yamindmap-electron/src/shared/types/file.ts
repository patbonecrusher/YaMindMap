import type { Document } from './document'

export const FORMAT_VERSION = 1

export interface ViewState {
  translation: [number, number]
  scale: number
  window_size: [number, number]
  window_position?: [number, number]
}

export interface YaMindFile {
  version: number
  document: Document
  view_state?: ViewState
}
