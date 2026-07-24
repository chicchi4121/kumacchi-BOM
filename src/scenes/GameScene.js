/**
 * GameScene.js
 * ------------------------------------------------------------
 * 対戦本編を進行させるメインシーン。
 *
 * Phase1で構築した基盤（マップ生成・移動・爆弾・爆発・当たり判定）に加え、
 * Phase2で以下を実装している:
 *   ・アイテム出現・取得・効果適用（ItemSystem連携）
 *   ・AI行動（AISystem経由でAI.jsの思考ルーチンを実行、危険地帯の共有）
 *   ・詳細な勝敗判定・順位確定・撃破数等のスコア集計（BattleSystem連携）
 *   ・UI強化（順位・カウントダウン）
 *   ・BGM・効果音（SoundSystem連携）
 *
 * Phase3では以下を実装している:
 *   ・人間プレイヤーの見た目をVRMモデルの4方向(正面/背面/左/右)静止画
 *     スナップショットに差し替える機能（VRMSystem連携）
 *   ・バトルエリアをサイコロ状(立方体)の6面ステージにする機能。
 *     ゲームロジック(CubeStage/Player/Bomb/Item/Explosion/AI/BattleSystem)は
 *     従来通りPhaserに依存しない純粋なロジックとして動作させ、実際の3D描画は
 *     CubeRenderer.js(Three.js)が別canvas(#cube-canvas)に対して行う。
 *     Phaser側はHUD/入力/カウントダウン/シーン遷移のみを担当する
 *     （開発ルール9: 描画とロジックの分離を、2D/3D描画の切り替えにも応用）。
 *
 * 必殺技の発動は未対応。
 * ------------------------------------------------------------
 */
import { SCENE_KEYS, SCREEN_WIDTH, SCREEN_HEIGHT, DEPTH, COUNTDOWN_STEPS, COUNTDOWN_STEP_MS } from '../constants/GameConstants.js';
import { CubeStage } from '../objects/CubeStage.js';
import { Player } from '../objects/Player.js';
import { Bomb } from '../objects/Bomb.js';
import { Explosion } from '../objects/Explosion.js';
import { Item } from '../objects/Item.js';
import { AISystem } from '../systems/AISystem.js';
import { ItemSystem } from '../systems/ItemSystem.js';
import { BattleSystem } from '../systems/BattleSystem.js';
import { soundSystem } from '../systems/SoundSystem.js';
import { vrmSystem } from '../systems/VRMSystem.js';
import { CubeRenderer } from '../systems/CubeRenderer.js';

const DEFAULT_VRM_PATH = 'assets/vrm/kumacchi.vrm';

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.GAME });
  }

  /**
   * @param {object} data - { mode: 'pvp'|'ai', playerCount, aiCount, timeLimitMs, aiDifficulty }
   */
  init(data) {
    this.config = {
      mode: data?.mode ?? 'ai',
      playerCount: data?.playerCount ?? 1,
      aiCount: data?.aiCount ?? 2,
      timeLimitMs: data?.timeLimitMs ?? 180000,
      aiDifficulty: data?.aiDifficulty ?? 'normal',
    };
  }

  create() {
    // このシーンでは実際の見た目(ブロック/プレイヤー/爆弾/アイテム)を
    // CubeRenderer(Three.js)が描画するため、Bomb/Item側で独自にPhaser用の
    // スプライトを作らせないようにするフラグ。
    this.render3D = true;

    this.stage = new CubeStage();
    const totalParticipants = Math.min(6, this.config.playerCount + this.config.aiCount);
    this.stage.generate(totalParticipants);

    this.bombs = [];
    this.items = [];

    this._createPlayers(totalParticipants);
    this._createHud();
    this._createInput();

    this.aiSystem = new AISystem();
    this.aiSystem.setup(
      this.players.filter((p) => p.isAI),
      this.config.aiDifficulty
    );

    this.battleSystem = new BattleSystem(this.players, { timeLimitMs: this.config.timeLimitMs });
    this.resultTriggered = false;

    this._sceneActive = true;
    this.events.once('shutdown', () => {
      this._sceneActive = false;
      this.cubeRenderer?.dispose();
    });

    // 3D描画(Three.js)の初期化は非同期(CDN読込あり)。ゲームロジック側
    // (移動・爆弾・カウントダウン等)はこれを待たずに進行できるようにする。
    this._cubeRendererReadyPromise = this._initCubeRenderer();

    this._startCountdown();
    this._loadHumanVrmAppearance();
  }

  /**
   * サイコロ6面ステージの3D描画(Three.js)を初期化する。
   * #cube-canvas(index.html参照)にThree.jsのWebGLRendererを構築し、
   * 現在のCubeStageの内容から立方体シーンを組み立てる。
   * CDN読込を含むため失敗しうる。失敗してもゲームロジック自体は継続できる
   * （3Dの見た目が表示されないだけになる）よう、例外を握りつぶして
   * コンソールに記録するに留める。
   */
  async _initCubeRenderer() {
    const canvas = document.getElementById('cube-canvas');
    if (!canvas) {
      console.error('[GameScene] #cube-canvas が見つかりません。3D描画は行われません。');
      return;
    }
    this.cubeRenderer = new CubeRenderer(canvas);
    try {
      await this.cubeRenderer.init(this.stage);
      this.scale.on('resize', () => this.cubeRenderer?.resize());
      if (this.humanPlayer) this.cubeRenderer.followFace(this.humanPlayer.face);
      console.log('[GameScene] サイコロ6面ステージの3D描画(Three.js)を初期化しました。');
    } catch (e) {
      console.error(
        '[GameScene] 3D描画(Three.js)の初期化に失敗しました。CDNへの到達やindex.htmlのimport map設定をご確認ください。',
        e
      );
    }
  }

  /**
   * 人間プレイヤーの見た目をVRMモデルの4方向(正面/背面/左/右)スナップショットに
   * 差し替える。タイトル画面でカスタムVRMがアップロードされていればそれを、
   * なければ同梱のデフォルトVRM(assets/vrm/kumacchi.vrm)を使用する。
   * 読込・描画に失敗した場合は何もせず、デフォルトの色付き見た目のままにする
   * （開発ルール8: VRM対応の有無がゲームロジックに影響しないこと）。
   *
   * 進行状況・失敗時のエラーは画面右上に小さく表示する（ブラウザの
   * 開発者コンソールを開かなくても状態がわかるようにするため）。
   */
  async _loadHumanVrmAppearance() {
    const statusText = this.add
      .text(SCREEN_WIDTH - 10, 10, 'VRM読み込み中...', {
        fontSize: '13px',
        color: '#88ddaa',
        backgroundColor: '#000000aa',
        padding: { x: 6, y: 3 },
      })
      .setOrigin(1, 0)
      .setDepth(DEPTH.UI);

    const setStatus = (label, color) => {
      if (!this._sceneActive) return;
      statusText.setText(label);
      statusText.setColor(color);
    };

    try {
      let arrayBuffer = vrmSystem.customArrayBuffer;
      if (!arrayBuffer) {
        console.log(`[GameScene] デフォルトVRM(${DEFAULT_VRM_PATH})を読み込みます。`);
        const response = await fetch(DEFAULT_VRM_PATH);
        if (!response.ok) {
          setStatus(`VRM読み込み失敗 (HTTP ${response.status})`, '#ff8888');
          return;
        }
        arrayBuffer = await response.arrayBuffer();
      } else {
        console.log(`[GameScene] アップロード済みVRM(${vrmSystem.customFileName})を使用します。`);
      }

      const snapshotSet = await vrmSystem.renderSnapshotSet(arrayBuffer, 128, (stage) => {
        const labels = {
          'loading-modules': 'VRM: ライブラリ読込中...',
          parsing: 'VRM: 解析中...',
          rendering: 'VRM: 描画中...',
          'rendered-down': 'VRM: 正面を描画中...',
          'rendered-up': 'VRM: 背面を描画中...',
          'rendered-left': 'VRM: 左向きを描画中...',
          'rendered-right': 'VRM: 右向きを描画中...',
          done: 'VRM: 読み込み完了',
        };
        setStatus(labels[stage] ?? 'VRM読み込み中...', '#88ddaa');
      });
      if (!this._sceneActive || !this.humanPlayer?.isAlive) return;

      // 3D描画側(CubeRenderer)の初期化が終わるまで待ってからテクスチャを渡す
      await this._cubeRendererReadyPromise;
      if (!this._sceneActive || !this.cubeRenderer?.ready) {
        setStatus('VRM: 3D描画が未初期化のため反映を保留しました', '#ffcc66');
        return;
      }

      const textureSet = {};
      for (const facing of Object.keys(snapshotSet)) {
        textureSet[facing] = this.cubeRenderer.createCanvasTexture(snapshotSet[facing]);
      }
      this.cubeRenderer.setHumanTextures(this.humanPlayer.playerId, textureSet);

      setStatus('VRM: 表示中', '#88ddaa');
      this.time.delayedCall(2000, () => statusText?.destroy());
    } catch (e) {
      console.error('[GameScene] VRMの読み込みに失敗したため、デフォルト表示のままにします。', e);
      setStatus(`VRM読み込み失敗: ${e.message ?? e}`, '#ff8888');
    }
  }

  _createPlayers(totalParticipants) {
    const startPositions = this.stage.getStartPositions();
    this.players = [];

    for (let i = 0; i < totalParticipants; i++) {
      const pos = startPositions[i] ?? startPositions[0];
      const isHuman = i === 0; // Phase1〜2: 操作可能なのは1人目のみ（ローカル対戦の複数キーマップは将来対応）
      const player = new Player(this, this.stage, pos.face, pos.col, pos.row, {
        colorIndex: i,
        isAI: !isHuman,
        playerId: i + 1,
      });
      this.players.push(player);
    }

    this.humanPlayer = this.players[0];
  }

  _createHud() {
    const hudY = SCREEN_HEIGHT - 54;
    this.hudText = this.add.text(10, hudY, '', {
      fontSize: '16px',
      color: '#ffffff',
    });
    this.hudText.setDepth(DEPTH.UI);
  }

  _createInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.spaceKey.on('down', () => {
      if (this.countdownActive) return;
      this._tryPlaceBomb(this.humanPlayer);
    });
    this.escKey.on('down', () => {
      if (this.countdownActive) return;
      this._pauseGame();
    });
  }

  /** 試合開始前の「3・2・1・START」カウントダウン演出。終了までプレイヤー/AIの行動を止める */
  _startCountdown() {
    this.countdownActive = true;
    const centerX = SCREEN_WIDTH / 2;
    const centerY = (SCREEN_HEIGHT - 64) / 2;

    this.countdownText = this.add
      .text(centerX, centerY, '', { fontSize: '64px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(DEPTH.UI);

    COUNTDOWN_STEPS.forEach((label, i) => {
      this.time.delayedCall(i * COUNTDOWN_STEP_MS, () => {
        this.countdownText.setText(label);
        soundSystem.playSE(label === 'START' ? 'countdown_go' : 'countdown_tick');
      });
    });

    this.time.delayedCall(COUNTDOWN_STEPS.length * COUNTDOWN_STEP_MS, () => {
      this.countdownText.destroy();
      this.countdownActive = false;
      soundSystem.playBGM('game');
    });
  }

  _pauseGame() {
    this.scene.launch(SCENE_KEYS.PAUSE);
    this.scene.pause();
  }

  /** 指定の面・タイルに未爆発の爆弾があるかどうか（移動阻害・設置阻害の判定に使用） */
  _isTileOccupiedByBomb(face, col, row) {
    return this.bombs.some((b) => !b.detonated && b.face === face && b.col === col && b.row === row);
  }

  _tryPlaceBomb(player) {
    if (!player || !player.isAlive) return;
    if (!player.canPlaceBomb()) return;
    if (this._isTileOccupiedByBomb(player.face, player.col, player.row)) return;
    // 壊せる壁(👻取得済みで中に入り込んでいる)の中に立っている間は爆弾を設置できない
    if (!this.stage.canPlaceBombAt(player.face, player.col, player.row)) return;

    const bomb = new Bomb(this, player.face, player.col, player.row, {
      ownerId: player.playerId,
      blastRange: player.blastRange,
      onDetonate: (b) => this._onBombDetonate(b),
    });
    this.bombs.push(bomb);
    this.cubeRenderer?.addBomb(bomb);
    player.onBombPlaced();
    soundSystem.playSE('bomb_place');
  }

  _onBombDetonate(bomb) {
    const isChainReaction = bomb._chainTriggered === true;
    const faceStage = this.stage.getFaceStage(bomb.face);
    const { tiles, broken } = Explosion.computeBlastTiles(faceStage, bomb.col, bomb.row, bomb.blastRange);
    this.cubeRenderer?.showExplosion(bomb.face, tiles, this.time.now);
    this.cubeRenderer?.removeBomb(bomb);
    soundSystem.playSE(isChainReaction ? 'chain_explosion' : 'explosion');

    const owner = this.players.find((p) => p.playerId === bomb.ownerId);
    if (owner) owner.stats.bombsExploded++;

    // 破壊されたブロックの見た目を更新し、アイテム入りブロックだった場合はアイテムを出現させる
    for (const b of broken) {
      this.cubeRenderer?.removeBlockAt(bomb.face, b.col, b.row);
      if (b.spawnItem && b.itemType) {
        const item = new Item(this, bomb.face, b.col, b.row, b.itemType);
        this.items.push(item);
        this.cubeRenderer?.addItem(item);
      }
    }

    // 爆風が届いたマス(同じ面のみ)にいるプレイヤーへダメージ
    for (const player of this.players) {
      if (!player.isAlive || player.face !== bomb.face) continue;
      const hit = tiles.some((t) => t.col === player.col && t.row === player.row);
      if (!hit) continue;

      const wasAlive = player.isAlive;
      player.takeDamage();
      if (wasAlive && !player.isAlive) {
        this.battleSystem.notifyPlayerDied(player);
        if (owner && owner !== player) owner.stats.kills++;
      }
    }

    // 爆風が届いたマス(同じ面のみ)にある他の爆弾を誘爆させる（連鎖爆発）
    for (const other of this.bombs) {
      if (other === bomb || other.detonated || other.face !== bomb.face) continue;
      const hit = tiles.some((t) => t.col === other.col && t.row === other.row);
      if (hit) {
        other._chainTriggered = true;
        other.detonate();
      }
    }

    // 爆弾リストの掃除とプレイヤーの所持数を戻す
    this.bombs = this.bombs.filter((b) => !b.detonated);
    owner?.onBombResolved();
  }

  /** 現在フィールドに存在する爆弾の爆風予測範囲を集計する（AIの危険地帯回避に使用） */
  _computeDangerTiles() {
    const dangerTiles = new Set();
    for (const bomb of this.bombs) {
      if (bomb.detonated) continue;
      const faceStage = this.stage.getFaceStage(bomb.face);
      const { tiles } = Explosion.computeBlastTiles(faceStage, bomb.col, bomb.row, bomb.blastRange, {
        dryRun: true,
      });
      for (const t of tiles) dangerTiles.add(`${bomb.face}:${t.col},${t.row}`);
    }
    return dangerTiles;
  }

  /** プレイヤーが乗っているマスにアイテムがあれば取得・効果適用する */
  _handleItemPickup() {
    if (this.items.length === 0) return;

    for (const player of this.players) {
      if (!player.isAlive || player.isMoving) continue;
      const index = this.items.findIndex((it) => it.face === player.face && it.col === player.col && it.row === player.row);
      if (index === -1) continue;

      const item = this.items[index];
      ItemSystem.applyItem(player, item.type, this);
      player.stats.itemsCollected++;
      this.cubeRenderer?.removeItem(item);
      item.destroy();
      this.items.splice(index, 1);
      soundSystem.playSE('item_get');
    }
  }

  update(time, delta) {
    if (this.countdownActive) return;

    this._handleMovementInput();

    const dangerTiles = this._computeDangerTiles();
    this.aiSystem.update(time, delta, {
      stage: this.stage,
      bombs: this.bombs,
      players: this.players,
      items: this.items,
      dangerTiles,
      placeBomb: (player) => this._tryPlaceBomb(player),
    });

    this._handleItemPickup();

    this.battleSystem.update(delta);
    this._updateHud();

    if (this.cubeRenderer?.ready) {
      this.cubeRenderer.syncPlayers(this.players, time);
      if (this.humanPlayer) this.cubeRenderer.followFace(this.humanPlayer.face);
      this.cubeRenderer.render(time);
    }

    if (this.battleSystem.isOver && !this.resultTriggered) {
      this.resultTriggered = true;
      const humanWon = this.battleSystem.winner === this.humanPlayer;
      soundSystem.playSE(humanWon ? 'victory' : 'defeat');
      soundSystem.stopBGM();

      this.time.delayedCall(1500, () => {
        this.scene.start(SCENE_KEYS.RESULT, {
          winner: this.battleSystem.winner,
          humanPlayerId: this.humanPlayer?.playerId,
          players: this.players.map((p) => ({
            playerId: p.playerId,
            isAI: p.isAI,
            stats: { ...p.stats },
          })),
          finalRanks: Object.fromEntries(this.battleSystem.finalRanks),
        });
      });
    }
  }

  _handleMovementInput() {
    if (!this.humanPlayer || !this.humanPlayer.isAlive) return;
    const isBlockedByBomb = (face, col, row) => this._isTileOccupiedByBomb(face, col, row);

    if (this.cursors.up.isDown) {
      this.humanPlayer.tryMove('up', isBlockedByBomb);
    } else if (this.cursors.down.isDown) {
      this.humanPlayer.tryMove('down', isBlockedByBomb);
    } else if (this.cursors.left.isDown) {
      this.humanPlayer.tryMove('left', isBlockedByBomb);
    } else if (this.cursors.right.isDown) {
      this.humanPlayer.tryMove('right', isBlockedByBomb);
    }
  }

  _updateHud() {
    if (!this.humanPlayer) return;
    const remainingMs = Math.max(0, this.battleSystem.timeLimitMs - this.battleSystem.elapsedMs);
    const seconds = Math.ceil(remainingMs / 1000);
    const alive = this.players.filter((p) => p.isAlive).length;
    const liveRank = this.battleSystem.getLiveRank(this.humanPlayer);

    this.hudText.setText(
      [
        `面: ${this.humanPlayer.face}`,
        `残機: ${this.humanPlayer.lives}`,
        `爆弾: ${this.humanPlayer.activeBombCount}/${this.humanPlayer.maxBombs}`,
        `爆風: ${this.humanPlayer.blastRange}`,
        `順位: ${liveRank ?? '-'}`,
        `生存: ${alive}/${this.players.length}`,
        `残り時間: ${seconds}s`,
      ].join('   ')
    );
  }
}
