/**
 * TitleScene.js
 * ------------------------------------------------------------
 * タイトル画面。「ゲーム開始」「AI対戦」「ランキング」「設定」
 * 「VRM変更」への導線を表示する。
 * Phase1では「ゲーム開始」「AI対戦」からGameSceneへ遷移できる
 * ところまでを実装し、その他は将来フェーズ向けの導線のみ表示する。
 * ------------------------------------------------------------
 */
import { SCENE_KEYS, SCREEN_WIDTH, SCREEN_HEIGHT } from '../constants/GameConstants.js';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.TITLE });
  }

  create() {
    const centerX = SCREEN_WIDTH / 2;

    this.add
      .text(centerX, 90, 'くまっちボム！', { fontSize: '40px', color: '#ffffff' })
      .setOrigin(0.5);

    this._createMenuButton(centerX, 200, 'ゲーム開始 (PVP)', () => {
      this.scene.start(SCENE_KEYS.GAME, { mode: 'pvp', playerCount: 2, aiCount: 0 });
    });

    this._createMenuButton(centerX, 260, 'AI対戦', () => {
      this.scene.start(SCENE_KEYS.GAME, { mode: 'ai', playerCount: 1, aiCount: 2 });
    });

    this._createMenuButton(centerX, 320, 'ランキング（Phase4実装予定）', () => {}, true);
    this._createMenuButton(centerX, 380, '設定（Phase2実装予定）', () => {}, true);
    this._createMenuButton(centerX, 440, 'VRM変更（Phase3実装予定）', () => {}, true);

    this.add
      .text(centerX, SCREEN_HEIGHT - 30, '操作: ↑↓←→ 移動 / Space 爆弾設置 / Esc ポーズ', {
        fontSize: '14px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);
  }

  _createMenuButton(x, y, label, onClick, disabled = false) {
    const text = this.add
      .text(x, y, label, {
        fontSize: '22px',
        color: disabled ? '#666666' : '#ffffff',
        backgroundColor: disabled ? '#222222' : '#3a3a3a',
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0.5);

    if (disabled) return text;

    text.setInteractive({ useHandCursor: true });
    text.on('pointerover', () => text.setStyle({ backgroundColor: '#55606e' }));
    text.on('pointerout', () => text.setStyle({ backgroundColor: '#3a3a3a' }));
    text.on('pointerdown', onClick);
    return text;
  }
}
