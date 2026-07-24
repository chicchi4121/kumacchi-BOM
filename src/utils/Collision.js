/**
 * Collision.js
 * ------------------------------------------------------------
 * グリッドベースの当たり判定ユーティリティ。
 * 描画(Phaser)や物理エンジンに依存せず、純粋なロジックとして
 * 座標変換・移動可否判定・爆風到達判定を提供する。
 * ------------------------------------------------------------
 */
import { TILE_SIZE } from '../constants/GameConstants.js';

export class Collision {
  /** ピクセル座標 -> グリッド座標 */
  static toGrid(pixelX, pixelY) {
    return {
      col: Math.floor(pixelX / TILE_SIZE),
      row: Math.floor(pixelY / TILE_SIZE),
    };
  }

  /** グリッド座標 -> マス中央のピクセル座標 */
  static toPixel(col, row) {
    return {
      x: col * TILE_SIZE + TILE_SIZE / 2,
      y: row * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  /** 指定座標がマップ範囲内かどうか */
  static inBounds(col, row, cols, rows) {
    return col >= 0 && row >= 0 && col < cols && row < rows;
  }

  /**
   * プレイヤーがそのマスへ移動できるかを判定する。
   *
   * 仕様変更: 壁(HARD/SOFT/ITEMいずれも)は「見た目・爆風は遮るが、
   * プレイヤーの移動は妨げない（通り抜けられる壁）」という設計にした。
   * そのため実際にはマップ範囲内かどうかのみを判定する。
   * ブロック種別による移動制限が復活しても困らないよう、シグネチャ
   * (grid, col, row, options)自体は維持している。
   *
   * @param {Array<Array<string>>} grid - Stage.jsが保持するブロック種別の2次元配列
   * @param {number} col
   * @param {number} row
   * @param {object} options - 現状未使用（将来の拡張用に維持）
   */
  static isWalkable(grid, col, row, options = {}) {
    if (!grid[row] || grid[row][col] === undefined) return false;
    return true;
  }

  /** 2つのグリッド座標が一致するか（爆風とプレイヤー等の当たり判定に使用） */
  static sameTile(a, b) {
    return a.col === b.col && a.row === b.row;
  }
}
