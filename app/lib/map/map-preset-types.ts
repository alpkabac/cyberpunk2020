import type { SessionSettings } from '../types';
import type { SessionMapState } from './map-state';

/** Stored in `map_presets.payload` — full reload of tactical map configuration. */
export interface MapPresetPayload {
  map_background_url: string;
  settings: Pick<
    SessionSettings,
    'mapGridCols' | 'mapGridRows' | 'mapShowGrid' | 'mapSnapToGrid' | 'mapMetersPerSquare'
  >;
  map_state: SessionMapState;
}

export interface MapPresetRow {
  id: string;
  session_id: string;
  name: string;
  payload: MapPresetPayload;
  created_at: string;
}
