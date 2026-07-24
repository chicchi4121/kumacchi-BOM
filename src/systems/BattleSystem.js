/**
 * BattleSystem.js
 * ------------------------------------------------------------
 * 対戦の勝敗判定・進行を統括するシステム。
 * GameSceneはこのシステムに「プレイヤーがやられた」等のイベントを
 * 通知し、本システムが勝利条件（最後の1人 / 時間切れ）を判定する。
 * ------------------------------------------------------------
 */
export class BattleSystem {
  /**
   * @param {Array<Player>} players
   * @param {object} options - { timeLimitMs }
   */
  constructor(players, options = {}) {
    this.players = players;
    this.timeLimitMs = options.timeLimitMs ?? 180000; // デフォルト3分
    this.elapsedMs = 0;
    this.isOver = false;
    this.winner = null;
  }

  update(delta) {
    if (this.isOver) return;
    this.elapsedMs += delta;

    const alivePlayers = this.players.filter((p) => p.isAlive);

    if (alivePlayers.length <= 1 && this.players.length > 1) {
      this._finish(alivePlayers[0] ?? null);
      return;
    }

    if (this.elapsedMs >= this.timeLimitMs) {
      this._finish(this._decideWinnerByScore());
    }
  }

  /** 時間切れ時: 残機 → スコア → 抽選 の優先順位で勝者を決定する */
  _decideWinnerByScore() {
    const alive = this.players.filter((p) => p.isAlive);
    if (alive.length === 0) return null;

    const maxLives = Math.max(...alive.map((p) => p.lives));
    const topByLives = alive.filter((p) => p.lives === maxLives);
    if (topByLives.length === 1) return topByLives[0];

    // TODO(Phase2): スコア(撃破数・爆破数等)による判定を実装する。
    // 現状はスコアが未実装のため、同点の場合は抽選（ランダム選出）とする。
    return topByLives[Math.floor(Math.random() * topByLives.length)];
  }

  _finish(winner) {
    this.isOver = true;
    this.winner = winner;
  }
}
