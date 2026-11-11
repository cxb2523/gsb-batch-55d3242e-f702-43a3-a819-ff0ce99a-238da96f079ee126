import type { ui as appUi } from "@/scripts/ui.ts"

export type Stage = "upload" | "config" | "editor"

type StageManagerOptions = {
  ui: typeof appUi
}

export function createStageManager({ ui }: StageManagerOptions) {
  function setStage(stage: Stage) {
    ui.stageUpload.hidden = stage !== "upload"
    ui.stageConfig.hidden = stage !== "config"
    ui.stageEditor.hidden = stage !== "editor"
    if (ui.statusDock) ui.statusDock.hidden = stage === "editor"
    if (stage === "editor") ui.downloadsPanel.hidden = true
  }

  return { setStage }
}
