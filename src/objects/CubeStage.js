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
 * - 各面は独立したミニマップとして生成する。各面の中央を、その面に
 *   割り当てられたプレイヤー1人分の安全地帯として確保する。
 * - 面の外周は基本的にHARD(壊せない壁)だが、四隅とその approach マス
 *   (隅へ歩いて近づくための辺沿いの隣接1マス、計8マス)だけは例外的に
 *   壊せるブロック(SOFT)として開放しており(_openFaceCorners)、そこを
 *   壊せば(または👻取得済みならそのまま)面の端まで到達して隣接する
 *   面へ渡れる。辺の途中(隅・approachマス以外)からは面をまたげない。
 * - 爆風・爆弾の誘爆は面をまたいで伝播しない（爆風の計算はExplosion.jsが
 *   各面のStageに対して行うため、自然と面内で完結する）。
 * - プレイヤーの移動のみが面をまたぐ（resolveMove）。
 * ------------------------------------------------------------
 */
import { CUBE_FACE_NAMES, CUBE_FACE_COLS, CUBE_FACE_ROWS, MAX_PLAYERS, BLOCK_TYPES } from '../constants/GameConstants.js';
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
      // 面の四隅を壊せるブロックとして開放する(下記_openFaceCorners参照)。
      this._openFaceCorners(stage);
    }

    const count = Math.max(1, Math.min(MAX_PLAYERS, playerCount, CUBE_FACE_NAMES.length));
    this.startPositions = CUBE_FACE_NAMES.slice(0, count).map((face) => ({
      face,
      col: centerCol,
      row: centerRow,
    }));

    return this.faces;
  }

  /**
   * 面の四隅(col=0,row=0 / col=cols-1,row=0 / col=0,row=rows-1 / col=cols-1,row=rows-1)を
   * 壊せるブロック(SOFT)として開放する。
   *
   * Stage.generate()は面の外周を常にHARD(壊せない壁)として生成するため、
   * このままでは面の端のマスに一度も立てず、resolveMove()が用意している
   * 「面の端を超えると隣接する面へ渡る」処理が実際には一度も発動しない
   * (=見た目は立方体でも、実際には他の面へ移動する手段が無い)という
   * 状態になってしまう。
   *
   * 【重要】隅のマス1つだけを開放しても、その直交2方向の隣接マスは
   * どちらも外周(HARD)のままなので、実際にはそこへ歩いて近づく手段も
   * 爆風を通す手段も無く「開放したはずの隅に誰も到達できない」という
   * 状態になってしまう。そのため、各隅について「隅そのもの」に加えて、
   * 内側のマスから歩いて近づくための隣接1マス(辺沿いの隣)もあわせて
   * 壊せるブロックにしておく(=隅へ到達するための2マス分の「通路」を
   * 用意する)。隅へ到達できれば、そこから残るもう一方の方向へも
   * resolveMove()でそのまま面をまたげるため、隣接approachマスは1つで
   * 両方向(例: 左上の隅なら上方向・左方向の両方)への面またぎが可能になる。
   * 辺の途中(隅とその approach マス以外)は従来通りHARDのままにして、
   * 各面の見た目上の輪郭(サイコロの面の境目)ははっきり残す。
   */
  _openFaceCorners(stage) {
    const lastCol = stage.cols - 1;
    const lastRow = stage.rows - 1;
    // [隅, 隅へ近づくためのapproachマス] のペアを4隅ぶん
    const notches = [
      [[0, 0], [1, 0]],
      [[lastCol, 0], [lastCol - 1, 0]],
      [[0, lastRow], [1, lastRow]],
      [[lastCol, lastRow], [lastCol - 1, lastRow]],
    ];
    for (const [corner, approach] of notches) {
      for (const [col, row] of [corner, approach]) {
        if (stage.getBlockType(col, row) === BLOCK_TYPES.HARD) {
          stage.setBlockType(col, row, BLOCK_TYPES.SOFT);
        }
      }
    }
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
