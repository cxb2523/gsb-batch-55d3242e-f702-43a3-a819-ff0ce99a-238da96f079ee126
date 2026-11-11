import {
  IconArrowLeft,
  IconHandFinger,
  IconSettings,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useState } from 'react';
import type { GameCopy } from '@/components/game/game-copy';
import {
  BOARD_SIZE,
  canPlaceGamePiece,
  type GameBlockColor,
  type GamePiece,
  type GamePlacementPreview,
  type GameRound,
  getGamePieceBounds,
  isGamePiecePreviewCell,
} from '@/components/game/game-engine';
import type { GameMode } from '@/components/game/game-storage';

export const CLEAR_EFFECT_DURATION = 860;

export interface GameClearEffect {
  anchorColumn: number;
  anchorRow: number;
  cells: Record<string, GameBlockColor>;
  comboLevel: number;
  earned: number;
  id: number;
  lineCount: number;
}

interface DragState {
  clientX: number;
  clientY: number;
  grabColumn: number;
  grabClientX: number;
  grabClientY: number;
  grabRow: number;
  pieceIndex: number;
}

interface GameBoardViewProps {
  clearEffect: GameClearEffect | null;
  copy: GameCopy;
  gameOver: boolean;
  hintsEnabled: boolean;
  mode: GameMode;
  onPersist: () => void;
  onPlace: (pieceIndex: number, row: number, column: number) => boolean;
  onRequestExit: () => void;
  round: GameRound;
}

const CLEAR_PARTICLES = [
  [-92, -58],
  [-68, -92],
  [-34, -105],
  [4, -96],
  [45, -108],
  [78, -77],
  [103, -38],
  [110, 8],
  [94, 52],
  [62, 86],
  [22, 103],
  [-18, 98],
  [-57, 82],
  [-89, 52],
  [-108, 12],
  [-107, -25],
] as const;

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function GameBoardView({
  clearEffect,
  copy,
  gameOver,
  hintsEnabled,
  mode,
  onPersist,
  onPlace,
  onRequestExit,
  round,
}: GameBoardViewProps) {
  const [selectedPiece, setSelectedPiece] = useState<number | null>(null);
  const [preview, setPreview] = useState<GamePlacementPreview | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const { board, pieces, score } = round;
  const selected =
    selectedPiece === null ? null : (pieces[selectedPiece] ?? null);

  const clearInteraction = () => {
    setSelectedPiece(null);
    setPreview(null);
    setDrag(null);
  };

  const getPointerPlacement = useCallback(
    (
      event: ReactPointerEvent<HTMLButtonElement>,
      piece: GamePiece,
      dragState: DragState
    ) => {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const cell = element?.closest<HTMLElement>('[data-board-cell]');
      if (!cell) return null;

      const row = Number(cell.dataset.row) - dragState.grabRow;
      const column = Number(cell.dataset.column) - dragState.grabColumn;
      return {
        column,
        isValid: canPlaceGamePiece(board, piece, row, column),
        row,
      };
    },
    [board]
  );

  const handlePiecePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    pieceIndex: number
  ) => {
    const piece = pieces[pieceIndex];
    if (!piece || gameOver) return;

    const shapeCell = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-shape-cell]'
    );
    setSelectedPiece(pieceIndex);
    setDrag({
      clientX: event.clientX,
      clientY: event.clientY,
      grabColumn: Number(shapeCell?.dataset.shapeColumn ?? 0),
      grabClientX: event.clientX,
      grabClientY: event.clientY,
      grabRow: Number(shapeCell?.dataset.shapeRow ?? 0),
      pieceIndex,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePiecePointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
    pieceIndex: number
  ) => {
    const piece = pieces[pieceIndex];
    if (!piece || !drag || drag.pieceIndex !== pieceIndex) return;
    setDrag((current) =>
      current
        ? { ...current, clientX: event.clientX, clientY: event.clientY }
        : null
    );
    const placement = getPointerPlacement(event, piece, drag);
    setPreview(hintsEnabled ? placement : null);
  };

  const handlePiecePointerUp = (
    event: ReactPointerEvent<HTMLButtonElement>,
    pieceIndex: number
  ) => {
    const piece = pieces[pieceIndex];
    if (!piece || !drag || drag.pieceIndex !== pieceIndex) return;
    const placement = getPointerPlacement(event, piece, drag);
    if (
      placement?.isValid &&
      onPlace(pieceIndex, placement.row, placement.column)
    ) {
      clearInteraction();
      return;
    }
    setDrag(null);
    setPreview(null);
  };

  const handleBoardCellClick = (row: number, column: number) => {
    if (selectedPiece === null) return;
    if (onPlace(selectedPiece, row, column)) clearInteraction();
  };

  return (
    <section
      className={joinClasses(
        'game-stage',
        clearEffect !== null && 'has-clear-effect',
        ((clearEffect?.lineCount ?? 0) >= 2 ||
          (clearEffect?.comboLevel ?? 0) >= 2) &&
          'has-power-clear'
      )}
      aria-label="Super Blocks web game"
    >
      <h1 className="game-visually-hidden">Super Blocks</h1>

      <header className="game-header game-inner-header">
        <button
          type="button"
          className="game-round-link game-back-button"
          aria-label={copy.backToModes}
          onClick={onRequestExit}
        >
          <IconArrowLeft aria-hidden="true" />
        </button>

        <h1>{mode === 'classic' ? copy.classic : copy.daily}</h1>

        <Link
          className="game-round-link game-settings-button"
          aria-label={copy.settings}
          onClick={onPersist}
          to="/settings"
        >
          <IconSettings aria-hidden="true" />
        </Link>
      </header>

      <div className="board-meta">
        <output
          className={joinClasses(
            'board-stat board-score',
            clearEffect !== null && 'is-score-celebrating',
            (clearEffect?.comboLevel ?? 0) >= 2 && 'is-combo-score'
          )}
          aria-label={`${copy.score} ${score}`}
        >
          <span>
            <strong data-testid="game-score">{score}</strong>
          </span>
        </output>
      </div>

      <div
        className={joinClasses(
          'game-board-wrap',
          clearEffect !== null && 'is-clearing-lines',
          ((clearEffect?.lineCount ?? 0) >= 2 ||
            (clearEffect?.comboLevel ?? 0) >= 2) &&
            'is-power-clear'
        )}
      >
        <fieldset className="game-board" data-testid="game-board">
          <legend className="game-visually-hidden">{copy.rules}</legend>
          {board.map((boardRow, rowIndex) =>
            boardRow.map((cell, columnIndex) => {
              const cellKey = `${rowIndex}-${columnIndex}`;
              const clearingColor = clearEffect?.cells[cellKey] ?? null;
              const displayedCell = cell ?? clearingColor;
              const previewed = isGamePiecePreviewCell(
                preview,
                selected,
                rowIndex,
                columnIndex
              );
              return (
                <button
                  type="button"
                  key={`${rowIndex}-${columnIndex}`}
                  className={joinClasses(
                    'board-cell',
                    displayedCell !== null && 'is-occupied',
                    clearingColor !== null && 'is-clearing',
                    previewed && preview?.isValid && 'is-preview-valid',
                    previewed && !preview?.isValid && 'is-preview-invalid'
                  )}
                  style={
                    clearingColor
                      ? ({
                          '--clear-delay': `${Math.round(
                            Math.hypot(
                              rowIndex - (clearEffect?.anchorRow ?? 0),
                              columnIndex - (clearEffect?.anchorColumn ?? 0)
                            ) * 18
                          )}ms`,
                        } as CSSProperties)
                      : undefined
                  }
                  data-board-cell
                  data-row={rowIndex}
                  data-column={columnIndex}
                  data-testid={`board-cell-${rowIndex}-${columnIndex}`}
                  aria-label={copy.selectSquare(
                    rowIndex + 1,
                    columnIndex + 1,
                    displayedCell
                      ? `${displayedCell} ${copy.block}`
                      : copy.empty
                  )}
                  disabled={clearEffect !== null}
                  onPointerEnter={() => {
                    if (!hintsEnabled || selectedPiece === null || !selected) {
                      return;
                    }
                    setPreview({
                      column: columnIndex,
                      isValid: canPlaceGamePiece(
                        board,
                        selected,
                        rowIndex,
                        columnIndex
                      ),
                      row: rowIndex,
                    });
                  }}
                  onClick={() => handleBoardCellClick(rowIndex, columnIndex)}
                >
                  {displayedCell && (
                    <span
                      className={`game-block game-block-${displayedCell}`}
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })
          )}
        </fieldset>
        {clearEffect && (
          <div
            className="clear-effect"
            data-testid="clear-effect"
            data-line-count={clearEffect.lineCount}
            key={clearEffect.id}
            style={
              {
                '--effect-x': `${
                  ((clearEffect.anchorColumn + 0.5) / BOARD_SIZE) * 100
                }%`,
                '--effect-y': `${
                  ((clearEffect.anchorRow + 0.5) / BOARD_SIZE) * 100
                }%`,
              } as CSSProperties
            }
            aria-hidden="true"
          >
            <span className="clear-ripple clear-ripple-one" />
            <span className="clear-ripple clear-ripple-two" />
            <strong className="clear-celebration-label">
              {clearEffect.comboLevel >= 2
                ? copy.comboStatus(clearEffect.comboLevel)
                : copy.clearCelebration(clearEffect.lineCount)}
            </strong>
            <span className="clear-particles">
              {CLEAR_PARTICLES.map(([x, y], index) => (
                <span
                  className="clear-particle"
                  key={`${x}-${y}`}
                  style={
                    {
                      '--particle-delay': `${index * 13}ms`,
                      '--particle-x': `${x}px`,
                      '--particle-y': `${y}px`,
                    } as CSSProperties
                  }
                />
              ))}
            </span>
          </div>
        )}
        {clearEffect && (
          <span
            className="score-flight"
            data-testid="score-flight"
            key={`score-${clearEffect.id}`}
            style={
              {
                '--flight-x': `${
                  ((clearEffect.anchorColumn + 0.5) / BOARD_SIZE) * 100
                }%`,
                '--flight-y': `${
                  ((clearEffect.anchorRow + 0.5) / BOARD_SIZE) * 100
                }%`,
              } as CSSProperties
            }
            aria-hidden="true"
          >
            +{clearEffect.earned}
          </span>
        )}
      </div>

      <div className="game-help">
        <IconHandFinger aria-hidden="true" />
        <span>{copy.dragHint}</span>
      </div>

      <fieldset className="piece-tray">
        <legend className="game-visually-hidden">{copy.rules}</legend>
        {pieces.map((piece, pieceIndex) => {
          if (!piece) {
            return (
              <div
                className="piece-slot is-used"
                key={`used-${pieceIndex}`}
                aria-hidden="true"
              />
            );
          }

          const bounds = getGamePieceBounds(piece);
          const isDragging = drag?.pieceIndex === pieceIndex;
          const style = {
            '--shape-columns': bounds.columns,
            '--shape-rows': bounds.rows,
          } as CSSProperties;
          const draggedShapeStyle = isDragging
            ? ({
                transform: `translate(${drag.clientX - drag.grabClientX}px, ${drag.clientY - drag.grabClientY}px) scale(1.08)`,
                transition: 'none',
              } as CSSProperties)
            : undefined;

          return (
            <button
              type="button"
              className={joinClasses(
                'piece-slot',
                selectedPiece === pieceIndex && 'is-selected',
                isDragging && 'is-dragging'
              )}
              data-testid={`game-piece-${pieceIndex}`}
              key={piece.id}
              aria-label={`${copy.start}: ${piece.key}`}
              disabled={clearEffect !== null}
              onClick={() => setSelectedPiece(pieceIndex)}
              onPointerDown={(event) =>
                handlePiecePointerDown(event, pieceIndex)
              }
              onPointerMove={(event) =>
                handlePiecePointerMove(event, pieceIndex)
              }
              onPointerUp={(event) => handlePiecePointerUp(event, pieceIndex)}
              onPointerCancel={() => {
                setDrag(null);
                setPreview(null);
              }}
            >
              <span
                className="piece-shape"
                style={{ ...style, ...draggedShapeStyle }}
              >
                {piece.cells.map(([row, column]) => (
                  <span
                    className={`game-block game-block-${piece.color}`}
                    data-shape-cell
                    data-shape-row={row}
                    data-shape-column={column}
                    key={`${row}-${column}`}
                    style={{
                      gridColumn: column + 1,
                      gridRow: row + 1,
                    }}
                    aria-hidden="true"
                  />
                ))}
              </span>
            </button>
          );
        })}
      </fieldset>
    </section>
  );
}
