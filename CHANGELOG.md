# Changelog

All notable changes to NextDJ will be documented in this file.

The format is based on Keep a Changelog, and this project uses Semantic
Versioning once public releases begin.

## [0.1.7] - 2026-11-11

This maintenance release moves NextDJ to current build tooling. The interface
looks and behaves the same. These early builds remain unsigned, so macOS and
Windows may show security warnings.

### Changed

- Updated the build stack to Tailwind CSS 4, Vite 8, electron-vite 6 and the React plugin 6.
- Updated lucide-react, Vitest and other development dependencies.
- Updated the GitHub Actions used to build and publish releases.

These early builds are unsigned. macOS and Windows may show security warnings.
You can build from source if you prefer to inspect the app before running it.

## [0.1.6] - 2026-11-11

This security release updates the bundled Electron runtime and other
dependencies with published security fixes. It contains no functional
changes. These early builds remain unsigned, so macOS and Windows may show
security warnings.

### Security

- Updated Electron to 43.8.8, which includes upstream security fixes for the bundled Chromium and Node.js runtime.
- Updated undici, fast-uri, @xmldom/xmldom, vite, postcss, js-yaml and other build dependencies to patched versions.

These early builds are unsigned. macOS and Windows may show security warnings.
You can build from source if you prefer to inspect the app before running it.

## [0.1.5] - 2026-07-16

This corrective release restores low-latency playback for the default master
output in packaged desktop builds. These early builds remain unsigned, so
macOS and Windows may show security warnings.

### Fixed

- Removed the several-second delay between pressing Play and hearing the master output in packaged builds.
- Kept the system-default master route inside WebAudio instead of passing it through an additional buffered media element.
- Preserved selectable non-default output devices and prevented stale device changes from replacing a newer route.

These early builds are unsigned. macOS and Windows may show security warnings.
You can build from source if you prefer to inspect the app before running it.

## [0.1.4] - 2026-07-11

This release expands the hands-on DJ workflow and brings the desktop console
substantially closer to its intended hardware-inspired design. These early
builds remain unsigned, so macOS and Windows may show security warnings.

### Added

- Audible jog scrubbing and bidirectional platter scratching.
- Persistent track artwork for local files and imported playlists.
- An independent headphones level control and persisted output routing.
- Dedicated pitch, channel-volume, and crossfader control variants.

### Changed

- Extended the pitch range to +/-16% for wider tempo matching.
- Replaced the crate contents when importing a new playlist.
- Rebuilt the mixer, jog wheels, faders, crossfader, and output settings around a consistent hardware-inspired visual system.
- Smoothed platter rotation on the compositor without increasing the React update rate.
- Updated the project screenshot to reflect the current console.

### Fixed

- Prevented crate keyboard loading from replacing the deck that is currently audible.
- Made CUE clicks deterministic and stopped pointer drags from remaining captured after release.
- Preserved operating-system shortcuts such as Command-Q.
- Improved playlist-import errors when a configured provider dependency is unavailable.

These early builds are unsigned. macOS and Windows may show security warnings.
You can build from source if you prefer to inspect the app before running it.

## [0.1.3] - 2026-07-10

This corrective release makes the unsigned macOS download internally
consistent. Gatekeeper may still require explicit user approval because the app
is not Developer ID-signed or notarized, but it should no longer classify the
bundle as damaged due to an incomplete signature.

### Fixed

- Applied a complete ad-hoc signature to the app, helpers, and Electron frameworks.
- Preserved Hardened Runtime with the JIT, library-validation, camera, and audio entitlements required by NextDJ.

### Changed

- Made macOS packaging fail unless strict deep signature validation passes for every architecture.

## [0.1.2] - 2026-07-10

This release introduces assisted application updates. NextDJ remains unsigned
software below version 1.0, so macOS and Windows may still show
operating-system security warnings.

### Added

- Automatic checks for the latest stable GitHub Release at startup.
- A dismissible in-app banner with the installed and available versions.
- Architecture-specific download links for macOS and Windows, with a safe release-page fallback.
- Silent offline behavior so update checks never interrupt playback or recording.

### Security

- Restricted update metadata and download URLs to the official NextDJ GitHub repository.
- Kept URL selection in the main process behind fixed, parameter-free IPC channels.

## [0.1.1] - 2026-07-10

NextDJ remains early, unsigned software. This release is published as a
regular GitHub Release so it is visible as the latest downloadable version;
macOS and Windows may still show operating-system security warnings.

### Added

- Deterministic Electron end-to-end coverage for track loading and playback.
- Production performance budgets for deck loading, playback, and recording.
- Keyboard operation for knobs, jog wheels, waveforms, CUE, and modal panels.
- Versioned library persistence with invalid-record quarantine and recovery.

### Changed

- Made transport, loops, track loading, output routing, and library writes race-safe.
- Split deck responsibilities and restored renderer dependency boundaries.
- Bounded metadata analysis, provider execution, recording sessions, and library capacity.
- Reused one quality gate for CI and releases, with pinned actions and reproducible tooling.

### Security

- Enforced recording ownership, per-session limits, collision-safe paths, and exact cleanup.
- Added strict playlist-provider validation, timeouts, output budgets, and failure isolation.
- Scoped GitHub release permissions and added automated dependency updates.

## [0.1.0-alpha.1] - 2026-07-09

This first public build is intended as an unsigned pre-release. macOS and
Windows may show operating-system security warnings. Build from source if you
prefer to inspect the app before running it.

### Added

- Electron, React, and WebAudio desktop DJ console.
- Local track loading, deck transport, waveform views, BPM analysis, mixer, and recording.
- Neutral playlist import provider API for locally configured plugins.
- Quality gate with linting, type checking, tests, coverage, and production build.
- Performance snapshot tooling for deck loading, playback, and recording smoke checks.
- Release packaging for macOS, Windows, and Linux with generated app icons.
