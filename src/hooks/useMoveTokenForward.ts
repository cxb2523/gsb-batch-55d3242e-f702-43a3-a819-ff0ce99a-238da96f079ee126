import { useDispatch, useStore } from 'react-redux';
import { type TToken } from '../types';
import { ERRORS } from '../utils/errors';
import type { AppDispatch, RootState } from '../state/store';
import { useCallback } from 'react';
import type { TSequenceCalculationResult } from '../types/tokens';
import { useUpdateTokenPositionAndAlignment } from './useUpdateTokenPositionAndAlignment';
import { deactivateAllTokens, getToken, setIsAnyTokenMoving } from '../state/slices/playersSlice';
import { tokenMotionRegistry } from '../game/movement/tokenMotionRegistry';
import { getGloballyUniqueTokenId } from '../game/tokens/logic';
import { realignTokensAfterMove } from '../game/tokens/alignment';
import { useCoordsToPosition } from './useCoordsToPosition';
import { transitionStates } from '../game/tokens/constants';

export const useMoveTokenForward = () => {
  const dispatch = useDispatch<AppDispatch>();
  const updateTokenPositionAndAlignment = useUpdateTokenPositionAndAlignment();
  const store = useStore<RootState>();
  const getPosition = useCoordsToPosition();

  return useCallback(
    async (
      moveSequence: TSequenceCalculationResult['moveSequence'],
      token: TToken
    ): Promise<void> => {
      const { colour, id, isLocked } = token;
      if (isLocked) throw new Error(ERRORS.lockedToken(colour, id));
      const { durationMs, timingFn } = transitionStates.forward;
      dispatch(deactivateAllTokens(colour));
      dispatch(setIsAnyTokenMoving(true));
      const entry = tokenMotionRegistry.get(getGloballyUniqueTokenId(colour, id));
      if (!entry) return;
      const originCoords = { ...token.coordinates };
      entry.setExternallyAnimating(true);
      for (const coord of moveSequence) {
        updateTokenPositionAndAlignment({ colour, id, newCoords: coord, direction: 'forward' });
        const updatedToken = getToken(store.getState().players, colour, id);
        const { x, y } = getPosition(coord, updatedToken.tokenAlignmentData);
        await entry.animateTo(x, y, { duration: durationMs / 1000, ease: timingFn });
      }
      entry.setExternallyAnimating(false);
      if (moveSequence.length !== 0) {
        const playersState = store.getState().players;
        realignTokensAfterMove(
          playersState.players,
          getToken(playersState, colour, id),
          originCoords,
          dispatch
        );
      }
      dispatch(setIsAnyTokenMoving(false));
    },
    [dispatch, store, updateTokenPositionAndAlignment, getPosition]
  );
};
