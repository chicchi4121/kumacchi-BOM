/**
 * Bomb.js
 * ------------------------------------------------------------
 * 設置された爆弾1個分の状態と見た目（くまの顔）を管理するクラス。
 * 爆発の判定・爆風の伝播ロジックはExplosion.jsに委譲し、
 * Bombは「いつ・誰が・どこで・どの範囲で」爆発するかの情報のみを持つ。
 * ------------------------------------------------------------
 */
import { TILE_SIZE, BOMB_FUSE_MS, DEPTH } from '../constants/GameConstants.js';
import { Collision } from '../utils/Collision.js';

export class Bomb {
  /**
   * @param {Phaser.Scene} scene
   * @param {string} face - サイコロ6面ステージ上でこの爆弾が置かれている面(CUBE_FACE_NAMESのいずれか)
   * @param {number} col
   * @param {number} row
   * @param {object} options - { ownerId, blastRange, onDetonate }
   *   onDetonate: (bomb: Bomb) => void  爆発時に呼び出されるコールバック
   */
  constructor(scene, face, col, row, options = {}) {
    this.scene = scene;
    this.face = face;
    this.col = col;
    this.row = row;
    this.ownerId = options.ownerId ?? null;
    this.blastRange = options.blastRange ?? 1;
    this.onDetonate = options.onDetonate ?? (() => {});
    this.detonated = false;
    this.kickable = false; // TODO(Phase2): 💥アイテム所持時にtrueとして蹴り移動を許可する

    // 3D(サイコロステージ)モードでは見た目はCubeRendererがPlayerと同様に
    // 状態(face/col/row/detonated)を読み取って描画するため、Phaser用の
    // スプライトは生成しない（開発ルール9: 描画とロジックの分離）。
    if (!scene.render3D) {
      this._createSprite();
    }

    // 約3秒後に自動爆発するタイマー。誘爆時はdetonate()が先に呼ばれ、
    // その中でこのタイマーをキャンセルする。
    this.fuseTimer = scene.time.delayedCall(BOMB_FUSE_MS, () => this.detonate());
  }

  _createSprite() {
    const { x, y } = Collision.toPixel(this.col, this.row);
    // TODO(Phase2): 画像アセット(assets/images/bomb)差し替え。現状はくまの顔を模した簡易描画。
    this.sprite = this.scene.add.circle(x, y, TILE_SIZE * 0.32, 0x3b2a20);
    this.sprite.setDepth(DEPTH.BOMB);
    this.sprite.setStrokeStyle(3, 0x1a1208, 1);

    // 膨張・収縮アニメーションで「今にも爆発しそう」な演出を行う。
    this.scene.tweens.add({
      targets: this.sprite,
      scale: { from: 1, to: 1.12 },
      duration: 400,
      yoyo: true,
      repeat: -1,
    });
  }

  /** 誘爆・自然爆発どちらからも呼び出される爆発処理の入口 */
  detonate() {
    if (this.detonated) return;
    this.detonated = true;
    this.fuseTimer?.remove(false);
    this.sprite?.destroy();
    this.onDetonate(this);
  }

  destroy() {
    this.sprite?.destroy();
  }
}
