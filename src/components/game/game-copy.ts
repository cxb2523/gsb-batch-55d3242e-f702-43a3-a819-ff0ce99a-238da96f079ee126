export type GameLanguage = 'en' | 'zh';

export interface GameCopy {
  back: string;
  backHome: string;
  backToHome: string;
  backToGame: string;
  backToModes: string;
  bestScore: string;
  blockSkins: string;
  candy: string;
  challengeComplete: string;
  challengeCompleteDescription: (target: number) => string;
  challengeFailed: string;
  challengeFailedDescription: (target: number) => string;
  chooseMode: string;
  classic: string;
  classicDetails: string;
  classicTagline: string;
  clearBonus: string;
  clearCelebration: (lineCount: number) => string;
  close: string;
  comboBonus: string;
  comboStatus: (combo: number) => string;
  confirmExit: string;
  customPhotoReady: string;
  customizeBlocks: string;
  customizeDescription: string;
  daily: string;
  dailyDetails: string;
  dailyTagline: string;
  exitGameDescription: string;
  exitGameTitle: string;
  gameOver: string;
  gameOverDescription: string;
  rules: string;
  goal: string;
  greatGame: string;
  hints: string;
  hintsDescription: string;
  howToPlay: string;
  howToPlaySteps: readonly string[];
  language: string;
  languageDescription: string;
  keepPlaying: string;
  multiLineBonus: string;
  sixPlusLineBonus: string;
  music: string;
  musicDescription: string;
  noMoreMoves: string;
  ocean: string;
  offlineReady: string;
  on: string;
  off: string;
  photoFormats: string;
  placementPoints: string;
  playAgain: string;
  playNow: string;
  preferences: string;
  ranking: string;
  rankingDescription: string;
  readyToBlast: string;
  reduceMotion: string;
  reduceMotionDescription: string;
  relaxing: string;
  resetScores: string;
  resetScoresDone: string;
  resetSettings: string;
  restartGame: string;
  score: string;
  scoreRules: string;
  selectSquare: (row: number, column: number, state: string) => string;
  settings: string;
  settingsDescription: string;
  sound: string;
  soundDescription: string;
  start: string;
  today: string;
  time: string;
  useYourPhoto: string;
  vibration: string;
  vibrationDescription: string;
  visuals: string;
  yourBest: string;
  yourScore: string;
  dragHint: string;
  empty: string;
  block: string;
}

export const GAME_COPY: Record<GameLanguage, GameCopy> = {
  en: {
    back: 'Go back',
    backHome: 'Back Home',
    backToGame: 'Back to current game',
    backToHome: 'Back to game home',
    backToModes: 'Back to mode menu',
    bestScore: 'Best score',
    blockSkins: 'Block skins',
    candy: 'Candy',
    challengeComplete: 'Challenge complete!',
    challengeCompleteDescription: (target) =>
      `You reached the ${target} point goal.`,
    challengeFailed: 'Challenge failed',
    challengeFailedDescription: (target) =>
      `No more moves. Reach ${target} points to complete the challenge.`,
    chooseMode: 'Choose your mode',
    classic: 'Classic',
    classicDetails:
      'Begin with an empty board and play without a target until no available piece can fit.',
    classicTagline: 'Empty board · Endless score',
    clearBonus: 'Clear one full row or column: +10',
    clearCelebration: (lineCount) =>
      lineCount === 1
        ? 'BLAST!'
        : lineCount === 2
          ? 'DOUBLE BLAST!'
          : `${lineCount}× MEGA BLAST!`,
    close: 'Close',
    comboBonus:
      'Clear again within 3 placements: clear points ×2, then ×3 and higher',
    comboStatus: (combo) => `Combo ×${combo}!`,
    confirmExit: 'Exit game',
    customPhotoReady: 'Photo ready',
    customizeBlocks: 'Customize blocks',
    customizeDescription:
      'Choose a color style or turn a favorite photo into blocks.',
    daily: 'Daily Challenge',
    dailyDetails:
      "Use today's seeded opening board and reach 1,000 points to complete the challenge.",
    dailyTagline: 'Daily board · Goal 1,000',
    exitGameDescription: 'Your current board and progress will be lost.',
    exitGameTitle: 'Exit this game?',
    gameOver: 'Game over',
    gameOverDescription: 'None of the remaining pieces fits on the board.',
    rules: 'Rules',
    goal: 'Goal',
    greatGame: 'Great game!',
    hints: 'Placement hints',
    hintsDescription: 'Show valid and blocked positions while moving a piece.',
    howToPlay: 'How to play',
    howToPlaySteps: [
      'Drag a piece onto the board, or tap a piece and then a square.',
      'Fill a complete row or column to clear it.',
      'The game ends when none of the available pieces can fit.',
    ],
    language: 'Game language',
    languageDescription: 'Choose the language used throughout the game.',
    keepPlaying: 'Keep playing',
    multiLineBonus:
      'Clear 2 / 3 / 4 / 5 lines at once: +20 / +60 / +120 / +200',
    music: 'Background music',
    musicDescription: 'Play gentle background music during a game.',
    noMoreMoves: 'No more moves',
    ocean: 'Ocean',
    offlineReady: 'Offline ready',
    on: 'On',
    off: 'Off',
    photoFormats: 'PNG, JPG or WebP',
    placementPoints: 'Place a piece: +1 per block',
    playAgain: 'Play again',
    playNow: 'Play now',
    preferences: 'Preferences',
    ranking: 'Best Scores',
    rankingDescription: 'View your best score for each mode',
    readyToBlast: 'Ready to blast?',
    reduceMotion: 'Reduced motion',
    reduceMotionDescription: 'Minimize movement and transition effects.',
    relaxing: 'Relaxing!',
    resetScores: 'Reset scores',
    resetScoresDone: 'Scores reset',
    resetSettings: 'Restore default settings',
    restartGame: 'Restart game',
    score: 'Score',
    scoreRules: 'Scoring',
    selectSquare: (row, column, state) =>
      `Row ${row}, column ${column}, ${state}`,
    settings: 'Settings',
    settingsDescription: 'Adjust sound, feedback, and accessibility.',
    sixPlusLineBonus: 'Clear 6+ lines at once: +300',
    sound: 'Sound effects',
    soundDescription: 'Play feedback sounds for placements and line clears.',
    start: 'Start',
    today: 'Today',
    time: 'Timer',
    useYourPhoto: 'Use your photo',
    vibration: 'Vibration',
    vibrationDescription:
      'Use haptic feedback for placements and line clears when supported by your mobile browser.',
    visuals: 'Block appearance',
    yourBest: 'Your best score',
    yourScore: 'Your score',
    dragHint: 'Drag a piece or tap it, then choose a square',
    empty: 'empty',
    block: 'block',
  },
  zh: {
    back: '返回',
    backHome: '返回首页',
    backToGame: '返回当前游戏',
    backToHome: '返回游戏首页',
    backToModes: '返回模式首页',
    bestScore: '最高分',
    blockSkins: '方块皮肤',
    candy: '糖果',
    challengeComplete: '挑战完成！',
    challengeCompleteDescription: (target) => `你已达到 ${target} 分目标。`,
    challengeFailed: '挑战失败',
    challengeFailedDescription: (target) =>
      `已无可用落点；达到 ${target} 分才能完成今日挑战。`,
    chooseMode: '选择游戏模式',
    classic: '经典模式',
    classicDetails:
      '从空棋盘开始，没有目标分限制；持续挑战，直到所有备选方块都无法放入。',
    classicTagline: '空棋盘 · 无限计分',
    clearBonus: '消除完整一行或一列：+10 分',
    clearCelebration: (lineCount) =>
      lineCount === 1
        ? '消除！'
        : lineCount === 2
          ? '双线消除！'
          : `${lineCount} 线爆破！`,
    close: '关闭',
    comboBonus: '3 次落子内再次消除：消除分 ×2，之后 ×3 并继续提高',
    comboStatus: (combo) => `连击 ×${combo}！`,
    confirmExit: '退出游戏',
    customPhotoReady: '图片已就绪',
    customizeBlocks: '自定义方块',
    customizeDescription: '选择配色主题，或把喜欢的图片制作成方块皮肤。',
    daily: '每日挑战',
    dailyDetails:
      '使用日期种子生成今天固定的开局棋盘，达到 1000 分则挑战成功。',
    dailyTagline: '每日棋盘 · 目标 1000 分',
    exitGameDescription: '当前棋盘和本局进度将会丢失。',
    exitGameTitle: '退出本局游戏？',
    gameOver: '游戏结束',
    gameOverDescription: '剩余备选方块均无法放入棋盘。',
    rules: '游戏规则',
    goal: '目标',
    greatGame: '本局完成！',
    hints: '落点提示',
    hintsDescription: '移动方块时显示可放置或不可放置的位置。',
    howToPlay: '玩法介绍',
    howToPlaySteps: [
      '把方块拖到棋盘，或先点击方块再点击目标格。',
      '填满完整的一行或一列即可消除。',
      '所有备选方块都放不下时游戏结束。',
    ],
    language: '游戏语言',
    languageDescription: '选择整个游戏界面使用的语言。',
    keepPlaying: '继续游戏',
    multiLineBonus: '单次消除 2 / 3 / 4 / 5 条：+20 / +60 / +120 / +200 分',
    music: '背景音乐',
    musicDescription: '游戏过程中播放轻柔的背景音乐。',
    noMoreMoves: '没有可用落点',
    ocean: '海洋',
    offlineReady: '支持离线',
    on: '开启',
    off: '关闭',
    photoFormats: '支持 PNG、JPG 或 WebP',
    placementPoints: '放置方块：每格 +1 分',
    playAgain: '再玩一局',
    playNow: '开始游戏',
    preferences: '偏好设置',
    ranking: '最佳成绩',
    rankingDescription: '查看各模式的最佳成绩',
    readyToBlast: '准备好消除了吗？',
    reduceMotion: '减少动态效果',
    reduceMotionDescription: '降低移动和过渡动画，减少视觉干扰。',
    relaxing: '轻松一下！',
    resetScores: '清空分数记录',
    resetScoresDone: '分数已清空',
    resetSettings: '恢复默认设置',
    restartGame: '重新开始',
    score: '计分',
    scoreRules: '计分规则',
    selectSquare: (row, column, state) =>
      `第 ${row} 行，第 ${column} 列，${state}`,
    settings: '游戏设置',
    settingsDescription: '调整声音、反馈效果和辅助功能。',
    sixPlusLineBonus: '单次消除 6 条及以上：+300 分',
    sound: '音效',
    soundDescription: '放置方块和消除时播放轻柔的反馈音效。',
    start: '开始游戏',
    today: '今日',
    time: '计时器',
    useYourPhoto: '使用自己的图片',
    vibration: '震动反馈',
    vibrationDescription: '移动端浏览器支持时，为放置方块和消除提供触觉反馈。',
    visuals: '方块外观',
    yourBest: '你的最高分',
    yourScore: '本局得分',
    dragHint: '拖动方块，或点击方块后选择棋盘位置',
    empty: '空',
    block: '方块',
  },
};
