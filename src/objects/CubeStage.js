/**
 * CubeStage.js
 * ------------------------------------------------------------
 * バトルエリアを「サイコロ状(立方体)の6面ステージ」として管理するクラス。
 * 各面はそれぞれ独立した通常のStage(2次元グリッドの迷路)であり、
 * 面の端まで移動すると隣接する面へ乗り移れる（CubeTopology.jsの
 * CROSSING_TABLEに基づく）。
 *
 * 開発ルール9(描画とロジックの分離)に従い、本クラスはPhaser/Three.js
 * いずれにも依存しない純粋なデータ構造・ロジックのみを扱う。
 *
 * 現状のスコープ（v1）:
 * - 各面は独立したミニマップとして生成する（面をまたいだ迷路の連続性は
 *   持たせない）。各面の中央を、その面に割り当てられたプレイヤー1人分の
 *   安全地帯として確保する。
 * - 爆風・爆弾の誘爆は面をまたいで伝播しない（爆風の計算はExplosion.jsが
 *   各面のStageに対して行うため、自然と面内で完結する）。
 * - プレイヤーの移動のみが面をまたぐ（resolveMove）。
 * ------------------------------------------------------------
 */
import { CUBE_FACE_NAMES, CUBE_FACE_COLS, CUBE_FACE_ROWS, MAX_PLAYERS } from '../constants/GameConstants.js';
import { CROSSING_TABLE } from '../constants/CubeTopology.js';
import { Stage } from './Stage.js';

const DIRECTION_VECTORS = Object.freeze({
  up: { dCol: 0, dRow: -1 },
  down: { dCol: 0, dRow: 1 },
  left: { dCol: -1, dRow: 0 },
  right: { dCol: 1, dRow: 0 },
});

export class CubeStage {
  /**
   * @param {number} cols - 1面あたりの横マス数
   * @param {number} rows - 1面あたりの縦マス数
   */
  constructor(cols = CUBE_FACE_COLS, rows = CUBE_FACE_ROWS) {
    this.cols = cols;
    this.rows = rows;
    this.faces = {};
    for (const name of CUBE_FACE_NAMES) {
      this.faces[name] = new Stage(cols, rows);
    }
    this.startPositions = [];
  }

  /**
   * 6面すべての迷路を生成し、面ごとに1箇所ずつ(面の中央)プレイヤーの
   * 開始地点(安全地帯)を確保する。
   * @param {number} playerCount - 参加人数(最大6、面の数まで)
   */
  generate(playerCount = 1) {
    const centerCol = Math.floor(this.cols / 2);
    const centerRow = Math.floor(this.rows / 2);

    for (const name of CUBE_FACE_NAMES) {
      const stage = this.faces[name];
      stage.generate(1);
      // Stage.generate()は既定では隅(buildStartCandidatesの1番目)を安全地帯に
      // するため、サイコロステージでは各面の中央をその面の唯一の開始地点として
      // 使いたいので、中央も追加で安全地帯化し、開始地点情報を上書きする。
      stage._clearSafeZone(centerCol, centerRow);
      stage.startPositions = [{ col: centerCol, row: centerRow }];
    }

    const count = Math.max(1, Math.min(MAX_PLAYERS, playerCount, CUBE_FACE_NAMES.length));
    this.startPositions = CUBE_FACE_NAMES.slice(0, count).map((face) => ({
      face,
      col: centerCol,
      row: centerRow,
    }));

    return this.faces;
  }

  getStartPositions() {
    return this.startPositions;
  }

  /** 面名からその面の通常のStageインスタンスを取得する */
  getFaceStage(face) {
    return this.faces[face];
  }

  getBlockType(face, col, row) {
    return this.faces[face].getBlockType(col, row);
  }

  isWalkable(face, col, row, options = {}) {
    const stage = this.faces[face];
    if (!stage) return false;
    return stage.isWalkable(col, row, options);
  }

  canPlaceBombAt(face, col, row) {
    return this.faces[face].canPlaceBombAt(col, row);
  }

  breakBlock(face, col, row) {
    return this.faces[face].breakBlock(col, row);
  }

  /**
   * 指定の面・位置からdirectionへ1マス移動しようとした場合の着地先を返す。
   * 面の内部にとどまる移動ならそのまま同じ面のcol/rowを、面の端を超える
   * 場合はCROSSING_TABLEに基づいて隣接する面の着地位置・向きを返す。
   *
   * NOTE: ここでは座標変換のみを行い、着地先が実際に通行可能かどうかは
   * 判定しない。呼び出し側(Player.tryMove等)で返り値に対して
   * isWalkable()を別途チェックすること。
   *
   * @returns {{face:string, col:number, row:number, facing:string, crossed:boolean}|null}
   */
  resolveMove(face, col, row, direction) {
    const stage = this.faces[face];
    const vector = DIRECTION_VECTORS[direction];
    if (!stage || !vector) return null;

    const targetCol = col + vector.dCol;
    const targetRow = row + vector.dRow;

    if (targetCol >= 0 && targetCol < stage.cols && targetRow >= 0 && targetRow < stage.rows) {
      return { face, col: targetCol, row: targetRow, facing: direction, crossed: false };
    }

    const crossing = CROSSING_TABLE[face]?.[direction];
    if (!crossing) return null;
    const { toFace, viaEdge, newFacing, varReversed } = crossing;
    const destStage = this.faces[toFace];
    if (!destStage) return null;

    // 面を出る際の「辺に沿った座標」(alongIdx): left/right辺ならrow、up/down辺ならcol
    const isHorizontalEdge = direction === 'left' || direction === 'right';
    const alongIdx = isHorizontalEdge ? row : col;
    const alongLenSrc = isHorizontalEdge ? stage.rows : stage.cols;

    const destAlongIsRow = viaEdge === 'left' || viaEdge === 'right';
    const alongLenDest = destAlongIsRow ? destStage.rows : destStage.cols;

    // 面のサイズが異なる場合にも対応できるよう比率でスケーリングする
    // (通常は全面同サイズなのでそのままの値になる)
    let destAlong = alongLenSrc === alongLenDest ? alongIdx : Math.round((alongIdx / (alongLenSrc - 1)) * (alongLenDest - 1));
    if (varReversed) destAlong = alongLenDest - 1 - destAlong;
    destAlong = Math.max(0, Math.min(alongLenDest - 1, destAlong));

    let destCol;
    let destRow;
    switch (viaEdge) {
      case 'left':
        destCol = 0;
        destRow = destAlong;
        break;
      case 'right':
        destCol = destStage.cols - 1;
        destRow = destAlong;
        break;
      case 'up':
        destRow = 0;
        destCol = destAlong;
        break;
      case 'down':
      default:
        destRow = destStage.rows - 1;
        destCol = destAlong;
        break;
    }

    return { face: toFace, col: destCol, row: destRow, facing: newFacing, crossed: true };
  }
}
