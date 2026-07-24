/**
 * AI.js
 * ------------------------------------------------------------
 * AI対戦プレイヤーの思考ルーチン。
 * 「爆弾回避」「アイテム取得」「プレイヤー追跡」「閉じ込め戦術」を
 * 難易度別のパラメータ(AI_PROFILES)に基づいて実行する。
 * 「必殺技使用」はPhase3で必殺技システム本体が実装された後に対応する。
 *
 * データ駆動設計（開発ルール6）: 難易度ごとの挙動差はAI_PROFILESの
 * パラメータ調整のみで表現し、ロジック本体は難易度に依存しないようにしてある。
 * ------------------------------------------------------------
 */
import { AI_DIFFICULTY } from '../constants/GameConstants.js';
import { random } from '../utils/Random.js';

// 難易度ごとの行動パラメータ（データ駆動）
const AI_PROFILES = Object.freeze({
  [AI_DIFFICULTY.EASY]: {
    decisionIntervalMs: 500, // 判断の間隔（長いほど反応が遅い）
    mistakeChance: 0.35, // 危険地帯にいても回避に失敗する確率
    bombChance: 0.15, // ブロック破壊/追跡中に爆弾を置く確率
    chaseChance: 0.3, // プレイヤーを追跡する確率（それ以外は徘徊）
  },
  [AI_DIFFICULTY.NORMAL]: {
    decisionIntervalMs: 350,
    mistakeChance: 0.18,
    bombChance: 0.28,
    chaseChance: 0.55,
  },
  [AI_DIFFICULTY.HARD]: {
    decisionIntervalMs: 220,
    mistakeChance: 0.07,
    bombChance: 0.4,
    chaseChance: 0.75,
  },
  [AI_DIFFICULTY.EXPERT]: {
    decisionIntervalMs: 120,
    mistakeChance: 0.02,
    bombChance: 0.55,
    chaseChance: 0.9,
  },
});

const DIRECTIONS = [
  { name: 'up', dCol: 0, dRow: -1 },
  { name: 'down', dCol: 0, dRow: 1 },
  { name: 'left', dCol: -1, dRow: 0 },
  { name: 'right', dCol: 1, dRow: 0 },
];

function tileKey(col, row) {
  return `${col},${row}`;
}

function manhattan(a, b) {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

export class AI {
  /**
   * @param {Player} player - このAIが操作するPlayerインスタンス
   * @param {string} difficulty - AI_DIFFICULTYのいずれか
   */
  constructor(player, difficulty = AI_DIFFICULTY.NORMAL) {
    this.player = player;
    this.difficulty = difficulty;
    this.profile = AI_PROFILES[difficulty] ?? AI_PROFILES[AI_DIFFICULTY.NORMAL];
    this._nextDecisionAt = 0;
  }

  /**
   * 毎フレーム呼び出される。実際の意思決定は難易度に応じた間隔でのみ行う
   * （decisionIntervalMsごと）。移動自体はPlayer.tryMove()のtween完了を
   * 待つ必要があるため、意思決定のたびに1マス分の移動判断を行う。
   *
   * @param {number} time
   * @param {number} delta
   * @param {object} worldState - { stage, bombs, players, items, dangerTiles: Set<string>, placeBomb: (player)=>void }
   */
  update(time, delta, worldState) {
    const { player } = this;
    if (!player.isAlive || player.isMoving) return;
    if (time < this._nextDecisionAt) return;
    this._nextDecisionAt = time + this.profile.decisionIntervalMs;

    const { stage, bombs, players, items, dangerTiles, placeBomb } = worldState;
    const here = { col: player.col, row: player.row };

    // --- 1. 爆弾回避：自分がいるマスが危険地帯なら安全なマスへ逃げる ---
    const inDanger = dangerTiles.has(tileKey(here.col, here.row));
    const willMistake = random.next() < this.profile.mistakeChance;

    if (inDanger && !willMistake) {
      const fleeDir = this._findSafeDirection(player, stage, bombs, dangerTiles);
      if (fleeDir) {
        player.tryMove(fleeDir, (c, r) => this._isBlockedByBomb(bombs, c, r));
        return;
      }
    }

    // --- 2. 閉じ込め戦術：隣接する敵の逃げ道が少ない場合は爆弾で塞ぐ ---
    const adjacentTrappedEnemy = this._findTrappableEnemy(player, players, stage, bombs);
    if (adjacentTrappedEnemy && player.canPlaceBomb() && !inDanger) {
      placeBomb(player);
      return;
    }

    // --- 3. アイテム取得：近くにアイテムがあれば向かう ---
    const nearestItem = this._findNearest(here, items);
    // --- 4. プレイヤー追跡：生存している他プレイヤーのうち最も近い相手 ---
    const nearestEnemy = this._findNearest(
      here,
      players.filter((p) => p.isAlive && p !== player)
    );

    let target = null;
    if (nearestItem && (!nearestEnemy || random.next() > this.profile.chaseChance)) {
      target = nearestItem;
    } else if (nearestEnemy) {
      target = nearestEnemy;
    }

    if (target) {
      const dir = this._chooseDirectionTowards(here, target, stage, bombs, dangerTiles, willMistake);
      if (dir) {
        const moved = player.tryMove(dir, (c, r) => this._isBlockedByBomb(bombs, c, r));

        // 追跡中、目標のすぐ手前まで来ていてブロックを壊す必要がある/敵に隣接している場合は爆弾設置
        if (!moved && player.canPlaceBomb() && !inDanger && random.next() < this.profile.bombChance) {
          placeBomb(player);
        }
        return;
      }
    }

    // --- 5. 目的地が無い場合は徘徊しつつ、たまに爆弾を置いてブロックを開拓する ---
    const wanderDir = this._chooseRandomWalkableDirection(here, stage, bombs, dangerTiles);
    if (wanderDir) {
      player.tryMove(wanderDir, (c, r) => this._isBlockedByBomb(bombs, c, r));
    } else if (player.canPlaceBomb() && random.next() < this.profile.bombChance * 0.3) {
      placeBomb(player);
    }
  }

  _isBlockedByBomb(bombs, col, row) {
    return bombs.some((b) => !b.detonated && b.col === col && b.row === row);
  }

  /** 危険地帯ではない隣接マスの中から、より遠くへ離れられる方向を選ぶ */
  _findSafeDirection(player, stage, bombs, dangerTiles) {
    const candidates = [];
    for (const dir of DIRECTIONS) {
      const col = player.col + dir.dCol;
      const row = player.row + dir.dRow;
      if (!stage.isWalkable(col, row, { canPassSoftBlock: player.canPassSoftBlock })) continue;
      if (this._isBlockedByBomb(bombs, col, row)) continue;
      if (dangerTiles.has(tileKey(col, row))) continue;
      candidates.push(dir.name);
    }
    return candidates.length > 0 ? candidates[Math.floor(random.next() * candidates.length)] : null;
  }

  /** 隣接している敵がいて、かつその敵の逃げ道が少ない場合にtrueを返す（閉じ込め戦術） */
  _findTrappableEnemy(player, players, stage, bombs) {
    const enemies = players.filter((p) => p.isAlive && p !== player);
    for (const enemy of enemies) {
      const dist = manhattan(player, enemy);
      if (dist !== 1) continue; // 隣接していない

      let openEscapeRoutes = 0;
      for (const dir of DIRECTIONS) {
        const col = enemy.col + dir.dCol;
        const row = enemy.row + dir.dRow;
        if (stage.isWalkable(col, row, { canPassSoftBlock: enemy.canPassSoftBlock }) && !this._isBlockedByBomb(bombs, col, row)) {
          openEscapeRoutes++;
        }
      }
      // 逃げ道が1つ以下（自分がいる方向を除けばほぼ塞がっている）なら閉じ込めるチャンス
      if (openEscapeRoutes <= 1) return enemy;
    }
    return null;
  }

  /** 座標を持つオブジェクトの配列から最も近いものを返す */
  _findNearest(from, candidates) {
    if (!candidates || candidates.length === 0) return null;
    let best = null;
    let bestDist = Infinity;
    for (const c of candidates) {
      const d = manhattan(from, c);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }

  /**
   * 目標に近づく方向を選ぶ。危険地帯は基本的に避けるが、ミス発生時(willMistake)は
   * 危険を考慮せず最短方向へ進んでしまう（難易度が低いほど発生しやすい）。
   */
  _chooseDirectionTowards(here, target, stage, bombs, dangerTiles, willMistake) {
    const dCol = target.col - here.col;
    const dRow = target.row - here.row;

    // 移動距離が大きい軸を優先し、ダメなら他方の軸を試す
    const preferredOrder = Math.abs(dCol) >= Math.abs(dRow)
      ? [dCol > 0 ? 'right' : 'left', dRow > 0 ? 'down' : 'up']
      : [dRow > 0 ? 'down' : 'up', dCol > 0 ? 'right' : 'left'];

    for (const dirName of preferredOrder) {
      const dir = DIRECTIONS.find((d) => d.name === dirName);
      const col = here.col + dir.dCol;
      const row = here.row + dir.dRow;
      if (!stage.isWalkable(col, row)) continue;
      if (this._isBlockedByBomb(bombs, col, row)) continue;
      if (!willMistake && dangerTiles.has(tileKey(col, row))) continue;
      return dirName;
    }
    return null;
  }

  _chooseRandomWalkableDirection(here, stage, bombs, dangerTiles) {
    const candidates = [];
    for (const dir of DIRECTIONS) {
      const col = here.col + dir.dCol;
      const row = here.row + dir.dRow;
      if (!stage.isWalkable(col, row)) continue;
      if (this._isBlockedByBomb(bombs, col, row)) continue;
      if (dangerTiles.has(tileKey(col, row))) continue;
      candidates.push(dir.name);
    }
    return candidates.length > 0 ? candidates[Math.floor(random.next() * candidates.length)] : null;
  }
}
