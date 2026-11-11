# Application updates

NextDJ performs one opportunistic update check when the renderer starts. The
main process queries the latest stable GitHub Release and validates its version
and URLs before returning any information to the renderer.

When a newer version exists, the app displays a dismissible banner. Its
download button opens the architecture-specific DMG on macOS, the NSIS setup
executable on Windows, or the GitHub Release page on Linux and unsupported
architectures. The renderer cannot provide an arbitrary URL to the main
process.

Checks fail silently while offline so they never interrupt playback or
recording. This assisted update phase does not download in the background,
restart the app, or install software automatically.
