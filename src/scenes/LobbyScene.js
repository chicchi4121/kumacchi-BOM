/**
 * LobbyScene.js
 * ------------------------------------------------------------
 * 対戦前の設定画面（人数・AI人数・マップ・制限時間の選択）。
 * Phase1では画面遷移の骨組みのみ用意し、詳細なUI実装はPhase2で行う。
 * 現状TitleSceneから直接GameSceneへ遷移しているため未使用だが、
 * 将来的な詳細設定画面としてここに実装を追加していく。
 * ------------------------------------------------------------
 */
import { SCENE_KEYS, SCREEN_WIDTH, SCREEN_HEIGHT } from '../constants/GameConstants.js';

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.LOBBY });
  }

  create() {
    const centerX = SCREEN_WIDTH / 2;
    this.add
      .text(centerX, SCREEN_HEIGHT / 2 - 20, 'ロビー画面（Phase2で詳細設定を実装予定）', {
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const startText = this.add
      .text(centerX, SCREEN_HEIGHT / 2 + 40, 'ゲーム開始', {
        fontSize: '22px',
        color: '#ffffff',
        backgroundColor: '#3a3a3a',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    startText.on('pointerdown', () => {
      this.scene.start(SCENE_KEYS.GAME, { mode: 'ai', playerCount: 1, aiCount: 2 });
    });
  }
}
