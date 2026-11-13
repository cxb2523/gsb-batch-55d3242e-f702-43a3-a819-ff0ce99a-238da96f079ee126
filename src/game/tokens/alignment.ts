import type { Dispatch, UnknownAction } from '@reduxjs/toolkit';
import type { TCoordinate, TPlayer, TPlayerColour, TToken, TTokenAlignmentData } from '../../types';
import { setTokenAlignmentData } from '../../state/slices/playersSlice';
import { areCoordsEqual } from '../coords/logic';
import { tokensWithCoord } from './logic';
import { ERRORS } from '../../utils/errors';

export const defaultTokenAlignmentData = { xOffset: 0, yOffset: 0, scaleFactor: 1 };

export const tokenAlignmentData: Record<number, TTokenAlignmentData[]> = {
  1: [defaultTokenAlignmentData],
  2: [
    {
      xOffset: -0.25,
      yOffset: 0,
      scaleFactor: 0.8,
    },
    {
      xOffset: 0.25,
      yOffset: 0,
      scaleFactor: 0.8,
    },
  ],
  3: [
    {
      xOffset: -0.32,
      yOffset: 0,
      scaleFactor: 0.6,
    },
    {
      xOffset: 0,
      yOffset: 0,
      scaleFactor: 0.6,
    },
    {
      xOffset: 0.32,
      yOffset: 0,
      scaleFactor: 0.6,
    },
  ],
  4: [
    {
      xOffset: -0.18,
      yOffset: 0.2,
      scaleFactor: 0.55,
    },
    {
      xOffset: 0.18,
      yOffset: 0.2,
      scaleFactor: 0.55,
    },
    {
      xOffset: -0.18,
      yOffset: -0.2,
      scaleFactor: 0.55,
    },
    {
      xOffset: 0.18,
      yOffset: -0.2,
      scaleFactor: 0.55,
    },
  ],
  5: [
    {
      xOffset: 0.28,
      yOffset: 0.2,
      scaleFactor: 0.5,
    },
    {
      xOffset: -0.15,
      yOffset: -0.2,
      scaleFactor: 0.5,
    },
    {
      xOffset: 0.15,
      yOffset: -0.2,
      scaleFactor: 0.5,
    },
    {
      xOffset: -0.28,
      yOffset: 0.2,
      scaleFactor: 0.5,
    },
    {
      xOffset: 0,
      yOffset: 0.2,
      scaleFactor: 0.5,
    },
  ],
  6: [
    {
      xOffset: -0.28,
      yOffset: 0.2,
      scaleFactor: 0.5,
    },
    {
      xOffset: 0,
      yOffset: 0.2,
      scaleFactor: 0.5,
    },
    {
      xOffset: 0.28,
      yOffset: 0.2,
      scaleFactor: 0.5,
    },
    {
      xOffset: -0.28,
      yOffset: -0.2,
      scaleFactor: 0.5,
    },
    {
      xOffset: 0,
      yOffset: -0.2,
      scaleFactor: 0.5,
    },
    {
      xOffset: 0.28,
      yOffset: -0.2,
      scaleFactor: 0.5,
    },
  ],
  7: [
    {
      xOffset: -0.35,
      yOffset: 0.2,
      scaleFactor: 0.4,
    },
    {
      xOffset: -0.1125,
      yOffset: 0.2,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.1125,
      yOffset: 0.2,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.35,
      yOffset: 0.2,
      scaleFactor: 0.4,
    },
    {
      xOffset: -0.25,
      yOffset: -0.2,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0,
      yOffset: -0.2,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.25,
      yOffset: -0.2,
      scaleFactor: 0.4,
    },
  ],
  8: [
    {
      xOffset: -0.35,
      yOffset: 0.2,
      scaleFactor: 0.4,
    },
    {
      xOffset: -0.1125,
      yOffset: 0.2,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.1125,
      yOffset: 0.2,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.35,
      yOffset: 0.2,
      scaleFactor: 0.4,
    },
    {
      xOffset: -0.35,
      yOffset: -0.2,
      scaleFactor: 0.4,
    },
    {
      xOffset: -0.1125,
      yOffset: -0.2,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.1125,
      yOffset: -0.2,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.35,
      yOffset: -0.2,
      scaleFactor: 0.4,
    },
  ],
  9: [
    {
      xOffset: -0.35,
      yOffset: 0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: -0.1125,
      yOffset: 0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.1125,
      yOffset: 0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.35,
      yOffset: 0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: -0.35,
      yOffset: 0,
      scaleFactor: 0.4,
    },
    {
      xOffset: -0.1125,
      yOffset: 0,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.1125,
      yOffset: 0,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.35,
      yOffset: 0,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0,
      yOffset: -0.25,
      scaleFactor: 0.4,
    },
  ],
  10: [
    {
      xOffset: -0.35,
      yOffset: 0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: -0.1125,
      yOffset: 0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.1125,
      yOffset: 0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.35,
      yOffset: 0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: -0.35,
      yOffset: 0,
      scaleFactor: 0.4,
    },
    {
      xOffset: -0.1125,
      yOffset: 0,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.1125,
      yOffset: 0,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.35,
      yOffset: 0,
      scaleFactor: 0.4,
    },
    {
      xOffset: -0.23,
      yOffset: -0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.23,
      yOffset: -0.25,
      scaleFactor: 0.4,
    },
  ],
  11: [
    {
      xOffset: -0.35,
      yOffset: 0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: -0.1125,
      yOffset: 0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.1125,
      yOffset: 0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.35,
      yOffset: 0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: -0.35,
      yOffset: 0,
      scaleFactor: 0.4,
    },
    {
      xOffset: -0.1125,
      yOffset: 0,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.1125,
      yOffset: 0,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.35,
      yOffset: 0,
      scaleFactor: 0.4,
    },
    {
      xOffset: -0.23,
      yOffset: -0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0,
      yOffset: -0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.23,
      yOffset: -0.25,
      scaleFactor: 0.4,
    },
  ],
  12: [
    {
      xOffset: -0.35,
      yOffset: 0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: -0.1125,
      yOffset: 0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.1125,
      yOffset: 0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.35,
      yOffset: 0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: -0.35,
      yOffset: 0,
      scaleFactor: 0.4,
    },
    {
      xOffset: -0.1125,
      yOffset: 0,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.1125,
      yOffset: 0,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.35,
      yOffset: 0,
      scaleFactor: 0.4,
    },
    {
      xOffset: -0.35,
      yOffset: -0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: -0.1125,
      yOffset: -0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.1125,
      yOffset: -0.25,
      scaleFactor: 0.4,
    },
    {
      xOffset: 0.35,
      yOffset: -0.25,
      scaleFactor: 0.4,
    },
  ],
  13: [
    {
      xOffset: -0.35,
      yOffset: 0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.1125,
      yOffset: 0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.1125,
      yOffset: 0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.35,
      yOffset: 0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.35,
      yOffset: 0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.1125,
      yOffset: 0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.1125,
      yOffset: 0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.35,
      yOffset: 0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.35,
      yOffset: -0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.1125,
      yOffset: -0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.1125,
      yOffset: -0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.35,
      yOffset: -0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0,
      yOffset: -0.3,
      scaleFactor: 0.35,
    },
  ],
  14: [
    {
      xOffset: -0.35,
      yOffset: 0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.1125,
      yOffset: 0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.1125,
      yOffset: 0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.35,
      yOffset: 0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.35,
      yOffset: 0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.1125,
      yOffset: 0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.1125,
      yOffset: 0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.35,
      yOffset: 0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.35,
      yOffset: -0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.1125,
      yOffset: -0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.1125,
      yOffset: -0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.35,
      yOffset: -0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.23,
      yOffset: -0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.23,
      yOffset: -0.3,
      scaleFactor: 0.35,
    },
  ],
  15: [
    {
      xOffset: -0.35,
      yOffset: 0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.1125,
      yOffset: 0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.1125,
      yOffset: 0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.35,
      yOffset: 0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.35,
      yOffset: 0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.1125,
      yOffset: 0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.1125,
      yOffset: 0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.35,
      yOffset: 0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.35,
      yOffset: -0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.1125,
      yOffset: -0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.1125,
      yOffset: -0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.35,
      yOffset: -0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.23,
      yOffset: -0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0,
      yOffset: -0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.23,
      yOffset: -0.3,
      scaleFactor: 0.35,
    },
  ],
  16: [
    {
      xOffset: -0.35,
      yOffset: 0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.1125,
      yOffset: 0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.1125,
      yOffset: 0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.35,
      yOffset: 0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.35,
      yOffset: 0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.1125,
      yOffset: 0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.1125,
      yOffset: 0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.35,
      yOffset: 0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.35,
      yOffset: -0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.1125,
      yOffset: -0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.1125,
      yOffset: -0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.35,
      yOffset: -0.1,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.35,
      yOffset: -0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: -0.1125,
      yOffset: -0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.1125,
      yOffset: -0.3,
      scaleFactor: 0.35,
    },
    {
      xOffset: 0.35,
      yOffset: -0.3,
      scaleFactor: 0.35,
    },
  ],
};

export function getTokenAlignmentData(numberOfTokensInOneTile: number): TTokenAlignmentData[] {
  if (numberOfTokensInOneTile > 16 || numberOfTokensInOneTile <= 0)
    throw new Error(ERRORS.invalidTokenCountForAlignment(numberOfTokensInOneTile));
  return tokenAlignmentData[numberOfTokensInOneTile];
}

export type TTokenAlignmentAssignment = {
  colour: TPlayerColour;
  id: number;
  alignmentData: TTokenAlignmentData;
};

/**
 * Pure, render-layer reusable spreading of tokens sharing one tile: looks up the
 * alignment table by token count and assigns each token a distinct offset/scale
 * entry. Throws a readable error for 0 or more than 16 tokens instead of
 * silently degrading, and when the tokens are not all on the same tile.
 */
export function assignTokenAlignmentData(tokens: TToken[]): TTokenAlignmentAssignment[] {
  if (
    tokens.length !== 0 &&
    !tokens.every((t) => areCoordsEqual(t.coordinates, tokens[0].coordinates))
  )
    throw new Error(ERRORS.tokensNotOnSameTile());

  const alignmentData = getTokenAlignmentData(tokens.length);

  return tokens.map((token, i) => ({
    colour: token.colour,
    id: token.id,
    alignmentData: alignmentData[i],
  }));
}

export function applyAlignmentData(tokens: TToken[], dispatch: Dispatch<UnknownAction>) {
  for (const { colour, id, alignmentData } of assignTokenAlignmentData(tokens)) {
    dispatch(setTokenAlignmentData({ colour, id, newAlignmentData: alignmentData }));
  }
}

/**
 * Re-aligns every token on the tile the moved token entered and on the tile it
 * left, so overlapping tokens spread out again once a move animation ends.
 * Only alignment data is written; the moved token's coordinates, locked and
 * reached-home fields are never touched.
 */
export function realignTokensAfterMove(
  players: TPlayer[],
  movedToken: TToken,
  originCoords: TCoordinate,
  dispatch: Dispatch<UnknownAction>
) {
  const destinationCoords = movedToken.coordinates;
  const coordsToRealign = areCoordsEqual(originCoords, destinationCoords)
    ? [destinationCoords]
    : [destinationCoords, originCoords];

  for (const coord of coordsToRealign) {
    const tokensOnTile = tokensWithCoord(coord, players);
    if (tokensOnTile.length === 0) continue;
    applyAlignmentData(tokensOnTile, dispatch);
  }
}
