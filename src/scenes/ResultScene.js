/**
 * ResultScene.js
 * ------------------------------------------------------------
 * 対戦終了後のリザルト画面。
 * 順位・撃破数・爆破数・取得アイテム数・獲得経験値を実データで表示する。
 * 経験値計算式はEXP_PER_*定数（GameConstants.js）で一元管理している。
 *
 * ランキング更新（Supabase送信）はPhase4実装予定のため引き続き導線のみ。
 * ------------------------------------------------------------
 */
import {
  SCENE_KEYS,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  EXP_PER_KILL,
  EXP_PER_BOMB_EXPLODED,
  EXP_PER_ITEM_COLLECTED,
  EXP_WIN_BONUS,
} from '../constants/GameConstants.js';
import { soundSystem } from '../systems/SoundSystem.js';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.RESULT });
  }

  init(data) {
    this.winnerPlayerId = data?.winner?.playerId ?? null;
    // PVP(人間2人以上)では勝敗判定・「あなた」表示の対象が複数人になりうるため配列で保持する。
    this.humanPlayerIds = data?.humanPlayerIds ?? (data?.humanPlayerId != null ? [data.humanPlayerId] : []);
    this.players = data?.players ?? [];
    this.finalRanks = data?.finalRanks ?? {};
  }

  create() {
    const centerX = SCREEN_WIDTH / 2;
    const isHumanWinner = this.winnerPlayerId !== null && this.humanPlayerIds.includes(this.winnerPlayerId);
    const isPvp = this.humanPlayerIds.length > 1;
    soundSystem.playSE(this.players.length > 0 ? (isHumanWinner ? 'victory' : 'defeat') : 'button');

    this.add.text(centerX, 50, 'リザルト', { fontSize: '32px', color: '#ffffff' }).setOrigin(0.5);

    // PVPでは「あなた」という単一人称が成立しないため、勝者が人間なら
    // その旨だけを添える（例:「勝者: プレイヤー2（プレイヤー）」）。
    const winnerLabel = this.winnerPlayerId
      ? `勝者: プレイヤー${this.winnerPlayerId}${isHumanWinner ? (isPvp ? '（プレイヤー）' : '（あなた）') : ''}`
      : '引き分け';
    this.add.text(centerX, 95, winnerLabel, { fontSize: '22px', color: '#ffe066' }).setOrigin(0.5);

    this._renderTable(centerX, 140);

    // TODO(Phase4): RankingSystem経由でSupabaseにランキング反映する。
    this.add
      .text(centerX, SCREEN_HEIGHT - 90, 'ランキング更新（Phase4実装予定）', {
        fontSize: '14px',
        color: '#888888',
      })
      .setOrigin(0.5);

    const backText = this.add
      .text(centerX, SCREEN_HEIGHT - 40, 'タイトルに戻る', {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#3a3a3a',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    backText.on('pointerdown', () => {
      soundSystem.playSE('button');
      soundSystem.stopBGM();
      this.scene.start(SCENE_KEYS.TITLE);
    });
  }

  _calcExp(stats, isWinner) {
    return (
      stats.kills * EXP_PER_KILL +
      stats.bombsExploded * EXP_PER_BOMB_EXPLODED +
      stats.itemsCollected * EXP_PER_ITEM_COLLECTED +
      (isWinner ? EXP_WIN_BONUS : 0)
    );
  }

  _renderTable(centerX, startY) {
    const rows = this.players
      .map((p) => ({
        ...p,
        rank: this.finalRanks[p.playerId] ?? this.finalRanks[String(p.playerId)] ?? '-',
        exp: this._calcExp(p.stats, p.playerId === this.winnerPlayerId),
      }))
      .sort((a, b) => (a.rank === '-' ? 99 : a.rank) - (b.rank === '-' ? 99 : b.rank));

    const header = ['順位', 'プレイヤー', '撃破', '爆破', 'アイテム', '経験値'];
    const colX = [-260, -190, -60, 10, 80, 170];

    header.forEach((label, i) => {
      this.add
        .text(centerX + colX[i], startY, label, { fontSize: '14px', color: '#aaaaaa' })
        .setOrigin(0, 0.5);
    });

    rows.forEach((row, i) => {
      const y = startY + 28 + i * 26;
      const isHuman = this.humanPlayerIds.includes(row.playerId);
      const nameLabel = `プレイヤー${row.playerId}${row.isAI ? '(AI)' : ''}${isHuman ? ' ★' : ''}`;
      const color = isHuman ? '#ffe066' : '#ffffff';
      const values = [`${row.rank}位`, nameLabel, row.stats.kills, row.stats.bombsExploded, row.stats.itemsCollected, row.exp];

      values.forEach((value, colIdx) => {
        this.add
          .text(centerX + colX[colIdx], y, String(value), { fontSize: '15px', color })
          .setOrigin(0, 0.5);
      });
    });
  }
}
