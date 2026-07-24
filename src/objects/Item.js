/**
 * Item.js
 * ------------------------------------------------------------
 * フィールド上に出現するアイテムの見た目と種別を管理するクラス。
 *
 * NOTE: アイテムの出現・取得ロジック本体はPhase2（ItemSystem.js）で
 * 実装する。本フェーズ(Phase1)ではブロック破壊時にアイテムが
 * 出現しうるデータ構造だけを用意し、ステージ生成・爆風計算との
 * 整合性を取っておく（開発ルール6: データ駆動設計）。
 * ------------------------------------------------------------
 */
import { TILE_SIZE, ITEM_TYPES, DEPTH } from '../constants/GameConstants.js';
import { Collision } from '../utils/Collision.js';

// アイテム種別ごとの絵文字表示（画像アセット未整備の間のプレースホルダー）
const ITEM_EMOJI = Object.freeze({
  [ITEM_TYPES.BOMB_UP]: '💣',
  [ITEM_TYPES.FIRE_UP]: '🔥',
  [ITEM_TYPES.SPEED_UP]: '👟',
  [ITEM_TYPES.SHIELD]: '🛡',
  [ITEM_TYPES.LIFE_UP]: '❤️',
  [ITEM_TYPES.GHOST]: '👻',
  [ITEM_TYPES.KICK]: '💥',
});

export class Item {
  constructor(scene, col, row, type) {
    this.scene = scene;
    this.col = col;
    this.row = row;
    this.type = type;

    const { x, y } = Collision.toPixel(col, row);
    this.sprite = scene.add.text(x, y, ITEM_EMOJI[type] ?? '?', {
      fontSize: `${Math.floor(TILE_SIZE * 0.6)}px`,
    });
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setDepth(DEPTH.ITEM);
  }

  destroy() {
    this.sprite?.destroy();
  }
}
