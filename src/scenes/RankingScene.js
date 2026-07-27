/**
 * RankingScene.js
 * ------------------------------------------------------------
 * 対戦結果ランキングを表示する画面。RankingSystem経由でSupabaseの
 * `rankings`テーブル(supabase/schema.sql参照)から取得する。
 * Supabase未設定・取得失敗時はこの端末のローカル対戦履歴を表示する
 * (RankingSystem.fetchRanking()側でフォールバック済み)。
 * ------------------------------------------------------------
 */
import { SCENE_KEYS, SCREEN_WIDTH, SCREEN_HEIGHT } from '../constants/GameConstants.js';
import { soundSystem } from '../systems/SoundSystem.js';
import { rankingSystem } from '../systems/RankingSystem.js';
import { isSupabaseConfigured } from '../config/supabaseConfig.js';

const MODE_LABEL = Object.freeze({ ai: 'AI戦', pvp: 'ローカルPVP', online: 'オンライン' });

export class RankingScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.RANKING });
  }

  async create() {
    const centerX = SCREEN_WIDTH / 2;
    this._sceneActive = true;
    this.events.once('shutdown', () => {
      this._sceneActive = false;
    });

    this.add.text(centerX, 40, 'ランキング', { fontSize: '28px', color: '#ffffff' }).setOrigin(0.5);

    const sourceLabel = isSupabaseConfigured()
      ? 'Supabase上の全対戦結果(exp上位20件)'
      : 'この端末での対戦履歴のみ(Supabase未設定)';
    this.add.text(centerX, 75, sourceLabel, { fontSize: '13px', color: '#88ddaa' }).setOrigin(0.5);

    this.listText = this.add
      .text(centerX, 110, '読み込み中...', { fontSize: '14px', color: '#ffffff', align: 'left', lineSpacing: 6 })
      .setOrigin(0.5, 0);

    const backBtn = this.add
      .text(centerX, SCREEN_HEIGHT - 40, 'タイトルに戻る', {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#3a3a3a',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    backBtn.on('pointerdown', () => {
      soundSystem.playSE('button');
      this.scene.start(SCENE_KEYS.TITLE);
    });

    try {
      const rows = await rankingSystem.fetchRanking(20);
      if (!this._sceneActive) return;
      this._renderRows(rows);
    } catch (e) {
      console.error('[RankingScene] ランキングの取得に失敗しました。', e);
      if (this._sceneActive) this.listText.setText('ランキングの取得に失敗しました。');
    }
  }

  _renderRows(rows) {
    if (!rows || rows.length === 0) {
      this.listText.setText('まだ対戦記録がありません。対戦するとここに記録されます。');
      return;
    }
    const header = '順位 プレイヤー名           モード       撃破 exp';
    const lines = rows.map((row, i) => {
      const name = String(row.player_name ?? row.playerName ?? 'プレイヤー').padEnd(14, '　').slice(0, 14);
      const mode = (MODE_LABEL[row.mode] ?? row.mode ?? '-').padEnd(8, '　');
      const kills = String(row.kills ?? 0).padStart(3, ' ');
      const exp = String(row.exp ?? 0).padStart(6, ' ');
      return `${String(i + 1).padStart(2, ' ')}位 ${name} ${mode} ${kills} ${exp}`;
    });
    this.listText.setText([header, ...lines].join('\n'));
  }
}
