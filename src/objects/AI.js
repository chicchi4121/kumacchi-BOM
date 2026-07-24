/**
 * AI.js
 * ------------------------------------------------------------
 * AI対戦プレイヤーの思考ルーチン。
 * 「爆弾回避」「アイテム取得」「プレイヤー追跡」「積極的なブロック破壊」
 * 「撃破チャンスの活用」「閉じ込め戦術」を難易度別のパラメータ
 * (AI_PROFILES)に基づいて実行する。
 * 「必殺技使用」はPhase3で必殺技システム本体が実装された後に対応する。
 *
 * NOTE: 壁(HARD/SOFT/ITEM)は通り抜けられる仕様のため、移動そのものは
 * 壁に妨げられない。それでもAIが壊せるブロックを積極的に爆破するのは、
 * (1) 爆風は壁で止まる/壊せるブロックに当たると止まるため、爆風を
 *     敵に届かせるには進路上のブロックを壊しておく価値がある
 * (2) ブロック破壊そのものがスコア(撃破数と並ぶ集計対象)になる
 * という理由からで、「通り抜けられるから壊さなくてもいい」とはならない
 * ようにしてある。
 *
 * データ駆動設計（開発ルール6）: 難易度ごとの挙動差はAI_PROFILESの
 * パラメータ調整のみで表現し、ロジック本体は難易度に依存しないようにしてある。
 * ------------------------------------------------------------
 */
import { AI_DIFFICULTY, BLOCK_TYPES } from '../constants/GameConstants.js';
import { random } from '../utils/Random.js';
import { Explosion } from './Explosion.js';

// 難易度ごとの行動パラメータ（データ駆動）
const AI_PROFILES = Object.freeze({
  [AI_DIFFICULTY.EASY]: {
    decisionIntervalMs: 500, // 判断の間隔（長いほど反応が遅い）
    mistakeChance: 0.35, // 危険地帯にいても回避に失敗する確率
    bombChance: 0.35, // ブロック破壊(徘徊/進路上)を試みる確率
    killShotChance: 0.5, // 撃破チャンスを実行に移す確率
    chaseChance: 0.3, // プレイヤーを追跡する確率（それ以外は徘徊/アイテム優先）
  },
  [AI_DIFFICULTY.NORMAL]: {
    decisionIntervalMs: 350,
    mistakeChance: 0.18,
    bombChance: 0.55,
    killShotChance: 0.7,
    chaseChance: 0.55,
  },
  [AI_DIFFICULTY.HARD]: {
    decisionIntervalMs: 220,
    mistakeChance: 0.07,
    bombChance: 0.7,
    killShotChance: 0.85,
    chaseChance: 0.75,
  },
  [AI_DIFFICULTY.EXPERT]: {
    decisionIntervalMs: 120,
    mistakeChance: 0.02,
    bombChance: 0.85,
    killShotChance: 0.97,
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
    const isBlockedByBomb = (c, r) => this._isBlockedByBomb(bombs, c, r);

    // --- 1. 爆弾回避：自分がいるマスが危険地帯なら安全なマスへ逃げる ---
    const inDanger = dangerTiles.has(tileKey(here.col, here.row));
    const willMistake = random.next() < this.profile.mistakeChance;

    if (inDanger && !willMistake) {
      const fleeDir = this._findSafeDirection(player, stage, bombs, dangerTiles);
      if (fleeDir) {
        player.tryMove(fleeDir, isBlockedByBomb);
        return;
      }
    }

    const canAct = player.canPlaceBomb() && !inDanger;
    const enemies = players.filter((p) => p.isAlive && p !== player);
    const nearestEnemy = this._findNearest(here, enemies);

    // --- 2. 撃破チャンス：直線上の敵に爆風が届き、設置後も逃げ場があるなら迷わず爆弾を置く ---
    if (canAct && nearestEnemy && random.next() < this.profile.killShotChance) {
      const canHit = this._canBlastReach(stage, here, nearestEnemy, player.blastRange);
      if (canHit && this._hasEscapeRoute(stage, bombs, here, player.blastRange, dangerTiles)) {
        placeBomb(player);
        return;
      }
    }

    // --- 3. 閉じ込め戦術：隣接する敵の逃げ道が(他の爆弾で)塞がっているなら爆弾で仕留める ---
    const trappableEnemy = this._findTrappableEnemy(player, players, stage, bombs);
    if (trappableEnemy && canAct) {
      placeBomb(player);
      return;
    }

    // --- 4. アイテム取得 or プレイヤー追跡：目標を決める ---
    const nearestItem = this._findNearest(here, items);
    let target = null;
    if (nearestItem && (!nearestEnemy || random.next() > this.profile.chaseChance)) {
      target = nearestItem;
    } else if (nearestEnemy) {
      target = nearestEnemy;
    }

    if (target) {
      // 進路上に壊せるブロックがあるなら、通り抜けられるとはいえ積極的に爆破して
      // 爆風が通る道・追跡ルートを切り開く（逃げ場がある時のみ）
      if (canAct && this._hasAdjacentBreakableTowards(stage, here, target) && random.next() < this.profile.bombChance) {
        if (this._hasEscapeRoute(stage, bombs, here, player.blastRange, dangerTiles)) {
          placeBomb(player);
          return;
        }
      }

      const dir = this._chooseDirectionTowards(here, target, stage, bombs, dangerTiles, willMistake);
      if (dir) {
        player.tryMove(dir, isBlockedByBomb);
        return;
      }
    }

    // --- 5. 目的地が無い場合は徘徊しつつ、隣接する壊せるブロックがあれば積極的に爆破する ---
    if (canAct && this._hasAnyAdjacentBreakable(stage, here) && random.next() < this.profile.bombChance) {
      if (this._hasEscapeRoute(stage, bombs, here, player.blastRange, dangerTiles)) {
        placeBomb(player);
        return;
      }
    }

    const wanderDir = this._chooseRandomWalkableDirection(here, stage, bombs, dangerTiles);
    if (wanderDir) {
      player.tryMove(wanderDir, isBlockedByBomb);
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
      if (!stage.isWalkable(col, row)) continue;
      if (this._isBlockedByBomb(bombs, col, row)) continue;
      if (dangerTiles.has(tileKey(col, row))) continue;
      candidates.push(dir.name);
    }
    return candidates.length > 0 ? candidates[Math.floor(random.next() * candidates.length)] : null;
  }

  /**
   * 隣接している敵がいて、かつその敵の逃げ道が少ない場合にtrueを返す（閉じ込め戦術）。
   * NOTE: 壁は通り抜けられる仕様のため、ここでの「逃げ道が塞がっている」は
   * マップ範囲外か、他の爆弾で塞がれている場合のみを指す（壁自体は逃げ道を
   * 塞がない）。
   */
  _findTrappableEnemy(player, players, stage, bombs) {
    const enemies = players.filter((p) => p.isAlive && p !== player);
    for (const enemy of enemies) {
      const dist = manhattan(player, enemy);
      if (dist !== 1) continue; // 隣接していない

      let openEscapeRoutes = 0;
      for (const dir of DIRECTIONS) {
        const col = enemy.col + dir.dCol;
        const row = enemy.row + dir.dRow;
        if (stage.isWalkable(col, row) && !this._isBlockedByBomb(bombs, col, row)) {
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
   * `from`に爆弾を置いた場合、`to`まで爆風が届くかどうかを判定する。
   * 同じ行/列に並んでいて、距離がblastRange以内、かつ間に壁(HARD/SOFT/ITEM
   * 問わず)が挟まっていないことが条件（爆風は最初に当たったブロックで
   * 止まるため、間に何かあると届かない）。
   */
  _canBlastReach(stage, from, to, range) {
    if (from.col !== to.col && from.row !== to.row) return false;
    const dist = manhattan(from, to);
    if (dist === 0 || dist > range) return false;

    const stepCol = Math.sign(to.col - from.col);
    const stepRow = Math.sign(to.row - from.row);
    for (let step = 1; step < dist; step++) {
      const col = from.col + stepCol * step;
      const row = from.row + stepRow * step;
      if (stage.getBlockType(col, row) !== BLOCK_TYPES.EMPTY) return false;
    }
    return true;
  }

  /**
   * `from`に今まさに爆弾を置いたとして、その爆風(dry-run)にも既存の危険地帯にも
   * 他の爆弾にも当たらない隣接マスが1つでもあるかを確認する（自爆防止の簡易チェック）。
   */
  _hasEscapeRoute(stage, bombs, from, range, dangerTiles) {
    const { tiles } = Explosion.computeBlastTiles(stage, from.col, from.row, range, { dryRun: true });
    const futureBlast = new Set(tiles.map((t) => tileKey(t.col, t.row)));

    for (const dir of DIRECTIONS) {
      const col = from.col + dir.dCol;
      const row = from.row + dir.dRow;
      const key = tileKey(col, row);
      if (!stage.isWalkable(col, row)) continue;
      if (futureBlast.has(key)) continue;
      if (dangerTiles.has(key)) continue;
      if (this._isBlockedByBomb(bombs, col, row)) continue;
      return true;
    }
    return false;
  }

  /** 目標へ向かう主要な方向の隣に、壊せるブロック(SOFT/ITEM)があるかどうか */
  _hasAdjacentBreakableTowards(stage, here, target) {
    const dCol = target.col - here.col;
    const dRow = target.row - here.row;
    const preferredDirs = Math.abs(dCol) >= Math.abs(dRow)
      ? [{ dCol: dCol > 0 ? 1 : -1, dRow: 0 }, { dCol: 0, dRow: dRow > 0 ? 1 : -1 }]
      : [{ dCol: 0, dRow: dRow > 0 ? 1 : -1 }, { dCol: dCol > 0 ? 1 : -1, dRow: 0 }];

    return preferredDirs.some((d) => {
      const type = stage.getBlockType(here.col + d.dCol, here.row + d.dRow);
      return type === BLOCK_TYPES.SOFT || type === BLOCK_TYPES.ITEM;
    });
  }

  /** 隣接4マスのいずれかに壊せるブロック(SOFT/ITEM)があるかどうか */
  _hasAnyAdjacentBreakable(stage, here) {
    return DIRECTIONS.some((dir) => {
      const type = stage.getBlockType(here.col + dir.dCol, here.row + dir.dRow);
      return type === BLOCK_TYPES.SOFT || type === BLOCK_TYPES.ITEM;
    });
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
