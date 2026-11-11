import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { getMasterBeatIndex } from './app/masterBeat'
import { getSafeCrateLoadTarget } from './app/safeCrateLoad'
import { DeckPanel } from './components/Deck/DeckPanel'
import { LibraryPanel } from './components/Library/LibraryPanel'
import { MixerPanel } from './components/Mixer/MixerPanel'
import { SettingsPanel } from './components/Settings/SettingsPanel'
import { UpdateNotice } from './components/Update/UpdateNotice'
import { useAppUpdate } from './hooks/useAppUpdate'
import { useAppShortcuts } from './hooks/useAppShortcuts'
import { useDeckLoading } from './hooks/useDeckLoading'
import { useDialogFocus } from './hooks/useDialogFocus'
import { useEngine } from './hooks/useEngine'
import { useLibrary } from './hooks/useLibrary'
import { useRecorder } from './hooks/useRecorder'
import { installPerformanceProfiler } from './performance/perfCollector'
import { startLongTaskObserver } from './performance/longTaskObserver'

export function App(): JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const {
    engine,
    decks,
    masterDeckId,
    phaseOffsets,
    channels,
    mixer,
    output,
    loadTrack,
    togglePlayback,
    seek,
    setCuePoint,
    cuePress,
    cueRelease,
    setPitch,
    syncDeck,
    nudgeDeck,
    jogBend,
    jogScratchEnd,
    jogScratchStart,
    jogScrub,
    exitLoop,
    setAutoLoop,
    setTrim,
    setEq,
    setChannelVolume,
    toggleCue,
    setCrossfade,
    setCueMix,
    setPhonesVolume,
    setMasterVolume,
    setMasterDevice,
    setCueDevice,
    refreshOutputDevices
  } = useEngine()
  const {
    tracks,
    isReady: libraryReady,
    error: libraryError,
    clearError: clearLibraryError,
    addFiles,
    addPlaylistImportTracks,
    resolveTrackFile,
    getTrack
  } = useLibrary()
  const recorder = useRecorder(engine)
  const appUpdate = useAppUpdate()
  const { loadingDecks, deckErrors, clearDeckError, loadFileToDeck, loadLibraryTrack, loadLibraryTrackById } =
    useDeckLoading({
      libraryReady,
      addFiles,
      resolveTrackFile,
      getTrack,
      loadTrack
    })

  const getDeckAPosition = useCallback((): number => engine.deckA.getPosition(), [engine])
  const getDeckBPosition = useCallback((): number => engine.deckB.getPosition(), [engine])
  const openSettings = useCallback((): void => setSettingsOpen(true), [])
  const closeSettings = useCallback((): void => setSettingsOpen(false), [])
  const openShortcuts = useCallback((): void => setShortcutsOpen(true), [])
  const closeShortcuts = useCallback((): void => setShortcutsOpen(false), [])
  const shortcutsDialogRef = useRef<HTMLDivElement>(null)
  const shortcutsCloseButtonRef = useRef<HTMLButtonElement>(null)
  const autoLoopDeckA = useCallback((beats: number): void => setAutoLoop('A', beats), [setAutoLoop])
  const autoLoopDeckB = useCallback((beats: number): void => setAutoLoop('B', beats), [setAutoLoop])
  const cueDownDeckA = useCallback((): Promise<void> => cuePress('A'), [cuePress])
  const cueDownDeckB = useCallback((): Promise<void> => cuePress('B'), [cuePress])
  const cueSetDeckA = useCallback((): void => setCuePoint('A'), [setCuePoint])
  const cueSetDeckB = useCallback((): void => setCuePoint('B'), [setCuePoint])
  const cueUpDeckA = useCallback((): void => cueRelease('A'), [cueRelease])
  const cueUpDeckB = useCallback((): void => cueRelease('B'), [cueRelease])
  const jogBendDeckA = useCallback((degrees: number): void => jogBend('A', degrees), [jogBend])
  const jogBendDeckB = useCallback((degrees: number): void => jogBend('B', degrees), [jogBend])
  const jogScratchEndDeckA = useCallback((): void => jogScratchEnd('A'), [jogScratchEnd])
  const jogScratchEndDeckB = useCallback((): void => jogScratchEnd('B'), [jogScratchEnd])
  const jogScratchStartDeckA = useCallback((): number => jogScratchStart('A'), [jogScratchStart])
  const jogScratchStartDeckB = useCallback((): number => jogScratchStart('B'), [jogScratchStart])
  const jogScrubDeckA = useCallback(
    (seconds: number, direction: -1 | 1): void => jogScrub('A', seconds, direction),
    [jogScrub]
  )
  const jogScrubDeckB = useCallback(
    (seconds: number, direction: -1 | 1): void => jogScrub('B', seconds, direction),
    [jogScrub]
  )
  const loadFileToDeckA = useCallback((file: File): Promise<void> => loadFileToDeck('A', file), [loadFileToDeck])
  const loadFileToDeckB = useCallback((file: File): Promise<void> => loadFileToDeck('B', file), [loadFileToDeck])
  const loopExitDeckA = useCallback((): void => exitLoop('A'), [exitLoop])
  const loopExitDeckB = useCallback((): void => exitLoop('B'), [exitLoop])
  const nudgeDeckA = useCallback((direction: -1 | 1): void => nudgeDeck('A', direction), [nudgeDeck])
  const nudgeDeckB = useCallback((direction: -1 | 1): void => nudgeDeck('B', direction), [nudgeDeck])
  const pitchDeckA = useCallback((value: number): void => setPitch('A', value), [setPitch])
  const pitchDeckB = useCallback((value: number): void => setPitch('B', value), [setPitch])
  const seekDeckA = useCallback((seconds: number): void => seek('A', seconds), [seek])
  const seekDeckB = useCallback((seconds: number): void => seek('B', seconds), [seek])
  const syncDeckA = useCallback((): void => syncDeck('A'), [syncDeck])
  const syncDeckB = useCallback((): void => syncDeck('B'), [syncDeck])
  const togglePlaybackDeckA = useCallback((): Promise<void> => togglePlayback('A'), [togglePlayback])
  const togglePlaybackDeckB = useCallback((): Promise<void> => togglePlayback('B'), [togglePlayback])
  const trackDropDeckA = useCallback((trackId: string): Promise<void> => loadLibraryTrackById('A', trackId), [
    loadLibraryTrackById
  ])
  const trackDropDeckB = useCallback((trackId: string): Promise<void> => loadLibraryTrackById('B', trackId), [
    loadLibraryTrackById
  ])

  useDialogFocus({
    open: shortcutsOpen,
    containerRef: shortcutsDialogRef,
    initialFocusRef: shortcutsCloseButtonRef,
    onClose: closeShortcuts
  })

  useEffect(() => {
    document.title = 'NextDJ'
    const stopProfiler = installPerformanceProfiler()
    const stopLongTaskObserver = startLongTaskObserver()

    return () => {
      stopLongTaskObserver()
      stopProfiler()
    }
  }, [])

  useAppShortcuts({
    deckPitch: { A: decks.A.pitch, B: decks.B.pitch },
    loadingDecks,
    crossfade: mixer.crossfade,
    shortcutsOpen,
    setShortcutsOpen,
    togglePlayback,
    cuePress,
    cueRelease,
    syncDeck,
    toggleCue,
    setCrossfade,
    setPitch,
    nudgeDeck
  })

  const masterDeck = masterDeckId ? decks[masterDeckId] : null
  const masterAccent = masterDeckId === 'B' ? '#f59e0b' : '#22d3ee'
  const masterBeatIndex = getMasterBeatIndex(masterDeckId, decks)
  const keyboardLoadDeckId = useMemo(
    () =>
      getSafeCrateLoadTarget({
        crossfade: mixer.crossfade,
        decks: {
          A: {
            hasTrack: decks.A.waveform !== null,
            isLoading: Boolean(loadingDecks.A),
            isPlaying: decks.A.isPlaying,
            volume: channels.A.volume
          },
          B: {
            hasTrack: decks.B.waveform !== null,
            isLoading: Boolean(loadingDecks.B),
            isPlaying: decks.B.isPlaying,
            volume: channels.B.volume
          }
        }
      }),
    [
      channels.A.volume,
      channels.B.volume,
      decks.A.isPlaying,
      decks.A.waveform,
      decks.B.isPlaying,
      decks.B.waveform,
      loadingDecks.A,
      loadingDecks.B,
      mixer.crossfade
    ]
  )

  return (
    <main className="flex h-screen flex-col overflow-hidden text-slate-100">
      {appUpdate.update ? (
        <UpdateNotice
          error={appUpdate.error}
          openingDownload={appUpdate.openingDownload}
          update={appUpdate.update}
          onDismiss={appUpdate.dismiss}
          onDownload={() => {
            void appUpdate.openDownload()
          }}
        />
      ) : null}
      <div className="console-shell flex min-h-0 flex-1 flex-col">
        <div className="console-stage">
          <div className="console-grid">
            <DeckPanel
              accent="#22d3ee"
              deckId="A"
              duration={decks.A.duration}
              artworkUrl={decks.A.artworkUrl}
              bpm={decks.A.bpm}
              effectiveBpm={decks.A.effectiveBpm}
              firstBeatOffset={decks.A.firstBeatOffset}
              getPosition={getDeckAPosition}
              isPlaying={decks.A.isPlaying}
              isLoading={Boolean(loadingDecks.A)}
              loadingMessage={loadingDecks.A}
              errorMessage={deckErrors.A}
              loop={decks.A.loop}
              masterDeckId={masterDeckId}
              masterEffectiveBpm={masterDeckId ? decks[masterDeckId].effectiveBpm : 0}
              phaseOffset={phaseOffsets.A}
              pitch={decks.A.pitch}
              position={decks.A.position}
              trackName={decks.A.trackName}
              waveform={decks.A.waveform}
              onAutoLoop={autoLoopDeckA}
              onCueDown={cueDownDeckA}
              onCueSet={cueSetDeckA}
              onCueUp={cueUpDeckA}
              onJogBend={jogBendDeckA}
              onJogScratchEnd={jogScratchEndDeckA}
              onJogScratchStart={jogScratchStartDeckA}
              onJogScrub={jogScrubDeckA}
              onLoad={loadFileToDeckA}
              onLoopExit={loopExitDeckA}
              onNudge={nudgeDeckA}
              onPitchChange={pitchDeckA}
              onSeek={seekDeckA}
              onDismissError={() => clearDeckError('A')}
              onSync={syncDeckA}
              onTogglePlayback={togglePlaybackDeckA}
              onTrackDrop={trackDropDeckA}
            />

            <MixerPanel
              analyserA={engine.mixer.channelAAnalyser}
              analyserB={engine.mixer.channelBAnalyser}
              channelA={channels.A}
              channelB={channels.B}
              crossfade={mixer.crossfade}
              cueMix={mixer.cueMix}
              masterAccent={masterAccent}
              masterBeatIndex={masterBeatIndex}
              masterBpm={masterDeck?.effectiveBpm ?? 0}
              masterVolume={mixer.masterVolume}
              recorder={recorder}
              onChannelVolumeChange={setChannelVolume}
              onCrossfadeChange={setCrossfade}
              onCueMixChange={setCueMix}
              onCueToggle={toggleCue}
              onEqChange={setEq}
              onMasterVolumeChange={setMasterVolume}
              onOpenSettings={openSettings}
              onOpenShortcuts={openShortcuts}
              onTrimChange={setTrim}
            />

            <DeckPanel
              accent="#f59e0b"
              deckId="B"
              duration={decks.B.duration}
              artworkUrl={decks.B.artworkUrl}
              bpm={decks.B.bpm}
              effectiveBpm={decks.B.effectiveBpm}
              firstBeatOffset={decks.B.firstBeatOffset}
              getPosition={getDeckBPosition}
              isPlaying={decks.B.isPlaying}
              isLoading={Boolean(loadingDecks.B)}
              loadingMessage={loadingDecks.B}
              errorMessage={deckErrors.B}
              loop={decks.B.loop}
              masterDeckId={masterDeckId}
              masterEffectiveBpm={masterDeckId ? decks[masterDeckId].effectiveBpm : 0}
              phaseOffset={phaseOffsets.B}
              pitch={decks.B.pitch}
              position={decks.B.position}
              trackName={decks.B.trackName}
              waveform={decks.B.waveform}
              onAutoLoop={autoLoopDeckB}
              onCueDown={cueDownDeckB}
              onCueSet={cueSetDeckB}
              onCueUp={cueUpDeckB}
              onJogBend={jogBendDeckB}
              onJogScratchEnd={jogScratchEndDeckB}
              onJogScratchStart={jogScratchStartDeckB}
              onJogScrub={jogScrubDeckB}
              onLoad={loadFileToDeckB}
              onLoopExit={loopExitDeckB}
              onNudge={nudgeDeckB}
              onPitchChange={pitchDeckB}
              onSeek={seekDeckB}
              onDismissError={() => clearDeckError('B')}
              onSync={syncDeckB}
              onTogglePlayback={togglePlaybackDeckB}
              onTrackDrop={trackDropDeckB}
            />
          </div>

          <div className="library-dock">
            <LibraryPanel
              tracks={tracks}
              error={libraryError}
              keyboardLoadDeckId={keyboardLoadDeckId}
              onAddFiles={addFiles}
              onAddPlaylistImportTracks={addPlaylistImportTracks}
              onDismissError={clearLibraryError}
              onLoadTrack={loadLibraryTrack}
            />
          </div>
        </div>
      </div>

      <SettingsPanel
        cue={output.cue}
        devices={output.devices}
        deviceListError={output.deviceListError}
        master={output.master}
        phonesVolume={mixer.phonesVolume}
        open={settingsOpen}
        onClose={closeSettings}
        onCueDeviceChange={setCueDevice}
        onMasterDeviceChange={setMasterDevice}
        onPhonesVolumeChange={setPhonesVolume}
        onRefreshDevices={refreshOutputDevices}
      />

      {shortcutsOpen ? (
        <div className="shortcut-overlay" onClick={closeShortcuts}>
          <div
            ref={shortcutsDialogRef}
            aria-labelledby="shortcuts-title"
            aria-modal="true"
            className="shortcut-card"
            role="dialog"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="micro-label">Keyboard</p>
                <h2 className="text-xl font-bold text-white" id="shortcuts-title">
                  Keyboard shortcuts
                </h2>
              </div>
              <button
                ref={shortcutsCloseButtonRef}
                aria-label="Close keyboard shortcuts"
                className="icon-button"
                type="button"
                onClick={closeShortcuts}
              >
                <X size={15} strokeWidth={2.4} />
              </button>
            </div>
            <p className="micro-label shortcut-section">Decks</p>
            <dl className="shortcut-grid">
              <dt>Q / W</dt>
              <dd>Play-pause deck A / B</dd>
              <dt>A / S</dt>
              <dd>Cue deck A / B (hold to preview)</dd>
              <dt>D / F</dt>
              <dd>Sync deck A / B with the master</dd>
              <dt>[ / ]</dt>
              <dd>Nudge deck A back / forward (Shift for deck B)</dd>
              <dt>Shift + Up/Down</dt>
              <dd>Pitch deck A up / down</dd>
              <dt>Alt + Up/Down</dt>
              <dd>Pitch deck B up / down</dd>
            </dl>
            <p className="micro-label shortcut-section">Mixer</p>
            <dl className="shortcut-grid">
              <dt>T / Y</dt>
              <dd>Headphone cue channel A / B</dd>
              <dt>Z / X / C</dt>
              <dd>Nudge crossfader left / right / center</dd>
            </dl>
            <p className="micro-label shortcut-section">General</p>
            <dl className="shortcut-grid">
              <dt>K</dt>
              <dd>Expand or shrink the crate</dd>
              <dt>Enter</dt>
              <dd>Load into the safe deck (blocked while both decks are audible)</dd>
              <dt>?</dt>
              <dd>Toggle this panel (Esc closes)</dd>
            </dl>
          </div>
        </div>
      ) : null}
    </main>
  )
}
