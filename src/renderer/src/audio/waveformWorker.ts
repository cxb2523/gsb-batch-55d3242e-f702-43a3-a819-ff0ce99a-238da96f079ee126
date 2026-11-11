import { computeWaveformFromSamples } from './waveformData'

export interface WaveformWorkerRequest {
  requestId: number
  samples: Float32Array
  sampleRate: number
  frameCount: number
  duration: number
}

export interface WaveformWorkerSuccessResponse {
  requestId: number
  ok: true
  overviewPeaks: Float32Array
  overviewLows: Float32Array
  overviewBucketCount: number
  zoomPeaks: Float32Array
  zoomLows: Float32Array
  zoomBucketCount: number
}

export interface WaveformWorkerErrorResponse {
  requestId: number
  ok: false
  message: string
}

export type WaveformWorkerResponse = WaveformWorkerSuccessResponse | WaveformWorkerErrorResponse

const ctx = self as unknown as Worker

ctx.onmessage = (event: MessageEvent<WaveformWorkerRequest>) => {
  const { requestId, samples, sampleRate, frameCount, duration } = event.data

  try {
    const waveform = computeWaveformFromSamples(samples, sampleRate, frameCount, duration)
    const response: WaveformWorkerSuccessResponse = {
      requestId,
      ok: true,
      overviewPeaks: waveform.overview.peaks,
      overviewLows: waveform.overview.lows,
      overviewBucketCount: waveform.overview.bucketCount,
      zoomPeaks: waveform.zoom.peaks,
      zoomLows: waveform.zoom.lows,
      zoomBucketCount: waveform.zoom.bucketCount
    }

    ctx.postMessage(response, [
      response.overviewPeaks.buffer,
      response.overviewLows.buffer,
      response.zoomPeaks.buffer,
      response.zoomLows.buffer
    ])
  } catch (error) {
    const response: WaveformWorkerErrorResponse = {
      requestId,
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }

    ctx.postMessage(response)
  }
}
