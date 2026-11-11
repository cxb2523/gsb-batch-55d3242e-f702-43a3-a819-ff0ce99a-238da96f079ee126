import { useAuth } from "@clerk/clerk-react";
import { useStore } from "react-redux";
import { IAction } from "@fullstackcraftllc/codevideo-types";
import { useAppDispatch } from "./useAppDispatch";
import { useAppSelector } from "./useAppSelector";
import { RootState } from "../store";
import {
  addSpeechTake,
  selectSpeechTake,
  setSpeechBatchResults,
  setSpeechBatchRunning,
  setSpeechPending,
  SpeechSettings,
} from "../store/speechSlice";
import { activeTake, buildSpeakActionAudios } from "../utils/speech/speechAudio";
import {
  createSingleFlight,
  generateSpeechBatch,
  missingSpeechTexts,
  speechBatchFailures,
  speechBatchSummary,
  SpeechBatchError,
  speechTextError,
} from "../utils/speech/speechBatch";
import { getElevenLabsKey } from "../utils/persistence/speechPersistence";
import { textToSpeech, measureAudioDuration } from "../utils/api/textToSpeech";
import { addToast } from "../store/toastSlice";
const singleFlight = createSingleFlight<void>();
export function useSpeechTakes() {
  const state = useAppSelector((s) => s.speech);
  const store = useStore<RootState>();
  const dispatch = useAppDispatch();
  const { getToken } = useAuth();
  async function generateTake(
    text: string,
    overrides: Partial<SpeechSettings> = {},
  ) {
    return singleFlight(text, async () => {
      dispatch(setSpeechPending({ text, pending: true }));
      try {
        const textError = speechTextError(text);
        if (textError) throw new Error(textError);
        const settings = { ...store.getState().speech.settings, ...overrides };
        const token = await getToken();
        if (!token) throw new Error("Sign in to generate speech.");
        const key =
          settings.provider === "elevenlabs" ? getElevenLabsKey() : undefined;
        if (
          settings.provider === "elevenlabs" &&
          (!key || !/^[A-Za-z0-9]{10,40}$/.test(settings.elevenLabsVoiceId))
        )
          throw new Error(
            "Add your ElevenLabs key and a valid voice ID in Speech settings.",
          );
        const take = await textToSpeech(
          {
            text,
            provider: settings.provider,
            voiceId:
              settings.provider === "kokoro"
                ? settings.kokoroVoice
                : settings.elevenLabsVoiceId,
            speed: settings.provider === "kokoro" ? settings.kokoroSpeed : 1,
            ...(key ? { elevenLabsApiKey: key } : {}),
          },
          token,
        );
        const durationMs = await measureAudioDuration(take.mp3Url);
        dispatch(
          addSpeechTake({
            text,
            take: { ...take, durationMs, created: new Date().toISOString() },
          }),
        );
      } finally {
        dispatch(setSpeechPending({ text, pending: false }));
      }
    });
  }
  async function generateMissing(actions: IAction[]) {
    const texts = missingSpeechTexts(
      actions,
      store.getState().speech.takesByText,
    );
    const settings = { ...store.getState().speech.settings };
    if (!texts.length) {
      dispatch(setSpeechBatchResults([]));
      return buildSpeakActionAudios(
        actions,
        store.getState().speech.takesByText,
      );
    }
    dispatch(setSpeechBatchRunning(true));
    dispatch(addToast(`Generating ${texts.length} missing speech lines…`));
    try {
      const results = await generateSpeechBatch(
        texts,
        (text) => generateTake(text, settings),
        {
          concurrency: 2,
          onResult: (_result, done, total) =>
            dispatch(addToast(`Speech: ${done} / ${total} processed`)),
        },
      );
      dispatch(setSpeechBatchResults(results));
      if (speechBatchFailures(results).length) {
        dispatch(addToast(speechBatchSummary(results)));
        throw new SpeechBatchError(results);
      }
      return buildSpeakActionAudios(
        actions,
        store.getState().speech.takesByText,
      );
    } finally {
      dispatch(setSpeechBatchRunning(false));
    }
  }
  return {
    ...state,
    batchResults: state.batch?.results ?? [],
    batchRunning: state.batch?.running ?? false,
    generateTake,
    generateMissing,
    takeFor: (text: string) => activeTake(text, state.takesByText),
    selectTake: (text: string, assetId: string) =>
      dispatch(selectSpeechTake({ text, assetId })),
  };
}
