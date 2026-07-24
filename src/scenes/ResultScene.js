/**
 * ResultScene.js
 * ------------------------------------------------------------
 * 対戦終了後のリザルト画面。
 * 順位・撃破数・爆破数・取得アイテム数・獲得経験値・ランキング更新の
 * 表示を行う予定だが、撃破数/爆破数/アイテム数/経験値の集計ロジックは
 * Phase2で実装するため、Phase1では順位（勝者）のみ確定表示する。
 * ------------------------------------------------------------
 */
import { SCENE_KEYS, SCREEN_WIDTH, SCREEN_HEIGHT } from '../constants/GameConstants.js';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.RESULT });
  }

  init(data) {
    this.winner = data?.winner ?? null;
  }

  create() {
    const centerX = SCREEN_WIDTH / 2;

    this.add.text(centerX, 80, 'リザルト', { fontSize: '32px', color: '#ffffff' }).setOrigin(0.5);

    const winnerLabel = this.winner ? `勝者: プレイヤー${this.winner.playerId}` : '引き分け';
    this.add.text(centerX, 150, winnerLabel, { fontSize: '24px', color: '#ffe066' }).setOrigin(0.5);

    // TODO(Phase2): 撃破数・爆破数・取得アイテム数・獲得経験値の集計を表示する。
    this.add
      .text(centerX, 210, '撃破数 / 爆破数 / 取得アイテム数 / 獲得経験値（Phase2実装予定）', {
        fontSize: '16px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    // TODO(Phase4): RankingSystem経由でSupabaseにランキング反映する。
    this.add
      .text(centerX, 250, 'ランキング更新（Phase4実装予定）', {
        fontSize: '16px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    const backText = this.add
      .text(centerX, 330, 'タイトルに戻る', {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#3a3a3a',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    backText.on('pointerdown', () => this.scene.start(SCENE_KEYS.TITLE));
  }
}
