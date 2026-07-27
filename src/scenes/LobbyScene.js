/**
 * LobbyScene.js
 * ------------------------------------------------------------
 * 対戦前の設定画面。参加人数・AI難易度・制限時間を選択してから
 * GameSceneへ遷移する。
 *
 * 「参加人数」は合計人数（人間 + AI）を意味する。「人間プレイヤー数」で
 * そのうち何人を人間が操作するかを指定する（2人以上でローカル対戦(PVP)、
 * 同一キーボードでのホットシート対戦。キー割り当てはGameConstants.js の
 * HUMAN_KEY_MAPS参照）。
 * マップ選択は現状「基本（迷路）」の1種類のみのため設定項目には含めない
 * （サイコロ6面ステージが実装されるPhase3で追加予定）。
 * ------------------------------------------------------------
 */
import {
  SCENE_KEYS,
  MAX_PLAYERS,
  MAX_HUMAN_PLAYERS,
  AI_DIFFICULTY,
} from '../constants/GameConstants.js';
import { soundSystem } from '../systems/SoundSystem.js';

// OnlineLobbyScene.js(オンライン対戦のロビー)でも同じ選択肢を使うためexportする。
export const DIFFICULTY_ORDER = [AI_DIFFICULTY.EASY, AI_DIFFICULTY.NORMAL, AI_DIFFICULTY.HARD, AI_DIFFICULTY.EXPERT];
export const DIFFICULTY_LABEL = Object.freeze({
  [AI_DIFFICULTY.EASY]: 'EASY',
  [AI_DIFFICULTY.NORMAL]: 'NORMAL',
  [AI_DIFFICULTY.HARD]: 'HARD',
  [AI_DIFFICULTY.EXPERT]: 'EXPERT',
});
// 末尾のnullは「制限時間なし」を表す特別値。
export const TIME_LIMIT_OPTIONS_SEC = [60, 120, 180, 300, null];

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.LOBBY });
  }

  init() {
    this.settings = {
      participantCount: 4, // 人間 + AI の合計人数
      humanCount: 1, // このうち人間が操作する人数（2以上でローカルPVP）
      difficultyIndex: DIFFICULTY_ORDER.indexOf(AI_DIFFICULTY.NORMAL),
      timeLimitIndex: TIME_LIMIT_OPTIONS_SEC.indexOf(180),
    };
  }

  /** humanCountが参加人数・最大人間人数を超えないように補正する */
  _clampHumanCount() {
    const maxHuman = Math.min(MAX_HUMAN_PLAYERS, this.settings.participantCount);
    this.settings.humanCount = Math.max(1, Math.min(maxHuman, this.settings.humanCount));
  }

  create() {
    // GameSceneはScale.RESIZEでブラウザの実サイズいっぱいに表示される
    // (main.js参照)ため、固定のSCREEN_WIDTHではなくその時点の実サイズ
    // (this.scale.width)を基準に中央揃えする。
    const centerX = this.scale.width / 2;

    this.add
      .text(centerX, 50, '対戦設定', { fontSize: '28px', color: '#ffffff' })
      .setOrigin(0.5);

    const participantRow = this._createStepperRow(
      centerX,
      120,
      '参加人数',
      () => `${this.settings.participantCount}人 (人間${this.settings.humanCount}/AI${this.settings.participantCount - this.settings.humanCount})`,
      {
        onDecrease: () => {
          this.settings.participantCount = Math.max(2, this.settings.participantCount - 1);
          this._clampHumanCount();
          humanRow.refresh();
        },
        onIncrease: () => {
          this.settings.participantCount = Math.min(MAX_PLAYERS, this.settings.participantCount + 1);
          this._clampHumanCount();
          humanRow.refresh();
        },
      }
    );

    const humanRow = this._createStepperRow(
      centerX,
      180,
      '人間プレイヤー数',
      () => `${this.settings.humanCount}人${this.settings.humanCount > 1 ? ' (ローカル対戦)' : ''}`,
      {
        onDecrease: () => {
          this.settings.humanCount = Math.max(1, this.settings.humanCount - 1);
          participantRow.refresh();
        },
        onIncrease: () => {
          const maxHuman = Math.min(MAX_HUMAN_PLAYERS, this.settings.participantCount);
          this.settings.humanCount = Math.min(maxHuman, this.settings.humanCount + 1);
          participantRow.refresh();
        },
      }
    );

    this._createStepperRow(centerX, 240, 'AI難易度', () => DIFFICULTY_LABEL[DIFFICULTY_ORDER[this.settings.difficultyIndex]], {
      onDecrease: () => {
        this.settings.difficultyIndex = Math.max(0, this.settings.difficultyIndex - 1);
      },
      onIncrease: () => {
        this.settings.difficultyIndex = Math.min(DIFFICULTY_ORDER.length - 1, this.settings.difficultyIndex + 1);
      },
    });

    this._createStepperRow(
      centerX,
      300,
      '制限時間',
      () => (TIME_LIMIT_OPTIONS_SEC[this.settings.timeLimitIndex] === null
        ? '制限時間なし'
        : `${TIME_LIMIT_OPTIONS_SEC[this.settings.timeLimitIndex]}秒`),
      {
        onDecrease: () => {
          this.settings.timeLimitIndex = Math.max(0, this.settings.timeLimitIndex - 1);
        },
        onIncrease: () => {
          this.settings.timeLimitIndex = Math.min(TIME_LIMIT_OPTIONS_SEC.length - 1, this.settings.timeLimitIndex + 1);
        },
      }
    );

    const startText = this.add
      .text(centerX, 400, '対戦開始', {
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
    const timeLimitSec = TIME_LIMIT_OPTIONS_SEC[this.settings.timeLimitIndex];
    this.scene.start(SCENE_KEYS.GAME, {
      mode: this.settings.humanCount > 1 ? 'pvp' : 'ai',
      playerCount: this.settings.humanCount,
      humanCount: this.settings.humanCount,
      aiCount: this.settings.participantCount - this.settings.humanCount,
      aiDifficulty: DIFFICULTY_ORDER[this.settings.difficultyIndex],
      timeLimitMs: timeLimitSec === null ? Infinity : timeLimitSec * 1000,
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

    return { valueText, minusBtn, plusBtn, refresh };
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
