import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import {
  assignTokenAlignmentData,
  defaultTokenAlignmentData,
  realignTokensAfterMove,
  tokenAlignmentData,
} from '../../src/game/tokens/alignment';
import playersReducer, {
  getToken,
  initialState as playersInitialState,
  updateTokenCoordinatesAndDirection,
} from '../../src/state/slices/playersSlice';
import type { TCoordinate, TPlayer, TToken } from '../../src/types';
import { DUMMY_PLAYERS } from '../fixtures/players.dummy';
import { DUMMY_TOKEN } from '../fixtures/token.dummy';

function tokensOnTile(count: number, coord: TCoordinate = { x: 6, y: 11 }): TToken[] {
  return Array.from({ length: count }, (_, i) => ({
    ...DUMMY_TOKEN,
    id: i,
    coordinates: { ...coord },
  }));
}

function buildStore(players: TPlayer[]) {
  return configureStore({
    reducer: playersReducer,
    preloadedState: { ...playersInitialState, players },
  });
}

describe('Test tokens/alignment reusable spreading', () => {
  describe('assignTokenAlignmentData', () => {
    it.each([1, 3, 16])(
      'assigns entries from the alignment table for %i token(s) on one tile',
      (count) => {
        const tokens = tokensOnTile(count);
        const assignments = assignTokenAlignmentData(tokens);

        expect(assignments).toHaveLength(count);
        assignments.forEach(({ colour, id, alignmentData }, i) => {
          expect(colour).toBe(tokens[i].colour);
          expect(id).toBe(tokens[i].id);
          expect(alignmentData).toEqual(tokenAlignmentData[count][i]);
        });
      }
    );

    it.each([1, 3, 16])('never assigns duplicate offsets within one tile (%i tokens)', (count) => {
      const assignments = assignTokenAlignmentData(tokensOnTile(count));
      const uniqueOffsets = new Set(
        assignments.map(({ alignmentData: a }) => `${a.xOffset},${a.yOffset},${a.scaleFactor}`)
      );
      expect(uniqueOffsets.size).toBe(count);
    });

    it('centres a single token on the tile', () => {
      const [assignment] = assignTokenAlignmentData(tokensOnTile(1));
      expect(assignment.alignmentData).toEqual(defaultTokenAlignmentData);
    });

    it.each([0, 17])('throws a readable error for %i tokens on one tile', (count) => {
      expect(() => assignTokenAlignmentData(tokensOnTile(count))).toThrow(
        /between 1 and 16 tokens/
      );
      expect(() => assignTokenAlignmentData(tokensOnTile(count))).toThrow(String(count));
    });

    it('throws a readable error when the tokens are not on the same tile', () => {
      const tokens = tokensOnTile(3);
      tokens[2].coordinates = { x: 8, y: 13 };
      expect(() => assignTokenAlignmentData(tokens)).toThrow(/same tile/);
    });
  });

  describe('realignTokensAfterMove', () => {
    const originTile: TCoordinate = { x: 6, y: 11 };
    const destinationTile: TCoordinate = { x: 8, y: 13 };

    function buildPlayersWithTwoTiles(): TPlayer[] {
      const players = structuredClone(DUMMY_PLAYERS);
      const blue = players.find((p) => p.colour === 'blue')!;
      const red = players.find((p) => p.colour === 'red')!;
      // Two blue tokens share the origin tile...
      blue.tokens[0].coordinates = { ...originTile };
      blue.tokens[0].isLocked = false;
      blue.tokens[1].coordinates = { ...originTile };
      blue.tokens[1].isLocked = false;
      // ...and two red tokens already occupy the destination tile.
      red.tokens[0].coordinates = { ...destinationTile };
      red.tokens[0].isLocked = false;
      red.tokens[1].coordinates = { ...destinationTile };
      red.tokens[1].isLocked = false;
      return players;
    }

    it('re-aligns both the entered and the left tile after a token moves onto an occupied tile', () => {
      const store = buildStore(buildPlayersWithTwoTiles());

      // Simulate the move: blue token 0 lands on the destination tile.
      store.dispatch(
        updateTokenCoordinatesAndDirection({
          colour: 'blue',
          id: 0,
          newCoords: destinationTile,
          direction: 'forward',
        })
      );

      const movedBefore = { ...getToken(store.getState(), 'blue', 0) };
      realignTokensAfterMove(
        store.getState().players,
        getToken(store.getState(), 'blue', 0),
        originTile,
        store.dispatch
      );

      // Destination tile now holds 3 tokens, spread with the 3-token table entries.
      const expectedDestination = tokenAlignmentData[3];
      expect(getToken(store.getState(), 'blue', 0).tokenAlignmentData).toEqual(
        expectedDestination[0]
      );
      expect(getToken(store.getState(), 'red', 0).tokenAlignmentData).toEqual(
        expectedDestination[1]
      );
      expect(getToken(store.getState(), 'red', 1).tokenAlignmentData).toEqual(
        expectedDestination[2]
      );
      const destinationOffsets = [0, 1, 2].map(
        (i) =>
          `${expectedDestination[i].xOffset},${expectedDestination[i].yOffset},${expectedDestination[i].scaleFactor}`
      );
      expect(new Set(destinationOffsets).size).toBe(3);

      // Origin tile is back to a single centred token.
      expect(getToken(store.getState(), 'blue', 1).tokenAlignmentData).toEqual(
        defaultTokenAlignmentData
      );

      // The moved token's coordinates, locked and reached-home fields are untouched.
      const movedAfter = getToken(store.getState(), 'blue', 0);
      expect(movedAfter.coordinates).toEqual(movedBefore.coordinates);
      expect(movedAfter.coordinates).toEqual(destinationTile);
      expect(movedAfter.isLocked).toBe(movedBefore.isLocked);
      expect(movedAfter.hasTokenReachedHome).toBe(movedBefore.hasTokenReachedHome);
    });

    it('does not throw when the tile the token left is now empty', () => {
      const players = structuredClone(DUMMY_PLAYERS);
      const blue = players.find((p) => p.colour === 'blue')!;
      const red = players.find((p) => p.colour === 'red')!;
      blue.tokens[0].coordinates = { ...originTile };
      blue.tokens[0].isLocked = false;
      red.tokens[0].coordinates = { ...destinationTile };
      red.tokens[0].isLocked = false;
      const store = buildStore(players);

      store.dispatch(
        updateTokenCoordinatesAndDirection({
          colour: 'blue',
          id: 0,
          newCoords: destinationTile,
          direction: 'forward',
        })
      );

      expect(() =>
        realignTokensAfterMove(
          store.getState().players,
          getToken(store.getState(), 'blue', 0),
          originTile,
          store.dispatch
        )
      ).not.toThrow();

      const expectedDestination = tokenAlignmentData[2];
      expect(getToken(store.getState(), 'blue', 0).tokenAlignmentData).toEqual(
        expectedDestination[0]
      );
      expect(getToken(store.getState(), 'red', 0).tokenAlignmentData).toEqual(
        expectedDestination[1]
      );
    });
  });
});
