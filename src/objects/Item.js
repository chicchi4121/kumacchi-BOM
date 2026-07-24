/**
 * Item.js
 * ------------------------------------------------------------
 * フィールド上に出現するアイテムの見た目と種別を管理するクラス。
 * 出現・取得・効果適用の実処理はGameScene（出現）とItemSystem.js
 * （効果適用）が担当し、本クラスは見た目（絵文字プレースホルダー）
 * のみを管理する（開発ルール9: 描画とロジックの分離）。
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
