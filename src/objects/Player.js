/**
 * Player.js
 * ------------------------------------------------------------
 * プレイヤーキャラクターのロジックと描画を管理するクラス。
 * グリッド単位で移動し、1マス移動は必ず完了してから次の入力を
 * 受け付ける「ボンバーマン式」の移動方式を採用する。
 *
 * VRM対応は開発ルール8に基づき本クラスから分離する予定。
 * 本フェーズでは色違いくまっち相当のプレースホルダー描画のみ行い、
 * 将来 VRMSystem からスプライト/モデルを差し替えられるよう
 * `setDisplayObject()` の口を用意しておく。
 * ------------------------------------------------------------
 */
import {
  TILE_SIZE,
  PLAYER_MOVE_DURATION_MS,
  PLAYER_DEFAULT_LIVES,
  BOMB_INITIAL_COUNT,
  BLAST_INITIAL_RANGE,
  PLAYER_COLORS,
  DEPTH,
} from '../constants/GameConstants.js';
import { Collision } from '../utils/Collision.js';

const DIRECTION_VECTORS = Object.freeze({
  up: { dCol: 0, dRow: -1 },
  down: { dCol: 0, dRow: 1 },
  left: { dCol: -1, dRow: 0 },
  right: { dCol: 1, dRow: 0 },
});

let nextPlayerInstanceId = 1;

export class Player {
  /**
   * @param {Phaser.Scene} scene
   * @param {Stage} stage
   * @param {number} startCol
   * @param {number} startRow
   * @param {object} options - { colorIndex, isAI, playerId }
   */
  constructor(scene, stage, startCol, startRow, options = {}) {
    this.scene = scene;
    this.stage = stage;
    this.col = startCol;
    this.row = startRow;
    this.playerId = options.playerId ?? nextPlayerInstanceId++;
    this.isAI = !!options.isAI;
    this.colorIndex = options.colorIndex ?? 0;

    // --- ステータス（データ駆動: アイテムやスキルにより後から書き換わる） ---
    this.lives = PLAYER_DEFAULT_LIVES;
    this.maxBombs = BOMB_INITIAL_COUNT;
    this.activeBombCount = 0; // 現在フィールドに設置中の自分の爆弾数
    this.blastRange = BLAST_INITIAL_RANGE;
    this.speedMultiplier = 1;
    this.canPassSoftBlock = false; // 👻
    this.canKickBombs = false; // 💥
    this.invincibleUntil = 0;
    this.isAlive = true;
    this.isMoving = false;
    this.facing = 'down';

    // --- 集計データ（リザルト画面・勝敗判定用） ---
    this.stats = {
      kills: 0, // 撃破数
      bombsExploded: 0, // 爆破数
      itemsCollected: 0, // 取得アイテム数
    };

    this._createSprite();
  }

  _createSprite() {
    const { x, y } = Collision.toPixel(this.col, this.row);
    const color = this._colorNameToHex(PLAYER_COLORS[this.colorIndex % PLAYER_COLORS.length]);

    // TODO(Phase3): VRMSystem経由でモデル/スプライトを差し替え可能にする。
    this.displayObject = this.scene.add.rectangle(x, y, TILE_SIZE - 10, TILE_SIZE - 10, color);
    this.displayObject.setDepth(DEPTH.PLAYER);
    this.displayObject.setStrokeStyle(2, 0x000000, 0.4);
  }

  _colorNameToHex(name) {
    const map = {
      red: 0xe74c3c,
      blue: 0x3498db,
      yellow: 0xf1c40f,
      green: 0x2ecc71,
      black: 0x2c3e50,
      white: 0xecf0f1,
    };
    return map[name] ?? 0xffffff;
  }

  /** 将来VRM等でモデルを差し替えるためのフック */
  setDisplayObject(newDisplayObject) {
    this.displayObject?.destroy();
    this.displayObject = newDisplayObject;
    this.displayObject.setDepth(DEPTH.PLAYER);
  }

  get isInvincible() {
    return this.scene.time.now < this.invincibleUntil;
  }

  /**
   * 指定方向への移動を試みる。既に移動中の場合や壁・ブロック・爆弾で
   * 塞がれている場合は何もしない。
   * @param {'up'|'down'|'left'|'right'} direction
   * @param {(col:number,row:number)=>boolean} isTileBlockedByBomb - 爆弾による移動阻害チェック
   */
  tryMove(direction, isTileBlockedByBomb = () => false) {
    if (!this.isAlive || this.isMoving) return false;

    const vector = DIRECTION_VECTORS[direction];
    if (!vector) return false;
    this.facing = direction;

    const targetCol = this.col + vector.dCol;
    const targetRow = this.row + vector.dRow;

    if (!this.stage.isWalkable(targetCol, targetRow, { canPassSoftBlock: this.canPassSoftBlock })) {
      return false;
    }
    if (isTileBlockedByBomb(targetCol, targetRow)) {
      return false;
    }

    this.isMoving = true;
    this.col = targetCol;
    this.row = targetRow;
    const { x, y } = Collision.toPixel(targetCol, targetRow);
    const duration = PLAYER_MOVE_DURATION_MS / this.speedMultiplier;

    this.scene.tweens.add({
      targets: this.displayObject,
      x,
      y,
      duration,
      onComplete: () => {
        this.isMoving = false;
      },
    });
    return true;
  }

  /** 爆弾設置可能かどうか */
  canPlaceBomb() {
    return this.isAlive && this.activeBombCount < this.maxBombs;
  }

  onBombPlaced() {
    this.activeBombCount++;
  }

  onBombResolved() {
    this.activeBombCount = Math.max(0, this.activeBombCount - 1);
  }

  /** 爆風やAI等からのダメージ処理。無敵中は無効化する */
  takeDamage() {
    if (!this.isAlive || this.isInvincible) return false;
    this.lives -= 1;
    if (this.lives <= 0) {
      this.isAlive = false;
      this.displayObject?.setAlpha(0.25);
    } else {
      // 被弾後の一時無敵（連続被弾防止）は簡易的に一定時間付与する。
      this.invincibleUntil = this.scene.time.now + 1500;
    }
    return true;
  }

  destroy() {
    this.displayObject?.destroy();
  }
}
