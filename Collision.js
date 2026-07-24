/**
 * CubeRenderer.js
 * ------------------------------------------------------------
 * サイコロ状(立方体)の6面ステージを実際にThree.jsで3D描画するクラス。
 *
 * 開発ルール9(描画とロジックの分離)に従い、本クラスは「見た目」だけを
 * 担当する。ゲームロジック(Stage/CubeStage/Player/Bomb/Item/Explosion)は
 * 一切変更せず、それらの公開状態(face/col/row/type/isAlive等)を読み取って
 * 3Dオブジェクトを生成・更新・破棄するだけの「シャドウレンダラー」として
 * 動作する。GameScene.js(Phaser)はゲームロジックの進行・入力・HUDを担当し、
 * バトルフィールドの実描画は本クラスがオーナーの別canvas(#cube-canvas)に
 * 対して行う（index.html参照）。
 *
 * 座標系: CubeTopology.jsのFACE_AXES(各面の法線N・右方向R・下方向D)を
 * そのまま使い、半径CUBE_RADIUSの立方体として実座標に変換する。
 * ------------------------------------------------------------
 */
import {
  CUBE_FACE_NAMES,
  CUBE_FACE_COLS,
  CUBE_FACE_ROWS,
  BLOCK_TYPES,
  PLAYER_COLORS,
  EXPLOSION_LIFETIME_MS,
} from '../constants/GameConstants.js';
import { FACE_AXES, faceLocalToWorld } from '../constants/CubeTopology.js';
import { ITEM_EMOJI } from '../objects/Item.js';

const CUBE_RADIUS = 5; // 立方体の中心から各面までの距離(Three.jsのワールド単位)
const BLOCK_OUTWARD = 0.16; // ブロックが面から浮く距離
const BLOCK_THICKNESS = 0.32;
const ENTITY_OUTWARD = 0.4; // プレイヤー・アイテム・爆弾が面から浮く距離
const CELL_SIZE = (2 * CUBE_RADIUS) / CUBE_FACE_COLS; // 1マスのワールド単位サイズ(全面同サイズ前提)

const BLOCK_COLORS = Object.freeze({
  [BLOCK_TYPES.HARD]: 0x555555,
  [BLOCK_TYPES.SOFT]: 0xa0623b,
  [BLOCK_TYPES.ITEM]: 0xc98a54,
});

const PLAYER_COLOR_HEX = Object.freeze({
  red: 0xe74c3c,
  blue: 0x3498db,
  yellow: 0xf1c40f,
  green: 0x2ecc71,
  black: 0x2c3e50,
  white: 0xecf0f1,
});

function cellKey(face, col, row) {
  return `${face}:${col},${row}`;
}

/** 面のローカル座標(col,row) -> ワールド座標([x,y,z]) */
function cellWorldPos(face, col, row, cols, rows, outward = 0) {
  const u = ((col + 0.5) / cols) * 2 - 1;
  const v = ((row + 0.5) / rows) * 2 - 1;
  const [x, y, z] = faceLocalToWorld(face, u, v);
  const { N } = FACE_AXES[face];
  return [x * CUBE_RADIUS + N[0] * outward, y * CUBE_RADIUS + N[1] * outward, z * CUBE_RADIUS + N[2] * outward];
}

export class CubeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ready = false;
    this._THREE = null;
    this._faceQuaternions = new Map();
    this._blockMeshes = new Map(); // "face:col,row" -> mesh
    this._bombMeshes = new Map(); // Bomb instance -> mesh
    this._itemMeshes = new Map(); // Item instance -> mesh
    this._playerMeshes = new Map(); // playerId -> mesh
    this._explosions = []; // { mesh, startedAt }
    this._itemTextureCache = new Map(); // itemType -> CanvasTexture
    this._humanPlayerId = null;
    this._humanTextures = null; // { down, up, left, right }: CanvasTexture
    this._currentFace = null;
  }

  /**
   * Three.js(CDN経由)を読み込み、CubeStageの内容から立方体シーンを構築する。
   * @param {CubeStage} stage
   */
  async init(stage) {
    const THREE = await import(/* webpackIgnore: true */ 'three');
    this._THREE = THREE;
    this.stage = stage;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(3, 5, 4);
    this.scene.add(dirLight);

    this.resize();
    this._buildFaces();
    this.ready = true;
  }

  /** canvasの表示サイズ(CSS)に合わせてレンダラー/カメラを更新する */
  resize() {
    if (!this.renderer) return;
    const w = Math.max(1, this.canvas.clientWidth || this.canvas.width);
    const h = Math.max(1, this.canvas.clientHeight || this.canvas.height);
    this.renderer.setSize(w, h, false);
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  _getFaceQuaternion(face) {
    if (!this._faceQuaternions.has(face)) {
      const THREE = this._THREE;
      const { N, R, D } = FACE_AXES[face];
      const m = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(R[0], R[1], R[2]),
        new THREE.Vector3(-D[0], -D[1], -D[2]),
        new THREE.Vector3(N[0], N[1], N[2])
      );
      this._faceQuaternions.set(face, new THREE.Quaternion().setFromRotationMatrix(m));
    }
    return this._faceQuaternions.get(face);
  }

  _buildFaces() {
    const THREE = this._THREE;
    this._floorGeometry = new THREE.PlaneGeometry(2 * CUBE_RADIUS, 2 * CUBE_RADIUS);
    this._floorMeshes = [];
    for (const face of CUBE_FACE_NAMES) {
      const floorMat = new THREE.MeshStandardMaterial({ color: 0x33403a, side: THREE.DoubleSide });
      const floor = new THREE.Mesh(this._floorGeometry, floorMat);
      floor.quaternion.copy(this._getFaceQuaternion(face));
      const { N } = FACE_AXES[face];
      floor.position.set(N[0] * CUBE_RADIUS, N[1] * CUBE_RADIUS, N[2] * CUBE_RADIUS);
      this.scene.add(floor);
      this._floorMeshes.push(floor);

      this._rebuildFaceBlocks(face);
    }
  }

  /** 指定した面の全ブロックメッシュを、Stageの現在の状態から作り直す(生成時専用) */
  _rebuildFaceBlocks(face) {
    const faceStage = this.stage.getFaceStage(face);
    for (let row = 0; row < faceStage.rows; row++) {
      for (let col = 0; col < faceStage.cols; col++) {
        const type = faceStage.getBlockType(col, row);
        if (type === BLOCK_TYPES.EMPTY) continue;
        this._addBlockMesh(face, col, row, type);
      }
    }
  }

  _addBlockMesh(face, col, row, type) {
    const THREE = this._THREE;
    const geom = new THREE.BoxGeometry(CELL_SIZE * 0.94, CELL_SIZE * 0.94, BLOCK_THICKNESS);
    const mat = new THREE.MeshStandardMaterial({ color: BLOCK_COLORS[type] ?? 0xffffff });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.quaternion.copy(this._getFaceQuaternion(face));
    const [x, y, z] = cellWorldPos(face, col, row, CUBE_FACE_COLS, CUBE_FACE_ROWS, BLOCK_OUTWARD);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this._blockMeshes.set(cellKey(face, col, row), mesh);
  }

  /** ブロックが破壊された時にGameScene側から呼ぶ */
  removeBlockAt(face, col, row) {
    const key = cellKey(face, col, row);
    const mesh = this._blockMeshes.get(key);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    this._blockMeshes.delete(key);
  }

  /** 2D canvas(VRMSystem.renderSnapshotSet等)からThree.jsのテクスチャを作る */
  createCanvasTexture(canvas) {
    return new this._THREE.CanvasTexture(canvas);
  }

  /** 人間プレイヤーのVRM4方向テクスチャを設定する(GameScene._loadHumanVrmAppearance用) */
  setHumanTextures(playerId, textureSet) {
    this._humanPlayerId = playerId;
    this._humanTextures = textureSet;
    const mesh = this._playerMeshes.get(playerId);
    if (mesh) {
      mesh.material.map = textureSet.down;
      mesh.material.transparent = true;
      mesh.material.needsUpdate = true;
    }
  }

  _createPlayerMesh(player) {
    const THREE = this._THREE;
    const geom = new THREE.PlaneGeometry(CELL_SIZE * 0.82, CELL_SIZE * 0.82);
    let material;
    if (player.playerId === this._humanPlayerId && this._humanTextures) {
      material = new THREE.MeshBasicMaterial({ map: this._humanTextures.down, transparent: true, side: THREE.DoubleSide });
    } else {
      const colorName = PLAYER_COLORS[player.colorIndex % PLAYER_COLORS.length];
      material = new THREE.MeshBasicMaterial({ color: PLAYER_COLOR_HEX[colorName] ?? 0xffffff, side: THREE.DoubleSide });
    }
    const mesh = new THREE.Mesh(geom, material);
    this.scene.add(mesh);
    return mesh;
  }

  _removePlayerMesh(playerId) {
    const mesh = this._playerMeshes.get(playerId);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    this._playerMeshes.delete(playerId);
  }

  /**
   * 全プレイヤーの見た目を現在の状態(face/col/row/facing/isAlive)に同期する。
   * 移動中はPlayer.getMoveProgress()を使って前の位置から現在地へ補間する。
   * @param {Array<Player>} players
   * @param {number} now
   */
  syncPlayers(players, now) {
    for (const player of players) {
      if (!player.isAlive) {
        this._removePlayerMesh(player.playerId);
        continue;
      }
      let mesh = this._playerMeshes.get(player.playerId);
      if (!mesh) {
        mesh = this._createPlayerMesh(player);
        this._playerMeshes.set(player.playerId, mesh);
      }

      if (player.playerId === this._humanPlayerId && this._humanTextures) {
        const tex = this._humanTextures[player.facing] ?? this._humanTextures.down;
        if (mesh.material.map !== tex) {
          mesh.material.map = tex;
          mesh.material.needsUpdate = true;
        }
      }

      const progress = player.getMoveProgress(now);
      const [fx, fy, fz] = cellWorldPos(player._prevFace, player._prevCol, player._prevRow, CUBE_FACE_COLS, CUBE_FACE_ROWS, ENTITY_OUTWARD);
      const [tx, ty, tz] = cellWorldPos(player.face, player.col, player.row, CUBE_FACE_COLS, CUBE_FACE_ROWS, ENTITY_OUTWARD);
      mesh.position.set(fx + (tx - fx) * progress, fy + (ty - fy) * progress, fz + (tz - fz) * progress);
      mesh.quaternion.copy(this._getFaceQuaternion(player.face));
    }
  }

  addBomb(bomb) {
    const THREE = this._THREE;
    const geom = new THREE.SphereGeometry(CELL_SIZE * 0.28, 12, 10);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3b2a20 });
    const mesh = new THREE.Mesh(geom, mat);
    const [x, y, z] = cellWorldPos(bomb.face, bomb.col, bomb.row, CUBE_FACE_COLS, CUBE_FACE_ROWS, ENTITY_OUTWARD * 0.7);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this._bombMeshes.set(bomb, mesh);
  }

  removeBomb(bomb) {
    const mesh = this._bombMeshes.get(bomb);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    this._bombMeshes.delete(bomb);
  }

  _updateBombs(now) {
    for (const mesh of this._bombMeshes.values()) {
      mesh.scale.setScalar(1 + 0.12 * Math.sin(now / 130));
    }
  }

  _getItemTexture(type) {
    if (this._itemTextureCache.has(type)) return this._itemTextureCache.get(type);
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = '44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ITEM_EMOJI[type] ?? '?', 32, 34);
    const texture = new this._THREE.CanvasTexture(canvas);
    this._itemTextureCache.set(type, texture);
    return texture;
  }

  addItem(item) {
    const THREE = this._THREE;
    const geom = new THREE.PlaneGeometry(CELL_SIZE * 0.6, CELL_SIZE * 0.6);
    const mat = new THREE.MeshBasicMaterial({ map: this._getItemTexture(item.type), transparent: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.quaternion.copy(this._getFaceQuaternion(item.face));
    const [x, y, z] = cellWorldPos(item.face, item.col, item.row, CUBE_FACE_COLS, CUBE_FACE_ROWS, ENTITY_OUTWARD * 0.6);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this._itemMeshes.set(item, mesh);
  }

  removeItem(item) {
    const mesh = this._itemMeshes.get(item);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    this._itemMeshes.delete(item);
  }

  /** 爆風が届いたマスに一瞬だけ表示するエフェクト */
  showExplosion(face, tiles, now) {
    const THREE = this._THREE;
    const geom = new THREE.PlaneGeometry(CELL_SIZE * 0.9, CELL_SIZE * 0.9);
    for (const tile of tiles) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xff9642, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.quaternion.copy(this._getFaceQuaternion(face));
      const [x, y, z] = cellWorldPos(face, tile.col, tile.row, CUBE_FACE_COLS, CUBE_FACE_ROWS, ENTITY_OUTWARD * 0.5);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      this._explosions.push({ mesh, startedAt: now });
    }
  }

  _updateExplosions(now) {
    this._explosions = this._explosions.filter((entry) => {
      const t = (now - entry.startedAt) / EXPLOSION_LIFETIME_MS;
      if (t >= 1) {
        this.scene.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        entry.mesh.material.dispose();
        return false;
      }
      entry.mesh.material.opacity = 0.85 * (1 - t);
      return true;
    });
  }

  /** カメラを指定した面の正面から見る位置へ移す(即座に切り替え。v1ではアニメーションなし) */
  followFace(face) {
    if (!this.ready || this._currentFace === face) return;
    this._currentFace = face;
    const { N, D } = FACE_AXES[face];
    const viewDistance = CUBE_RADIUS * 3;
    const faceCenter = [N[0] * CUBE_RADIUS, N[1] * CUBE_RADIUS, N[2] * CUBE_RADIUS];
    this.camera.position.set(
      faceCenter[0] + N[0] * viewDistance,
      faceCenter[1] + N[1] * viewDistance,
      faceCenter[2] + N[2] * viewDistance
    );
    this.camera.up.set(-D[0], -D[1], -D[2]);
    this.camera.lookAt(faceCenter[0], faceCenter[1], faceCenter[2]);
  }

  /** 毎フレーム呼び出す: 動的エフェクトを更新して描画する */
  render(now) {
    if (!this.ready) return;
    this._updateBombs(now);
    this._updateExplosions(now);
    this.renderer.render(this.scene, this.camera);
  }

  /** シーン終了時にWebGLリソースを解放する */
  dispose() {
    if (!this.ready) return;
    for (const mesh of this._floorMeshes ?? []) {
      this.scene.remove(mesh);
      mesh.material.dispose();
    }
    this._floorGeometry?.dispose();
    for (const key of Array.from(this._blockMeshes.keys())) {
      const mesh = this._blockMeshes.get(key);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    for (const mesh of this._bombMeshes.values()) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    for (const mesh of this._itemMeshes.values()) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    for (const mesh of this._playerMeshes.values()) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    for (const entry of this._explosions) {
      entry.mesh.geometry.dispose();
      entry.mesh.material.dispose();
    }
    for (const texture of this._itemTextureCache.values()) {
      texture.dispose();
    }
    this.renderer?.dispose();
    this.ready = false;
  }
}
