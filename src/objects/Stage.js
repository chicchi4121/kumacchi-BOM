/**
 * Stage.js
 * ------------------------------------------------------------
 * 迷路マップの生成・管理を担当するクラス。
 * 描画(Phaser)には依存せず、純粋なデータ（2次元配列）としての
 * マップ状態のみを扱う。実際の描画はGameScene側で行う。
 *
 * 開発ルール7への準備として、将来「サイコロ6面ステージ」等の
 * 他形状ステージを追加しやすいよう、Stageは「1枚の面」を表す
 * 単位として設計してある（面を6つ束ねればサイコロ型になる）。
 * ------------------------------------------------------------
 */
import {
  GRID_COLS,
  GRID_ROWS,
  BLOCK_TYPES,
  ITEM_BLOCK_RATE,
  SAFE_ZONE_RADIUS,
  MAX_PLAYERS,
  ITEM_TYPES,
} from '../constants/GameConstants.js';
import { Collision } from '../utils/Collision.js';
import { random } from '../utils/Random.js';

// 出現しうるアイテム種別一覧（データ駆動：ここに追加するだけで出現候補が増える）
const SPAWNABLE_ITEM_TYPES = Object.values(ITEM_TYPES);

function tileKey(col, row) {
  return `${col},${row}`;
}

// プレイヤーの初期出現候補地点（四隅＋上下辺の中央）。
// 座標は「内側1マス」を基準にしており、外周は必ずHARDブロックで囲む。
function buildStartCandidates(cols, rows) {
  const midCol = Math.floor(cols / 2);
  return [
    { col: 1, row: 1 },
    { col: cols - 2, row: 1 },
    { col: 1, row: rows - 2 },
    { col: cols - 2, row: rows - 2 },
    { col: midCol, row: 1 },
    { col: midCol, row: rows - 2 },
  ].slice(0, MAX_PLAYERS);
}

export class Stage {
  /**
   * @param {number} cols
   * @param {number} rows
   */
  constructor(cols = GRID_COLS, rows = GRID_ROWS) {
    this.cols = cols;
    this.rows = rows;
    this.grid = [];
    this.startPositions = [];
    this.itemTypeByTile = new Map(); // "col,row" -> ITEM_TYPES.* （ITEMブロックの中身を事前決定しておく）
  }

  /**
   * 迷路をランダム生成する。毎試合呼び出すことで完全ランダムなマップになる。
   * @param {number} playerCount - 参加人数（安全地帯を確保する数）
   */
  generate(playerCount = 1) {
    const { cols, rows } = this;
    const grid = [];
    this.itemTypeByTile = new Map();

    for (let row = 0; row < rows; row++) {
      const line = [];
      for (let col = 0; col < cols; col++) {
        const type = this._decideBlockType(col, row, cols, rows);
        line.push(type);
        if (type === BLOCK_TYPES.ITEM) {
          this.itemTypeByTile.set(tileKey(col, row), random.pick(SPAWNABLE_ITEM_TYPES));
        }
      }
      grid.push(line);
    }

    this.grid = grid;
    this.startPositions = buildStartCandidates(cols, rows).slice(0, Math.max(1, playerCount));

    // 各プレイヤー開始地点周辺は安全地帯として必ず通行可能にする。
    for (const pos of this.startPositions) {
      this._clearSafeZone(pos.col, pos.row);
    }

    return this.grid;
  }

  /** 1マスのブロック種別を決定する（迷路の基本パターン＋ランダム配置） */
  _decideBlockType(col, row, cols, rows) {
    const isBorder = col === 0 || row === 0 || col === cols - 1 || row === rows - 1;
    if (isBorder) return BLOCK_TYPES.HARD;

    // 偶数列・偶数行の交点は柱として壊せないブロックを配置（伝統的なボンバーマン配置）
    const isPillar = col % 2 === 0 && row % 2 === 0;
    if (isPillar) return BLOCK_TYPES.HARD;

    // それ以外はランダムに「空白」「壊せるブロック」「アイテム入りブロック」を配置
    if (random.chance(0.25)) return BLOCK_TYPES.EMPTY;
    if (random.chance(ITEM_BLOCK_RATE)) return BLOCK_TYPES.ITEM;
    return BLOCK_TYPES.SOFT;
  }

  /** プレイヤー開始地点とその周辺(SAFE_ZONE_RADIUS)を必ず通行可能にする */
  _clearSafeZone(col, row) {
    for (let dRow = -SAFE_ZONE_RADIUS; dRow <= SAFE_ZONE_RADIUS; dRow++) {
      for (let dCol = -SAFE_ZONE_RADIUS; dCol <= SAFE_ZONE_RADIUS; dCol++) {
        const c = col + dCol;
        const r = row + dRow;
        if (!Collision.inBounds(c, r, this.cols, this.rows)) continue;
        // 外周(HARD境界)や柱(HARD)はそのまま維持し、それ以外は空白にする。
        const isBorder = c === 0 || r === 0 || c === this.cols - 1 || r === this.rows - 1;
        const isPillar = c % 2 === 0 && r % 2 === 0;
        if (isBorder || isPillar) continue;
        this.grid[r][c] = BLOCK_TYPES.EMPTY;
        this.itemTypeByTile.delete(tileKey(c, r));
      }
    }
  }

  getBlockType(col, row) {
    if (!Collision.inBounds(col, row, this.cols, this.rows)) return BLOCK_TYPES.HARD;
    return this.grid[row][col];
  }

  isWalkable(col, row, options = {}) {
    return Collision.isWalkable(this.grid, col, row, options);
  }

  /**
   * ブロックを破壊する。
   * @returns {{ destroyed: boolean, spawnItem: boolean, itemType: ?string }}
   */
  breakBlock(col, row) {
    const type = this.getBlockType(col, row);
    if (type !== BLOCK_TYPES.SOFT && type !== BLOCK_TYPES.ITEM) {
      return { destroyed: false, spawnItem: false, itemType: null };
    }
    const spawnItem = type === BLOCK_TYPES.ITEM;
    const itemType = spawnItem ? this.itemTypeByTile.get(tileKey(col, row)) ?? null : null;
    this.grid[row][col] = BLOCK_TYPES.EMPTY;
    this.itemTypeByTile.delete(tileKey(col, row));
    return { destroyed: true, spawnItem, itemType };
  }

  getStartPositions() {
    return this.startPositions;
  }
}
