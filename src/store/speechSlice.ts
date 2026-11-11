import { createSlice, PayloadAction } from "@reduxjs/toolkit";
export interface ISpeechTake {
  assetId: string;
  mp3Url: string;
  provider: "kokoro" | "elevenlabs";
  voiceId: string;
  speed: number;
  durationMs: number;
  created: string;
}
export interface SpeechLine {
  activeAssetId: string;
  takes: ISpeechTake[];
}
export interface SpeechSettings {
  provider: "kokoro" | "elevenlabs";
  kokoroVoice: string;
  kokoroSpeed: number;
  elevenLabsVoiceId: string;
}
export type SpeechBatchStatus = "success" | "failed" | "skipped";
export interface SpeechBatchResult {
  text: string;
  status: SpeechBatchStatus;
  error?: string;
}
export interface SpeechBatchState {
  running: boolean;
  results: SpeechBatchResult[];
}
export interface SpeechState {
  takesByText: Record<string, SpeechLine>;
  settings: SpeechSettings;
  pending: string[];
  batch: SpeechBatchState;
  hydrated: boolean;
}
export const initialSpeechState: SpeechState = {
  takesByText: Object.create(null),
  settings: {
    provider: "kokoro",
    kokoroVoice: "af_heart",
    kokoroSpeed: 1,
    elevenLabsVoiceId: "",
  },
  pending: [],
  batch: { running: false, results: [] },
  hydrated: false,
};
const slice = createSlice({
  name: "speech",
  initialState: initialSpeechState,
  reducers: {
    hydrateSpeech(
      state,
      action: PayloadAction<Pick<SpeechState, "takesByText" | "settings">>,
    ) {
      if (!state.hydrated) {
        Object.assign(state, action.payload);
        state.hydrated = true;
      }
    },
    setSpeechSettings(state, action: PayloadAction<Partial<SpeechSettings>>) {
      Object.assign(state.settings, action.payload);
    },
    setSpeechPending(
      state,
      action: PayloadAction<{ text: string; pending: boolean }>,
    ) {
      state.pending = state.pending.filter((t) => t !== action.payload.text);
      if (action.payload.pending) state.pending.push(action.payload.text);
    },
    addSpeechTake(
      state,
      action: PayloadAction<{ text: string; take: ISpeechTake }>,
    ) {
      const { text, take } = action.payload;
      state.takesByText[text] = {
        activeAssetId: take.assetId,
        takes: [
          take,
          ...(state.takesByText[text]?.takes ?? []).filter(
            (t) => t.assetId !== take.assetId,
          ),
        ].slice(0, 5),
      };
    },
    selectSpeechTake(
      state,
      action: PayloadAction<{ text: string; assetId: string }>,
    ) {
      const line = state.takesByText[action.payload.text];
      if (line?.takes?.some((t) => t.assetId === action.payload.assetId))
        line.activeAssetId = action.payload.assetId;
    },
    setSpeechBatchRunning(state, action: PayloadAction<boolean>) {
      state.batch.running = action.payload;
      if (action.payload) state.batch.results = [];
    },
    setSpeechBatchResults(
      state,
      action: PayloadAction<SpeechBatchResult[]>,
    ) {
      state.batch.results = action.payload;
      state.batch.running = false;
    },
  },
});
export const {
  hydrateSpeech,
  setSpeechSettings,
  setSpeechPending,
  addSpeechTake,
  selectSpeechTake,
  setSpeechBatchRunning,
  setSpeechBatchResults,
} = slice.actions;
export default slice.reducer;
