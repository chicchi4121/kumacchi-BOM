/**
 * LobbyScene.js
 * ------------------------------------------------------------
 * 対戦前の設定画面。参加人数・AI難易度・制限時間を選択してから
 * GameSceneへ遷移する。
 *
 * NOTE: ローカルでの複数人操作（ホットシート対戦）には未対応のため、
 * 「参加人数」は合計人数（自分1人 + 残りは全てAI）を意味する。
 * マップ選択は現状「基本（迷路）」の1種類のみのため設定項目には含めない
 * （サイコロ6面ステージが実装されるPhase3で追加予定）。
 * ------------------------------------------------------------
 */
import { SCENE_KEYS, SCREEN_WIDTH, SCREEN_HEIGHT, MAX_PLAYERS, AI_DIFFICULTY } from '../constants/GameConstants.js';
import { soundSystem } from '../systems/SoundSystem.js';

const DIFFICULTY_ORDER = [AI_DIFFICULTY.EASY, AI_DIFFICULTY.NORMAL, AI_DIFFICULTY.HARD, AI_DIFFICULTY.EXPERT];
const DIFFICULTY_LABEL = Object.freeze({
  [AI_DIFFICULTY.EASY]: 'EASY',
  [AI_DIFFICULTY.NORMAL]: 'NORMAL',
  [AI_DIFFICULTY.HARD]: 'HARD',
  [AI_DIFFICULTY.EXPERT]: 'EXPERT',
});
const TIME_LIMIT_OPTIONS_SEC = [60, 120, 180, 300];

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.LOBBY });
  }

  init() {
    this.settings = {
      participantCount: 4, // 自分 + AI の合計人数
      difficultyIndex: DIFFICULTY_ORDER.indexOf(AI_DIFFICULTY.NORMAL),
      timeLimitIndex: TIME_LIMIT_OPTIONS_SEC.indexOf(180),
    };
  }

  create() {
    const centerX = SCREEN_WIDTH / 2;

    this.add
      .text(centerX, 50, '対戦設定', { fontSize: '28px', color: '#ffffff' })
      .setOrigin(0.5);

    this._createStepperRow(centerX, 140, '参加人数', () => `${this.settings.participantCount}人 (AI${this.settings.participantCount - 1})`, {
      onDecrease: () => {
        this.settings.participantCount = Math.max(2, this.settings.participantCount - 1);
      },
      onIncrease: () => {
        this.settings.participantCount = Math.min(MAX_PLAYERS, this.settings.participantCount + 1);
      },
    });

    this._createStepperRow(centerX, 210, 'AI難易度', () => DIFFICULTY_LABEL[DIFFICULTY_ORDER[this.settings.difficultyIndex]], {
      onDecrease: () => {
        this.settings.difficultyIndex = Math.max(0, this.settings.difficultyIndex - 1);
      },
      onIncrease: () => {
        this.settings.difficultyIndex = Math.min(DIFFICULTY_ORDER.length - 1, this.settings.difficultyIndex + 1);
      },
    });

    this._createStepperRow(centerX, 280, '制限時間', () => `${TIME_LIMIT_OPTIONS_SEC[this.settings.timeLimitIndex]}秒`, {
      onDecrease: () => {
        this.settings.timeLimitIndex = Math.max(0, this.settings.timeLimitIndex - 1);
      },
      onIncrease: () => {
        this.settings.timeLimitIndex = Math.min(TIME_LIMIT_OPTIONS_SEC.length - 1, this.settings.timeLimitIndex + 1);
      },
    });

    const startText = this.add
      .text(centerX, 380, '対戦開始', {
        fontSize: '24px',
        color: '#ffffff',
        backgroundColor: '#3a3a3a',
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    startText.on('pointerdown', () => {
      soundSystem.playSE('button');
      this._startGame();
    });

    const backText = this.add
      .text(centerX, 440, 'タイトルに戻る', {
        fontSize: '18px',
        color: '#cccccc',
        backgroundColor: '#2a2a2a',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    backText.on('pointerdown', () => {
      soundSystem.playSE('button');
      this.scene.start(SCENE_KEYS.TITLE);
    });
  }

  _startGame() {
    this.scene.start(SCENE_KEYS.GAME, {
      mode: 'ai',
      playerCount: 1,
      aiCount: this.settings.participantCount - 1,
      aiDifficulty: DIFFICULTY_ORDER[this.settings.difficultyIndex],
      timeLimitMs: TIME_LIMIT_OPTIONS_SEC[this.settings.timeLimitIndex] * 1000,
    });
  }

  /** ラベル・現在値・+-ボタンからなる1行の設定項目を作成する */
  _createStepperRow(x, y, label, getValueLabel, { onDecrease, onIncrease }) {
    this.add.text(x - 220, y, label, { fontSize: '18px', color: '#ffffff' }).setOrigin(0, 0.5);

    const valueText = this.add
      .text(x + 30, y, getValueLabel(), { fontSize: '18px', color: '#ffe066' })
      .setOrigin(0.5);

    const refresh = () => valueText.setText(getValueLabel());

    const minusBtn = this._createStepperButton(x - 60, y, '-', () => {
      onDecrease();
      refresh();
    });
    const plusBtn = this._createStepperButton(x + 150, y, '+', () => {
      onIncrease();
      refresh();
    });

    return { valueText, minusBtn, plusBtn };
  }

  _createStepperButton(x, y, label, onClick) {
    const btn = this.add
      .text(x, y, label, {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#3a3a3a',
        padding: { x: 12, y: 4 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => {
      soundSystem.playSE('button');
      onClick();
    });
    return btn;
  }
}
