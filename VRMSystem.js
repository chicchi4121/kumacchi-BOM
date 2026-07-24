/**
 * BattleSystem.js
 * ------------------------------------------------------------
 * 対戦の勝敗判定・進行・順位確定を統括するシステム。
 * GameSceneはこのシステムに「プレイヤーがやられた」等のイベントを
 * 通知し、本システムが勝利条件（最後の1人 / 時間切れ）と最終順位を判定する。
 * ------------------------------------------------------------
 */
import { random } from '../utils/Random.js';

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
    this.deathOrder = []; // 死亡した順（先に死んだプレイヤーが先頭）
    this.finalRanks = new Map(); // playerId -> 最終順位(1が1位)
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

  /** GameSceneはプレイヤーが死亡した瞬間にこれを呼び出す */
  notifyPlayerDied(player) {
    if (!this.deathOrder.includes(player)) {
      this.deathOrder.push(player);
    }
  }

  /**
   * 進行中の暫定順位を返す。生存中は「まだ確定していない(null)」を返し、
   * 死亡したプレイヤーには「その時点で何位が確定したか」を返す
   * （最後まで生き残った1人が1位、最初に死んだプレイヤーが最下位）。
   */
  getLiveRank(player) {
    if (player.isAlive) {
      const aliveCount = this.players.filter((p) => p.isAlive).length;
      return aliveCount <= 1 ? 1 : null;
    }
    const deathIndex = this.deathOrder.indexOf(player);
    if (deathIndex === -1) return null;
    return this.players.length - deathIndex;
  }

  /** 時間切れ時: 残機 → スコア(撃破数) → 抽選 の優先順位で勝者を決定する */
  _decideWinnerByScore() {
    const alive = this.players.filter((p) => p.isAlive);
    if (alive.length === 0) return null;

    const maxLives = Math.max(...alive.map((p) => p.lives));
    let candidates = alive.filter((p) => p.lives === maxLives);
    if (candidates.length === 1) return candidates[0];

    // 残機が同点の場合は撃破数(スコア)で判定する
    const maxKills = Math.max(...candidates.map((p) => p.stats?.kills ?? 0));
    candidates = candidates.filter((p) => (p.stats?.kills ?? 0) === maxKills);
    if (candidates.length === 1) return candidates[0];

    // それでも同点の場合は抽選（ランダム選出）
    return candidates[random.nextInt(0, candidates.length)];
  }

  _finish(winner) {
    this.isOver = true;
    this.winner = winner;
    this._computeFinalRanks(winner);
  }

  /** 勝者を1位、時間切れ時の他の生存者を残機/撃破数で順位付けし、
   *  死亡済みプレイヤーは死亡順(直近に死んだ方が上位)で埋める。 */
  _computeFinalRanks(winner) {
    const ranked = [];
    if (winner) ranked.push(winner);

    const aliveOthers = this.players.filter((p) => p.isAlive && p !== winner);
    aliveOthers.sort((a, b) => {
      if (b.lives !== a.lives) return b.lives - a.lives;
      return (b.stats?.kills ?? 0) - (a.stats?.kills ?? 0);
    });
    ranked.push(...aliveOthers);

    ranked.push(...[...this.deathOrder].reverse());

    this.finalRanks = new Map();
    ranked.forEach((p, i) => this.finalRanks.set(p.playerId, i + 1));
  }
}
