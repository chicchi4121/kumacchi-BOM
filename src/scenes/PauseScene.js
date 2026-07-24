/**
 * PauseScene.js
 * ------------------------------------------------------------
 * Escキーで呼び出されるポーズ画面。GameSceneの上にオーバーレイ表示し、
 * 再開または降参してタイトルへ戻る導線を提供する。
 * ------------------------------------------------------------
 */
import { SCENE_KEYS, SCREEN_WIDTH, SCREEN_HEIGHT } from '../constants/GameConstants.js';

export class PauseScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.PAUSE });
  }

  create() {
    const overlay = this.add.rectangle(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, 0x000000, 0.6);
    overlay.setOrigin(0, 0);

    this.add
      .text(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 40, 'ポーズ中', {
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const resumeText = this.add
      .text(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 20, '再開する (Esc)', {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#3a3a3a',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    resumeText.on('pointerdown', () => this._resume());

    const titleText = this.add
      .text(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 70, 'タイトルに戻る', {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#3a3a3a',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    titleText.on('pointerdown', () => this._backToTitle());

    this.input.keyboard.once('keydown-ESC', () => this._resume());
  }

  _resume() {
    this.scene.stop();
    this.scene.resume(SCENE_KEYS.GAME);
  }

  _backToTitle() {
    this.scene.stop(SCENE_KEYS.GAME);
    this.scene.stop();
    this.scene.start(SCENE_KEYS.TITLE);
  }
}
