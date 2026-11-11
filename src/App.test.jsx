import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('./utils/audio', () => ({
  audioSynth: {
    playWaterSound: vi.fn(),
    playGrowSound: vi.fn(),
    playFanfareSound: vi.fn(),
  },
}));

vi.mock('./components/ParticleCanvas', () => ({
  ParticleCanvas: ({ triggerBurst }) => (
    <div
      data-testid="particle-canvas"
      data-burst={triggerBurst ? 'true' : 'false'}
    />
  ),
}));

import App from './App.jsx';
import { audioSynth } from './utils/audio';

const STAGE_EXPECTATIONS = [
  { stemHeight: '50', leaves: 0, reasons: 0, label: 'Regar con amor', emoji: '💛' },
  { stemHeight: '50', leaves: 1, reasons: 1, label: 'Otro poquito', emoji: '💧' },
  { stemHeight: '110', leaves: 2, reasons: 2, label: 'Está creciendo', emoji: '🌱' },
  { stemHeight: '170', leaves: 2, reasons: 3, label: 'Está creciendo', emoji: '🌱' },
  { stemHeight: '170', leaves: 3, reasons: 4, label: 'Está creciendo', emoji: '🌱' },
  { stemHeight: '225', leaves: 4, reasons: 5, label: 'Regar con mas amor', emoji: '💛' },
];

function getWaterButton() {
  return document.querySelector('.water-button');
}

function getLabel() {
  return getWaterButton().querySelector('span').textContent.trim();
}

function getEmoji() {
  return getWaterButton().querySelector('.btn-emoji').textContent.trim();
}

function getStemHeight() {
  return document.querySelector('.plant-stem').getAttribute('height');
}

function getVisibleLeaves() {
  return Array.from(document.querySelectorAll('#leavesGroup > g')).filter(
    (leaf) => leaf.style.opacity === '1'
  ).length;
}

function getReasons() {
  return Array.from(document.querySelectorAll('.reason-item')).map((el) =>
    el.textContent.trim()
  );
}

function getBloomWrapper() {
  return document.querySelector('.sunflower-bloom-wrapper');
}

function isBlooming() {
  return getBloomWrapper().classList.contains('blooming');
}

function getBurstFlag() {
  return screen.getByTestId('particle-canvas').dataset.burst;
}

function modalIsOpen() {
  return screen.queryByText(/¡Feliz Día de la Primavera!/) !== null;
}

function advance(ms) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function expectStage(index) {
  const expected = STAGE_EXPECTATIONS[index];
  expect(getStemHeight()).toBe(expected.stemHeight);
  expect(getVisibleLeaves()).toBe(expected.leaves);
  expect(getReasons()).toHaveLength(expected.reasons);
  expect(getLabel()).toBe(expected.label);
  expect(getEmoji()).toBe(expected.emoji);
}

function waterAndSettle(index) {
  fireEvent.click(getWaterButton());
  advance(350);
  expectStage(index);
}

function reachFinalStage() {
  for (let next = 1; next <= 5; next += 1) {
    waterAndSettle(next);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('App watering progression', () => {
  it('advances one stage per watering and keeps all visible stage data in sync', () => {
    render(<App />);

    expectStage(0);
    expect(modalIsOpen()).toBe(false);
    expect(isBlooming()).toBe(false);
    expect(getBurstFlag()).toBe('false');

    for (let next = 1; next <= 5; next += 1) {
      fireEvent.click(getWaterButton());

      // The stage only changes after the 350 ms delay.
      expect(getLabel()).toBe(STAGE_EXPECTATIONS[next - 1].label);
      expect(audioSynth.playWaterSound).toHaveBeenCalledTimes(next);

      advance(350);
      expectStage(next);
      expect(audioSynth.playGrowSound).toHaveBeenLastCalledWith(next);
    }

    expect(audioSynth.playGrowSound).toHaveBeenCalledTimes(5);
    expect(isBlooming()).toBe(false);

    // Final watering opens the card after its own 400 ms delay.
    fireEvent.click(getWaterButton());
    expect(audioSynth.playWaterSound).toHaveBeenCalledTimes(6);

    advance(399);
    expect(modalIsOpen()).toBe(false);

    advance(1);
    expect(modalIsOpen()).toBe(true);
    expect(audioSynth.playGrowSound).toHaveBeenCalledTimes(5);
    expect(isBlooming()).toBe(false);
  });

  it('ignores repeated clicks inside the stage transition delay window', () => {
    render(<App />);

    fireEvent.click(getWaterButton());
    fireEvent.click(getWaterButton());
    advance(100);
    fireEvent.click(getWaterButton());
    advance(250);
    expectStage(1);

    // A single valid watering happened: one water sound and one grow sound.
    expect(audioSynth.playWaterSound).toHaveBeenCalledTimes(1);
    expect(audioSynth.playGrowSound).toHaveBeenCalledTimes(1);
    expect(audioSynth.playGrowSound).toHaveBeenLastCalledWith(1);

    // Nothing else queues up after the window has closed.
    advance(2000);
    expectStage(1);
    expect(audioSynth.playGrowSound).toHaveBeenCalledTimes(1);
    expect(modalIsOpen()).toBe(false);
  });

  it('ignores repeated clicks inside the final card delay window', () => {
    render(<App />);
    reachFinalStage();

    fireEvent.click(getWaterButton());
    fireEvent.click(getWaterButton());
    fireEvent.click(getWaterButton());
    advance(400);

    expect(modalIsOpen()).toBe(true);
    expect(audioSynth.playWaterSound).toHaveBeenCalledTimes(6);
    expect(audioSynth.playGrowSound).toHaveBeenCalledTimes(5);

    advance(2000);
    expect(modalIsOpen()).toBe(true);
    expect(isBlooming()).toBe(false);
  });

  it('resets to stage 0 from the bloom state, clears every flag, and can grow again', () => {
    render(<App />);
    reachFinalStage();

    fireEvent.click(getWaterButton());
    advance(400);
    expect(modalIsOpen()).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Ver la flor de mi amor/ }));
    expect(modalIsOpen()).toBe(false);
    expect(isBlooming()).toBe(true);
    expect(getBurstFlag()).toBe('true');
    expect(audioSynth.playFanfareSound).toHaveBeenCalledTimes(1);
    expect(getLabel()).toBe('Floreció');

    // Clicking "Floreció" resets immediately and cancels every pending timer.
    fireEvent.click(getWaterButton());
    expectStage(0);
    expect(modalIsOpen()).toBe(false);
    expect(isBlooming()).toBe(false);
    expect(getBurstFlag()).toBe('false');
    expect(audioSynth.playWaterSound).toHaveBeenCalledTimes(7);

    // Pending callbacks from before the bloom cannot drag it back to a middle
    // state, and the reset click's own ripple is the only thing left queued.
    advance(2000);
    expectStage(0);
    expect(modalIsOpen()).toBe(false);
    expect(isBlooming()).toBe(false);
    expect(getBurstFlag()).toBe('false');

    // Watering again starts normally from stage 0.
    fireEvent.click(getWaterButton());
    advance(350);
    expectStage(1);
    expect(audioSynth.playWaterSound).toHaveBeenCalledTimes(8);
    expect(audioSynth.playGrowSound).toHaveBeenCalledTimes(6);
    expect(audioSynth.playGrowSound).toHaveBeenLastCalledWith(1);
    expect(modalIsOpen()).toBe(false);
    expect(isBlooming()).toBe(false);
  });

  it('does not apply a pending transition after the component unmounts', () => {
    const { unmount } = render(<App />);

    fireEvent.click(getWaterButton());
    unmount();

    // No queued callback should run or throw after unmount.
    advance(5000);
    expect(audioSynth.playGrowSound).not.toHaveBeenCalled();
  });
});
