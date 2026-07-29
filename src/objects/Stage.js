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
  ITEM_SPAWN_WEIGHTS,
} from '../constants/GameConstants.js';
import { Collision } from '../utils/Collision.js';
import { random } from '../utils/Random.js';

// 出現しうるアイテム種別一覧（データ駆動：ITEM_SPAWN_WEIGHTS(GameConstants.js)
// の重みに従って各タイプを複製した「候補プール」から等確率でpickする方式。
// 例えば重み2のタイプは重み1のタイプの2倍出現しやすくなる。「壁抜け(GHOST)
// の出現量を半分にしてほしい」という要望にはGHOSTの重みを他の半分にする
// ことで対応した）
const SPAWNABLE_ITEM_TYPES = Object.entries(ITEM_SPAWN_WEIGHTS).flatMap(([type, weight]) =>
  Array(weight).fill(type)
);

function tileKey(col, row) {
  return `${col},${row}`;
}

// プレイヤーの初期出現候補地点（四隅＋上下辺の中央）。
// 座標は「内側1マス」を基準にしており、外周は必ずHARDブロックで囲む。
// CubeStage.js(PVP時に複数の人間プレイヤーを同じ面に集める用途)からも
// 再利用するためexportしている。
export function buildStartCandidates(cols, rows) {
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

  /**
   * 1マスのブロック種別を決定する（迷路の基本パターン＋ランダム配置）。
   *
   * 「壊せないブロックを1マスあけて全マスにおいてほしい」への対応:
   * 以前は偶数列・偶数行の"交点"だけを柱にしていたため(伝統的な
   * ボンバーマン配置)、壊せない柱は盤面全体のうちごく一部(11x11なら
   * 内側9x9のうち16マスのみ)にしか無かった。今回、盤面全体(全マス)に
   * わたって1マスおきに壊せないブロックが現れるチェッカーボード
   * (col+row)%2===0)パターンに変更し、より密な壊せない構造にした。
   */
  _decideBlockType(col, row, cols, rows) {
    const isBorder = col === 0 || row === 0 || col === cols - 1 || row === rows - 1;
    if (isBorder) return BLOCK_TYPES.HARD;

    // チェッカーボード状(1マスおき)に柱として壊せないブロックを配置する。
    const isPillar = (col + row) % 2 === 0;
    if (isPillar) return BLOCK_TYPES.HARD;

    // それ以外はランダムに「空白」「壊せるブロック」「アイテム入りブロック」を配置
    if (random.chance(0.25)) return BLOCK_TYPES.EMPTY;
    if (random.chance(ITEM_BLOCK_RATE)) return BLOCK_TYPES.ITEM;
    return BLOCK_TYPES.SOFT;
  }

  /**
   * プレイヤー開始地点とその周辺(SAFE_ZONE_RADIUS)を必ず通行可能にする。
   *
   * 【重要】柱パターンをチェッカーボード((col+row)%2===0)に変更したことで、
   * 開始地点そのものの座標が(たまたま)柱の条件に一致してしまう場合が
   * ある(例: 面の中央(centerCol,centerRow)がチェッカーボードの黒マスに
   * あたるケース)。周辺の安全地帯マスは従来通り柱・外周の構造を維持して
   * 良いが、プレイヤーが実際に立つ開始地点そのもの(dRow=0,dCol=0)だけは、
   * 柱・外周の判定に関わらず必ず空白にする(でないとプレイヤーが壁の中に
   * 出現してしまう事故になる)。
   */
  _clearSafeZone(col, row) {
    for (let dRow = -SAFE_ZONE_RADIUS; dRow <= SAFE_ZONE_RADIUS; dRow++) {
      for (let dCol = -SAFE_ZONE_RADIUS; dCol <= SAFE_ZONE_RADIUS; dCol++) {
        const c = col + dCol;
        const r = row + dRow;
        if (!Collision.inBounds(c, r, this.cols, this.rows)) continue;
        const isStartCell = dRow === 0 && dCol === 0;
        if (isStartCell) {
          this.grid[r][c] = BLOCK_TYPES.EMPTY;
          this.itemTypeByTile.delete(tileKey(c, r));
          continue;
        }
        // 外周(HARD境界)や柱(HARD)はそのまま維持し、それ以外は空白にする。
        const isBorder = c === 0 || r === 0 || c === this.cols - 1 || r === this.rows - 1;
        const isPillar = (c + r) % 2 === 0;
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

  /**
   * 指定マスのブロック種別を強制的に上書きする。
   * サイコロ6面ステージ(CubeStage)で、面の四隅(通常は外周としてHARD固定)を
   * 壊せるブロックに開放し、面をまたぐ移動の経路として使えるようにする用途
   * などで使用する。範囲外は何もしない。
   */
  setBlockType(col, row, type) {
    if (!Collision.inBounds(col, row, this.cols, this.rows)) return;
    this.grid[row][col] = type;
    if (type !== BLOCK_TYPES.ITEM) {
      this.itemTypeByTile.delete(tileKey(col, row));
    }
  }

  isWalkable(col, row, options = {}) {
    return Collision.isWalkable(this.grid, col, row, options);
  }

  /**
   * そのマスに爆弾を設置できるかどうか。
   * 通常HARD/SOFT/ITEMのマスには（そもそも通り抜けアイテム無しでは）
   * 移動できないため入る余地がないが、👻(GHOST)取得済みで壊せる壁
   * (SOFT/ITEM)の中に入り込んでいる場合でも、その状態を利用した
   * 安全地帯化を防ぐため爆弾は設置できないようにする。EMPTYのみ設置可。
   */
  canPlaceBombAt(col, row) {
    return this.getBlockType(col, row) === BLOCK_TYPES.EMPTY;
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
