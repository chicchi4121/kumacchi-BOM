/**
 * GameScene.js
 * ------------------------------------------------------------
 * 対戦本編を進行させるメインシーン。
 * Phase1では以下の基盤機能を提供する:
 *   ・Phaser環境上でのマップ生成（Stage）
 *   ・プレイヤー移動（Player、矢印キー操作）
 *   ・爆弾設置・爆発・連鎖爆発（Bomb / Explosion）
 *   ・壁・ブロックとの当たり判定
 *   ・簡易な勝敗判定（BattleSystem）とポーズ（Esc→PauseScene）
 *
 * AI行動そのもの(Phase2)やアイテム取得(Phase2)、必殺技発動UI(Phase3)は
 * 各クラスにフックを用意した状態で、本シーンからは最小限の呼び出しに
 * 留めている（開発ルール10: フェーズ単位で実装・テストを繰り返す）。
 * ------------------------------------------------------------
 */
import {
  SCENE_KEYS,
  GRID_COLS,
  GRID_ROWS,
  TILE_SIZE,
  DEPTH,
} from '../constants/GameConstants.js';
import { Stage } from '../objects/Stage.js';
import { Block } from '../objects/Block.js';
import { Player } from '../objects/Player.js';
import { Bomb } from '../objects/Bomb.js';
import { Explosion } from '../objects/Explosion.js';
import { AI } from '../objects/AI.js';
import { BattleSystem } from '../systems/BattleSystem.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.GAME });
  }

  /**
   * @param {object} data - { mode: 'pvp'|'ai', playerCount, aiCount, timeLimitMs }
   */
  init(data) {
    this.config = {
      mode: data?.mode ?? 'ai',
      playerCount: data?.playerCount ?? 1,
      aiCount: data?.aiCount ?? 2,
      timeLimitMs: data?.timeLimitMs ?? 180000,
    };
  }

  create() {
    this.stage = new Stage(GRID_COLS, GRID_ROWS);
    const totalParticipants = Math.min(6, this.config.playerCount + this.config.aiCount);
    this.stage.generate(totalParticipants);

    this.blockSprites = this._renderBlocks(this.stage);
    this.bombs = [];
    this.items = [];
    this.aiControllers = [];

    this._createPlayers(totalParticipants);
    this._createHud();
    this._createInput();

    this.battleSystem = new BattleSystem(this.players, { timeLimitMs: this.config.timeLimitMs });
    this.resultTriggered = false;
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
      const isHuman = i === 0; // Phase1: 操作可能なのは1人目のみ（ローカル対戦の複数キーマップは将来対応）
      const player = new Player(this, this.stage, pos.col, pos.row, {
        colorIndex: i,
        isAI: !isHuman,
        playerId: i + 1,
      });
      this.players.push(player);

      if (!isHuman) {
        this.aiControllers.push(new AI(player, 'normal'));
      }
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

    this.spaceKey.on('down', () => this._tryPlaceBomb(this.humanPlayer));
    this.escKey.on('down', () => this._pauseGame());
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
  }

  _onBombDetonate(bomb) {
    const { tiles, broken } = Explosion.computeBlastTiles(this.stage, bomb.col, bomb.row, bomb.blastRange);
    Explosion.render(this, tiles);

    // 破壊されたブロックの見た目を更新
    for (const b of broken) {
      const blockObj = this.blockSprites[b.row]?.[b.col];
      blockObj?.destroy();
      // TODO(Phase2): b.spawnItem === true の場合、Item.jsでアイテムを出現させる。
    }

    // 爆風が届いたマスにいるプレイヤーへダメージ
    for (const player of this.players) {
      if (!player.isAlive) continue;
      const hit = tiles.some((t) => t.col === player.col && t.row === player.row);
      if (hit) player.takeDamage();
    }

    // 爆風が届いたマスにある他の爆弾を誘爆させる（連鎖爆発）
    for (const other of this.bombs) {
      if (other === bomb || other.detonated) continue;
      const hit = tiles.some((t) => t.col === other.col && t.row === other.row);
      if (hit) other.detonate();
    }

    // 爆弾リストの掃除とプレイヤーの所持数を戻す
    this.bombs = this.bombs.filter((b) => !b.detonated);
    const owner = this.players.find((p) => p.playerId === bomb.ownerId);
    owner?.onBombResolved();
  }

  update(time, delta) {
    this._handleMovementInput();

    for (const ai of this.aiControllers) {
      ai.update(time, delta, { stage: this.stage, bombs: this.bombs, players: this.players });
    }

    this.battleSystem.update(delta);
    this._updateHud();

    if (this.battleSystem.isOver && !this.resultTriggered) {
      this.resultTriggered = true;
      this.time.delayedCall(1200, () => {
        this.scene.start(SCENE_KEYS.RESULT, { winner: this.battleSystem.winner });
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

    this.hudText.setText(
      [
        `残機: ${this.humanPlayer.lives}`,
        `爆弾: ${this.humanPlayer.activeBombCount}/${this.humanPlayer.maxBombs}`,
        `爆風: ${this.humanPlayer.blastRange}`,
        `生存: ${alive}/${this.players.length}`,
        `残り時間: ${seconds}s`,
      ].join('   ')
    );
  }
}
