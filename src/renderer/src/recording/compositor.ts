import { createFrameMeter } from '../performance/frameMetrics'

export const RECORDING_FRAME_RATE = 24
// Fixed 16:9 output: the scene is drawn with contain over a cheap opaque
// background, so recordings never inherit ultra-wide Electron frame dimensions.
const OUTPUT_WIDTH = 1920
const OUTPUT_HEIGHT = 1080
const BACKGROUND_COLOR = '#05080b'
const PIP_WIDTH_RATIO = 0.24
const PIP_MARGIN_RATIO = 0.012
const PIP_CORNER_RADIUS = 14
const SOURCE_READY_TIMEOUT_MS = 2500
const RECORDING_SLOW_FRAME_MS = 20

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// The draw sources live hidden in the DOM: detached <video> elements are not
// guaranteed to keep decoding in every Chromium build.
async function createHiddenVideo(track: MediaStreamTrack): Promise<HTMLVideoElement> {
  const video = document.createElement('video')

  video.muted = true
  video.playsInline = true
  video.style.position = 'fixed'
  video.style.left = '-9999px'
  video.style.top = '0'
  video.style.width = '16px'
  video.style.height = '9px'
  video.style.opacity = '0'
  video.style.pointerEvents = 'none'
  video.srcObject = new MediaStream([track])
  document.body.appendChild(video)
  await waitForVideo(video)

  return video
}

function waitForVideo(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (): void => {
      if (settled) {
        return
      }

      settled = true
      window.clearTimeout(timeoutId)
      video.removeEventListener('loadedmetadata', settle)
      video.removeEventListener('canplay', settle)
      resolve()
    }
    const timeoutId = window.setTimeout(settle, SOURCE_READY_TIMEOUT_MS)

    video.addEventListener('loadedmetadata', settle, { once: true })
    video.addEventListener('canplay', settle, { once: true })
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0) {
      settle()
    }

    void video.play().catch(settle)
  })
}

function containRect(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): Rect {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
  const width = Math.round(sourceWidth * scale)
  const height = Math.round(sourceHeight * scale)

  return {
    x: Math.round((targetWidth - width) / 2),
    y: Math.round((targetHeight - height) / 2),
    width,
    height
  }
}

// Draws the screen capture letterboxed over a dark background into a fixed
// 16:9 canvas (the source aspect can differ or change mid-recording), plus
// an optional camera PiP at the bottom-right. Uses a timer, not
// requestAnimationFrame: rAF throttles when the window is hidden.
export class VideoCompositor {
  private readonly screenTrack: MediaStreamTrack
  private readonly cameraTrack: MediaStreamTrack | null
  private readonly canvas: HTMLCanvasElement
  private screenVideo: HTMLVideoElement | null = null
  private cameraVideo: HTMLVideoElement | null = null
  private intervalId: number | null = null

  constructor(screenTrack: MediaStreamTrack, cameraTrack: MediaStreamTrack | null) {
    this.screenTrack = screenTrack
    this.cameraTrack = cameraTrack
    this.canvas = document.createElement('canvas')
    this.canvas.width = OUTPUT_WIDTH
    this.canvas.height = OUTPUT_HEIGHT
  }

  async start(): Promise<MediaStreamTrack> {
    this.screenVideo = await createHiddenVideo(this.screenTrack)

    if (this.cameraTrack) {
      this.cameraVideo = await createHiddenVideo(this.cameraTrack)
    }

    const context = this.canvas.getContext('2d', { alpha: false })

    if (!context) {
      throw new Error('Could not prepare the recording compositor.')
    }

    const frameMeter = createFrameMeter('recording.compositor', RECORDING_SLOW_FRAME_MS)
    const drawFrame = (): void => frameMeter.measure(() => this.draw(context))

    drawFrame()
    this.intervalId = window.setInterval(drawFrame, 1000 / RECORDING_FRAME_RATE)

    const [track] = this.canvas.captureStream(RECORDING_FRAME_RATE).getVideoTracks()

    if (!track) {
      throw new Error('Could not create the composed video track.')
    }

    track.contentHint = 'detail'
    return track
  }

  stop(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId)
      this.intervalId = null
    }

    for (const video of [this.screenVideo, this.cameraVideo]) {
      if (video) {
        video.srcObject = null
        video.remove()
      }
    }

    this.screenVideo = null
    this.cameraVideo = null
  }

  private draw(context: CanvasRenderingContext2D): void {
    const { width, height } = this.canvas
    const screenVideo = this.screenVideo

    context.fillStyle = BACKGROUND_COLOR
    context.fillRect(0, 0, width, height)

    if (screenVideo && screenVideo.readyState >= 2 && screenVideo.videoWidth > 0) {
      const videoWidth = screenVideo.videoWidth
      const videoHeight = screenVideo.videoHeight
      const foreground = containRect(videoWidth, videoHeight, width, height)

      context.drawImage(screenVideo, foreground.x, foreground.y, foreground.width, foreground.height)
    }

    const cameraVideo = this.cameraVideo

    if (
      !cameraVideo ||
      cameraVideo.readyState < 2 ||
      !this.cameraTrack ||
      this.cameraTrack.readyState !== 'live'
    ) {
      return
    }

    const cameraWidth = cameraVideo.videoWidth || 1280
    const cameraHeight = cameraVideo.videoHeight || 720
    const pipWidth = width * PIP_WIDTH_RATIO
    const pipHeight = (pipWidth * cameraHeight) / cameraWidth
    const margin = width * PIP_MARGIN_RATIO
    const x = width - pipWidth - margin
    const y = height - pipHeight - margin

    context.save()
    context.beginPath()
    context.roundRect(x, y, pipWidth, pipHeight, PIP_CORNER_RADIUS)
    context.clip()
    context.drawImage(cameraVideo, x, y, pipWidth, pipHeight)
    context.restore()
  }
}
