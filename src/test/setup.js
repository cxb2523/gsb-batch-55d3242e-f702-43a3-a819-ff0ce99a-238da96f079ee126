import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom does not implement a 2D canvas context. The particle layer only needs
// a no-op surface in tests; the visual effect itself is not under test here.
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  clearRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  drawImage: vi.fn(),
  fillText: vi.fn(),
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  setTransform: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
}));

// Avoid an endless requestAnimationFrame loop while fake timers are installed.
globalThis.requestAnimationFrame = vi.fn(() => 0);
globalThis.cancelAnimationFrame = vi.fn();
