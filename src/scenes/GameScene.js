/**
 * GameScene.js
 * ------------------------------------------------------------
 * 対戦本編を進行させるメインシーン。
 *
 * Phase1で構築した基盤（マップ生成・移動・爆弾・爆発・当たり判定）に加え、
 * Phase2で以下を実装する:
 *   ・アイテム出現・取得・効果適用（ItemSystem連携）
 *   ・AI行動（AISystem経由でAI.jsの思考ルーチンを実行、危険地帯の共有）
 *   ・詳細な勝敗判定・順位確定・撃破数等のスコア集計（BattleSystem連携）
 *   ・UI強化（順位・カウントダウン）
 *   ・BGM・効果音（SoundSystem連携）
 *
 * 必殺技の発動(Phase3)・VRM(Phase3)は未対応のまま。
 * ------------------------------------------------------------
 */
import {
  SCENE_KEYS,
  GRID_COLS,
  GRID_ROWS,
  TILE_SIZE,
  DEPTH,
  COUNTDOWN_STEPS,
  COUNTDOWN_STEP_MS,
} from '../constants/GameConstants.js';
import { Stage } from '../objects/Stage.js';
import { Block } from '../objects/Block.js';
import { Player } from '../objects/Player.js';
import { Bomb } from '../objects/Bomb.js';
import { Explosion } from '../objects/Explosion.js';
import { Item } from '../objects/Item.js';
import { AISystem } from '../systems/AISystem.js';
import { ItemSystem } from '../systems/ItemSystem.js';
import { BattleSystem } from '../systems/BattleSystem.js';
import { soundSystem } from '../systems/SoundSystem.js';

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
    this.stage = new Stage(GRID_COLS, GRID_ROWS);
    const totalParticipants = Math.min(6, this.config.playerCount + this.config.aiCount);
    this.stage.generate(totalParticipants);

    this.blockSprites = this._renderBlocks(this.stage);
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

    this._startCountdown();
  }

  /** Stage.gridの内容に合わせてBlockオブジェクトを生成する */
  _renderBlocks(stage) {
    const sprites = [];
    for (let row = 0; row < stage.rows; row++) {
      const line = [];
      for (let col = 0; col < stage.cols; col++) {
        const type = stage.getBlockType(col, row);
        line.push(new Block(this, col, row, type));
      }
      sprites.push(line);
    }
    return sprites;
  }

  _createPlayers(totalParticipants) {
    const startPositions = this.stage.getStartPositions();
    this.players = [];

    for (let i = 0; i < totalParticipants; i++) {
      const pos = startPositions[i] ?? startPositions[0];
      const isHuman = i === 0; // Phase1〜2: 操作可能なのは1人目のみ（ローカル対戦の複数キーマップは将来対応）
      const player = new Player(this, this.stage, pos.col, pos.row, {
        colorIndex: i,
        isAI: !isHuman,
        playerId: i + 1,
      });
      this.players.push(player);
    }

    this.humanPlayer = this.players[0];
  }

  _createHud() {
    const hudY = GRID_ROWS * TILE_SIZE + 10;
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
    const centerX = GRID_COLS * TILE_SIZE / 2;
    const centerY = GRID_ROWS * TILE_SIZE / 2;

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

  /** 指定タイルに未爆発の爆弾があるかどうか（移動阻害・設置阻害の判定に使用） */
  _isTileOccupiedByBomb(col, row) {
    return this.bombs.some((b) => !b.detonated && b.col === col && b.row === row);
  }

  _tryPlaceBomb(player) {
    if (!player || !player.isAlive) return;
    if (!player.canPlaceBomb()) return;
    if (this._isTileOccupiedByBomb(player.col, player.row)) return;

    const bomb = new Bomb(this, player.col, player.row, {
      ownerId: player.playerId,
      blastRange: player.blastRange,
      onDetonate: (b) => this._onBombDetonate(b),
    });
    this.bombs.push(bomb);
    player.onBombPlaced();
    soundSystem.playSE('bomb_place');
  }

  _onBombDetonate(bomb) {
    const isChainReaction = bomb._chainTriggered === true;
    const { tiles, broken } = Explosion.computeBlastTiles(this.stage, bomb.col, bomb.row, bomb.blastRange);
    Explosion.render(this, tiles);
    soundSystem.playSE(isChainReaction ? 'chain_explosion' : 'explosion');

    const owner = this.players.find((p) => p.playerId === bomb.ownerId);
    if (owner) owner.stats.bombsExploded++;

    // 破壊されたブロックの見た目を更新し、アイテム入りブロックだった場合はアイテムを出現させる
    for (const b of broken) {
      const blockObj = this.blockSprites[b.row]?.[b.col];
      blockObj?.destroy();
      if (b.spawnItem && b.itemType) {
        this.items.push(new Item(this, b.col, b.row, b.itemType));
      }
    }

    // 爆風が届いたマスにいるプレイヤーへダメージ
    for (const player of this.players) {
      if (!player.isAlive) continue;
      const hit = tiles.some((t) => t.col === player.col && t.row === player.row);
      if (!hit) continue;

      const wasAlive = player.isAlive;
      player.takeDamage();
      if (wasAlive && !player.isAlive) {
        this.battleSystem.notifyPlayerDied(player);
        if (owner && owner !== player) owner.stats.kills++;
      }
    }

    // 爆風が届いたマスにある他の爆弾を誘爆させる（連鎖爆発）
    for (const other of this.bombs) {
      if (other === bomb || other.detonated) continue;
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
      const { tiles } = Explosion.computeBlastTiles(this.stage, bomb.col, bomb.row, bomb.blastRange, {
        dryRun: true,
      });
      for (const t of tiles) dangerTiles.add(`${t.col},${t.row}`);
    }
    return dangerTiles;
  }

  /** プレイヤーが乗っているマスにアイテムがあれば取得・効果適用する */
  _handleItemPickup() {
    if (this.items.length === 0) return;

    for (const player of this.players) {
      if (!player.isAlive || player.isMoving) continue;
      const index = this.items.findIndex((it) => it.col === player.col && it.row === player.row);
      if (index === -1) continue;

      const item = this.items[index];
      ItemSystem.applyItem(player, item.type, this);
      player.stats.itemsCollected++;
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
    const isBlockedByBomb = (col, row) => this._isTileOccupiedByBomb(col, row);

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
