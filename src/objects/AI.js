/**
 * AI.js
 * ------------------------------------------------------------
 * AI対戦プレイヤーの思考ルーチンを管理するクラス（Phase2実装予定）。
 *
 * 本フェーズ(Phase1)では、AISystem.jsから難易度別の行動パラメータを
 * 受け取れるようコンストラクタの形だけ用意しておく。
 * 実際の「爆弾回避」「アイテム取得」「追跡」「閉じ込め戦術」
 * 「必殺技使用」等の行動決定ロジックはPhase2で実装する。
 * ------------------------------------------------------------
 */
import { AI_DIFFICULTY } from '../constants/GameConstants.js';

export class AI {
  /**
   * @param {Player} player - このAIが操作するPlayerインスタンス
   * @param {string} difficulty - AI_DIFFICULTYのいずれか
   */
  constructor(player, difficulty = AI_DIFFICULTY.NORMAL) {
    this.player = player;
    this.difficulty = difficulty;
  }

  /**
   * 毎フレーム呼び出され、次の行動を決定する。
   * TODO(Phase2): 爆弾回避・アイテム取得・追跡・閉じ込め戦術・必殺技使用を実装。
   * @param {number} time
   * @param {number} delta
   * @param {object} worldState - Stage, Bombs, 他プレイヤー等の参照
   */
  update(time, delta, worldState) {
    // Phase1では未実装（常に待機）。
  }
}
