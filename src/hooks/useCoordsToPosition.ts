import { useStore } from 'react-redux';
import type { TCoordinate } from '../types';
import type { TTokenAlignmentData } from '../types';
import type { RootState } from '../state/store';
import { useCallback } from 'react';
import { coordsToPosition } from '../game/coords/logic';

export const useCoordsToPosition = (): ((
  coords: TCoordinate,
  tokenAlignmentData: TTokenAlignmentData
) => { x: number; y: number }) => {
  const store = useStore<RootState>();
  return useCallback(
    (coords: TCoordinate, tokenAlignmentData: TTokenAlignmentData) =>
      coordsToPosition(coords, tokenAlignmentData, store.getState().board),
    [store]
  );
};
