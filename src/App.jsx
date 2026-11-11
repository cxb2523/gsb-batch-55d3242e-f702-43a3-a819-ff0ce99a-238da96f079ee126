import React, { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import { Header } from './components/Header';
import { PlantSvg } from './components/PlantSvg';
import { WaterDroplets } from './components/WaterDroplets';
import { FinalCard } from './components/FinalCard';
import { ParticleCanvas } from './components/ParticleCanvas';
import { audioSynth } from './utils/audio';

const STAGES = [
  {
    // Stage 0: Maceta + tallo verde base (sin hojas)
    stemHeight: 50,
    visibleLeaves: 0,
    reasons: [],
    showTitle: false,
    showSpecial: false,
    btnText: "Regar con amor",
    btnEmoji: "💛"
  },
  {
    // Stage 1: Tallo igual, aparece 1° hoja
    stemHeight: 50,
    visibleLeaves: 1,
    reasons: ["Sos hermosa"],
    showTitle: true,
    showSpecial: false,
    btnText: "Otro poquito",
    btnEmoji: "💧"
  },
  {
    // Stage 2: Crece el tallo y aparece 2° hoja
    stemHeight: 110,
    visibleLeaves: 2,
    reasons: ["Sos hermosa", "Sos divertida"],
    showTitle: true,
    showSpecial: false,
    btnText: "Está creciendo",
    btnEmoji: "🌱"
  },
  {
    // Stage 3: Crece el tallo, mantiene 2° hoja (NO aparece hoja nueva)
    stemHeight: 170,
    visibleLeaves: 2,
    reasons: ["Sos hermosa", "Sos divertida", "Sos mi mundo"],
    showTitle: true,
    showSpecial: false,
    btnText: "Está creciendo",
    btnEmoji: "🌱"
  },
  {
    // Stage 4: Tallo igual, aparece 3° hoja
    stemHeight: 170,
    visibleLeaves: 3,
    reasons: ["Sos hermosa", "Sos divertida", "Sos mi mundo", "Sos auténtica"],
    showTitle: true,
    showSpecial: false,
    btnText: "Está creciendo",
    btnEmoji: "🌱"
  },
  {
    // Stage 5: Crece el tallo y aparece 4° hoja
    stemHeight: 225,
    visibleLeaves: 4,
    reasons: ["Sos hermosa", "Sos divertida", "Sos mi mundo", "Sos auténtica", "Sos perfecta"],
    showTitle: true,
    showSpecial: true,
    btnText: "Regar con mas amor",
    btnEmoji: "💛",
    triggersModal: true
  }
];

const STAGE_DELAY_MS = 350;
const MODAL_DELAY_MS = 400;
const RIPPLE_DELAY_MS = 650;

export function App() {
  const [currentStage, setCurrentStage] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [bloomSunflower, setBloomSunflower] = useState(false);
  const [dropsKey, setDropsKey] = useState(0);
  const [showRipple, setShowRipple] = useState(false);
  const [triggerBurst, setTriggerBurst] = useState(false);

  // Refs mirror the committed state so event handlers can make a synchronous
  // decision even before React has re-rendered the next frame.
  const currentStageRef = useRef(0);
  const showModalRef = useRef(false);
  const bloomSunflowerRef = useRef(false);

  // True while a delayed stage/modal transition is queued. Any further
  // watering during that window is ignored.
  const transitioningRef = useRef(false);

  // Every pending timeout is tracked so it can be cancelled on reset and on
  // unmount; a cancelled callback must never mutate state.
  const pendingTimersRef = useRef(new Set());

  const clearPendingTimers = useCallback(() => {
    pendingTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    pendingTimersRef.current.clear();
  }, []);

  const scheduleTimeout = useCallback((callback, delay) => {
    const timerId = setTimeout(() => {
      pendingTimersRef.current.delete(timerId);
      callback();
    }, delay);
    pendingTimersRef.current.add(timerId);
  }, []);

  useEffect(() => clearPendingTimers, [clearPendingTimers]);

  const stage = STAGES[currentStage];

  const resetToInitialStage = () => {
    // Drop every queued callback first: a stale stage/modal/ripple transition
    // from before the bloom must not touch the fresh state.
    clearPendingTimers();
    transitioningRef.current = false;

    currentStageRef.current = 0;
    setCurrentStage(0);

    showModalRef.current = false;
    setShowModal(false);

    bloomSunflowerRef.current = false;
    setBloomSunflower(false);

    setTriggerBurst(false);
  };

  const handleWater = () => {
    // Ignore clicks while a stage change is pending or while the final card
    // is open. One valid watering maps to exactly one state transition.
    if (transitioningRef.current || showModalRef.current) {
      return;
    }

    audioSynth.playWaterSound();

    // Trigger water drop animation
    setDropsKey(Date.now());
    setShowRipple(false);

    if (bloomSunflowerRef.current) {
      resetToInitialStage();
      // The reset click still gets its own ripple feedback.
      scheduleTimeout(() => setShowRipple(true), RIPPLE_DELAY_MS);
      return;
    }

    scheduleTimeout(() => setShowRipple(true), RIPPLE_DELAY_MS);

    if (STAGES[currentStageRef.current].triggersModal) {
      transitioningRef.current = true;
      scheduleTimeout(() => {
        transitioningRef.current = false;
        showModalRef.current = true;
        setShowModal(true);
      }, MODAL_DELAY_MS);
      return;
    }

    if (currentStageRef.current < STAGES.length - 1) {
      const nextStage = currentStageRef.current + 1;
      transitioningRef.current = true;
      scheduleTimeout(() => {
        currentStageRef.current = nextStage;
        setCurrentStage(nextStage);
        transitioningRef.current = false;
        audioSynth.playGrowSound(nextStage);
      }, STAGE_DELAY_MS);
    }
  };

  const handleRevealFlower = () => {
    // Only the visible final card can reveal the flower, and only once.
    if (!showModalRef.current || bloomSunflowerRef.current) {
      return;
    }

    showModalRef.current = false;
    setShowModal(false);
    bloomSunflowerRef.current = true;
    setBloomSunflower(true);
    setTriggerBurst(true);
    audioSynth.playFanfareSound();
  };

  return (
    <>
      <div className="background-decorations">
        <div className="bg-sun-glow"></div>
      </div>

      <ParticleCanvas triggerBurst={triggerBurst} />

      <main className="app-container">
        <Header
          showTitle={stage.showTitle}
          reasons={stage.reasons}
          showSpecial={stage.showSpecial}
        />

        <section className="plant-section">
          <WaterDroplets dropsKey={dropsKey} showRipple={showRipple} />
          <PlantSvg
            stage={currentStage}
            stemHeight={stage.stemHeight}
            visibleLeaves={stage.visibleLeaves}
            bloomSunflower={bloomSunflower}
          />
        </section>

        <FinalCard
          show={showModal}
          onRevealFlower={handleRevealFlower}
        />

        <footer className="footer-section">
          <button className="water-button" onClick={handleWater}>
            <span>{bloomSunflower ? "Floreció" : stage.btnText}</span>
            <span className="btn-emoji">{bloomSunflower ? "💛" : stage.btnEmoji}</span>
          </button>
        </footer>
      </main>
    </>
  );
}

export default App;
