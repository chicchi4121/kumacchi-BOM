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
import {
  SCENE_KEYS,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  DEPTH,
  COUNTDOWN_STEPS,
  COUNTDOWN_STEP_MS,
  PLAYER_COLORS,
  PLAYER_COLOR_FILTERS,
  HUMAN_KEY_MAPS,
  MAX_HUMAN_PLAYERS,
  MAX_ONLINE_PLAYERS,
  NETWORK_STATE_BROADCAST_INTERVAL_MS,
  NETWORK_INPUT_SEND_INTERVAL_MS,
  NETWORK_INIT_REQUEST_RETRY_MS,
} from '../constants/GameConstants.js';
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
import {
  createMirrorStage,
  buildMatchInitMessage,
  buildStateMessage,
  buildExplosionEvent,
  buildItemPickupEvent,
  buildResultEvent,
  buildMoveInputMessage,
  buildBombInputMessage,
  pickDirectionFromKeys,
  applyPlayerState,
  diffById,
} from '../systems/NetworkProtocol.js';

const DEFAULT_VRM_PATH = 'assets/vrm/kumacchi.vrm';

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.GAME });
  }

  /**
   * @param {object} data - { mode: 'pvp'|'ai'|'online', playerCount, aiCount, humanCount, timeLimitMs, aiDifficulty, online }
   *   timeLimitMsにInfinityを渡すと「制限時間なし」になる(BattleSystemの
   *   時間切れ判定が自然に発生しなくなる)。
   *   humanCountは同時に操作する人間プレイヤーの人数(ローカルPVP/オンライン
   *   対戦対応。1なら従来通りソロ+AI)。playerCountはhumanCount以上である
   *   必要がある(LobbyScene/OnlineLobbyScene側で保証する)。
   *
   *   mode:'online'の場合、data.onlineに以下を渡す(OnlineLobbyScene参照):
   *   { network: NetworkSystem, role: 'host'|'guest', roomCode,
   *     clientToPlayerId: {clientId: playerId} (hostのみ、送信用) }
   *   オンライン対戦はホスト権威型: ホストの端末だけがゲームロジック全体
   *   (マップ生成・AI・爆弾・勝敗判定)を実行し、ゲストはホストから届く
   *   状態を描画するだけになる(NetworkProtocol.js参照)。
   */
  init(data) {
    const playerCount = data?.playerCount ?? 1;
    const isOnline = data?.mode === 'online';
    const maxHuman = isOnline ? MAX_ONLINE_PLAYERS : MAX_HUMAN_PLAYERS;
    this.config = {
      mode: data?.mode ?? 'ai',
      playerCount,
      aiCount: data?.aiCount ?? 2,
      humanCount: Math.max(1, Math.min(maxHuman, data?.humanCount ?? 1, playerCount)),
      timeLimitMs: data?.timeLimitMs ?? 180000,
      aiDifficulty: data?.aiDifficulty ?? 'normal',
      online: data?.online ?? null,
    };
  }

  create() {
    // このシーンでは実際の見た目(ブロック/プレイヤー/爆弾/アイテム)を
    // CubeRenderer(Three.js)が描画するため、Bomb/Item側で独自にPhaser用の
    // スプライトを作らせないようにするフラグ。
    this.render3D = true;
    this._sceneActive = true;
    this.resultTriggered = false;

    // オンライン対戦のゲスト(参加した側)は、ホストから届くマップ・状態を
    // 受信して描画するだけの別フロー(_createGuestScene)になる。
    // ホスト・ローカル対戦(AI戦/同一キーボードPVP)は従来通り本フローを使う。
    if (this.config.mode === 'online' && this.config.online?.role === 'guest') {
      this._createGuestScene();
      return;
    }

    this.stage = new CubeStage();
    const totalParticipants = Math.min(6, this.config.playerCount + this.config.aiCount);
    this.stage.generate(totalParticipants, this.config.humanCount);

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

    this.events.once('shutdown', () => {
      this._sceneActive = false;
      this.cubeRenderer?.dispose();
      this._offHostNetworkMessage?.();
    });

    if (this.config.mode === 'online') {
      this._setupOnlineHost();
    }

    // 3D描画(Three.js)の初期化は非同期(CDN読込あり)。ゲームロジック側
    // (移動・爆弾・カウントダウン等)はこれを待たずに進行できるようにする。
    this._cubeRendererReadyPromise = this._initCubeRenderer();

    this._startCountdown();
    this._loadAllVrmAppearances();
  }

  // ==========================================================================
  // オンライン対戦(Supabase Realtime): ホスト側
  // ==========================================================================

  /**
   * ホストとして、マップ生成が終わった直後にmatch_init(マップ・出走
   * プレイヤー一覧)を全員へ送信し、以後の入力(input)メッセージを
   * 受け取れるようにする。
   */
  _setupOnlineHost() {
    const network = this.config.online.network;
    this._networkSeq = 0;
    this._networkMoveStates = new Map(); // playerId -> {up,down,left,right} (ネットワーク越しの人間プレイヤーの現在の入力状態)
    this._offHostNetworkMessage = network.onMessage((msg) => this._onHostNetworkMessage(msg));
    this._sendMatchInit();
  }

  _sendMatchInit() {
    const network = this.config.online?.network;
    if (!network) return;
    const matchConfig = {
      aiDifficulty: this.config.aiDifficulty,
      timeLimitMs: this.config.timeLimitMs,
      humanCount: this.config.humanCount,
      aiCount: this.config.aiCount,
      clientToPlayerId: this.config.online.clientToPlayerId ?? {},
    };
    network.send(buildMatchInitMessage(this.stage, this.players, matchConfig));
  }

  /** ゲストからのメッセージ(再送要求・入力)を処理する(ホストのみ) */
  _onHostNetworkMessage(msg) {
    if (!msg) return;
    if (msg.type === 'request_init') {
      this._sendMatchInit();
      return;
    }
    if (msg.type !== 'input') return;

    const clientToPlayerId = this.config.online.clientToPlayerId ?? {};
    const playerId = clientToPlayerId[msg.senderClientId];
    if (!playerId) return; // 未参加・不明なクライアントからの入力は無視する

    if (msg.mode === 'move') {
      this._networkMoveStates.set(playerId, { up: msg.up, down: msg.down, left: msg.left, right: msg.right });
    } else if (msg.mode === 'bomb') {
      const player = this.players.find((p) => p.playerId === playerId);
      if (player) this._tryPlaceBomb(player);
    }
  }

  /** 状態(state)ブロードキャストを一定間隔(NETWORK_STATE_BROADCAST_INTERVAL_MS)で送る(ホストのみ) */
  _broadcastStateIfDue(time) {
    const network = this.config.online?.network;
    if (!network) return;
    if (time - (this._lastStateBroadcastAt ?? 0) < NETWORK_STATE_BROADCAST_INTERVAL_MS) return;
    this._lastStateBroadcastAt = time;
    this._networkSeq += 1;
    network.send(
      buildStateMessage(
        this._networkSeq,
        this.battleSystem.elapsedMs,
        this.players,
        this.bombs,
        this.items,
        this.battleSystem.isOver,
        this.battleSystem.winner?.playerId ?? null
      )
    );
  }

  // ==========================================================================
  // オンライン対戦(Supabase Realtime): ゲスト側
  // ==========================================================================

  /**
   * ゲスト(部屋に参加した側)のシーン初期化。ホストからmatch_initが届く
   * までは「受信中...」を表示するだけで、マップ生成やAI・爆弾等のロジックは
   * 一切実行しない(ホスト権威型: ゲストは描画専用)。
   */
  _createGuestScene() {
    this.bombs = [];
    this.items = [];
    this.players = [];
    this._bombMirrorsById = new Map();
    this._itemMirrorsById = new Map();
    this._matchInitReceived = false;
    this.myPlayerId = null;

    this._createHud();
    this._createGuestInput();

    this._guestStatusText = this.add
      .text(SCREEN_WIDTH / 2, (SCREEN_HEIGHT - 64) / 2, 'ホストの対戦情報を受信中...', {
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 12, y: 8 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.UI);

    const network = this.config.online.network;
    this._offGuestNetworkMessage = network.onMessage((msg) => this._onGuestNetworkMessage(msg));
    network.send({ type: 'request_init' });
    this._guestInitRetryTimer = this.time.addEvent({
      delay: NETWORK_INIT_REQUEST_RETRY_MS,
      loop: true,
      callback: () => {
        if (!this._matchInitReceived) network.send({ type: 'request_init' });
      },
    });

    this.events.once('shutdown', () => {
      this._sceneActive = false;
      this.cubeRenderer?.dispose();
      this._offGuestNetworkMessage?.();
      this._guestInitRetryTimer?.remove();
    });
  }

  /** ゲスト用の入力: 自分の端末の矢印キー+Spaceで操作し、結果はホストへ送信するのみ(ローカルでは移動しない) */
  _createGuestInput() {
    const KeyCodes = Phaser.Input.Keyboard.KeyCodes;
    this.escKey = this.input.keyboard.addKey(KeyCodes.ESC);
    this.escKey.on('down', () => {
      if (this.countdownActive) return;
      this._pauseGame();
    });

    const map = HUMAN_KEY_MAPS[0];
    this._guestKeys = {
      up: this.input.keyboard.addKey(KeyCodes[map.up]),
      down: this.input.keyboard.addKey(KeyCodes[map.down]),
      left: this.input.keyboard.addKey(KeyCodes[map.left]),
      right: this.input.keyboard.addKey(KeyCodes[map.right]),
      bomb: this.input.keyboard.addKey(KeyCodes[map.bomb]),
    };
    this._guestKeys.bomb.on('down', () => {
      if (this.countdownActive || !this.myPlayerId) return;
      this.config.online.network.send(buildBombInputMessage(this.myPlayerId));
    });
  }

  _sendGuestMoveInputIfDue(time) {
    if (!this.myPlayerId) return;
    if (time - (this._lastMoveSendAt ?? 0) < NETWORK_INPUT_SEND_INTERVAL_MS) return;
    this._lastMoveSendAt = time;
    const keys = this._guestKeys;
    this.config.online.network.send(
      buildMoveInputMessage(this.myPlayerId, {
        up: keys.up.isDown,
        down: keys.down.isDown,
        left: keys.left.isDown,
        right: keys.right.isDown,
      })
    );
  }

  _onGuestNetworkMessage(msg) {
    if (!msg) return;
    if (msg.type === 'match_init') this._applyMatchInit(msg);
    else if (msg.type === 'state') this._applyStateMessage(msg);
    else if (msg.type === 'event') this._applyNetworkEvent(msg);
  }

  /** ホストから届いたマップ・出走プレイヤー一覧から、ゲスト側の描画用シーンを組み立てる(初回のみ) */
  _applyMatchInit(msg) {
    if (this._matchInitReceived) return; // 再送されても2重に組み立てない
    this._matchInitReceived = true;
    this._guestInitRetryTimer?.remove();
    this._guestStatusText?.destroy();

    this.stage = createMirrorStage(msg.stage);
    this.config.aiDifficulty = msg.config?.aiDifficulty ?? this.config.aiDifficulty;
    this.config.timeLimitMs = msg.config?.timeLimitMs ?? this.config.timeLimitMs;
    this.myPlayerId = msg.config?.clientToPlayerId?.[this.config.online.network.clientId] ?? null;

    this.players = (msg.roster ?? []).map(
      (r) =>
        new Player(this, this.stage, r.face, r.col, r.row, {
          colorIndex: r.colorIndex,
          isAI: r.isAI,
          playerId: r.playerId,
        })
    );
    this.humanPlayer = this.players.find((p) => p.playerId === this.myPlayerId) ?? this.players[0] ?? null;
    this.humanPlayers = this.humanPlayer ? [this.humanPlayer] : [];

    // BattleSystem本体は持たず、HUD/勝敗表示に必要な最小限のフィールドだけを
    // 持つミラーを用意する(実際の勝敗判定はホストが行い、stateメッセージで
    // 結果を受け取るだけ)。getLiveRankはv1では簡略化しnullを返す(最終結果は
    // 試合終了時のresultイベントで正しく表示される)。
    this.battleSystem = {
      elapsedMs: 0,
      timeLimitMs: this.config.timeLimitMs,
      isOver: false,
      winner: null,
      getLiveRank: () => null,
    };

    this._cubeRendererReadyPromise = this._initCubeRenderer();
    this._startCountdown();
    this._loadAllVrmAppearances();
  }

  _applyStateMessage(msg) {
    if (!this._matchInitReceived) return;
    if (msg.seq != null && this._lastStateSeq != null && msg.seq <= this._lastStateSeq) return; // 順序が入れ替わった古いパケットは無視
    this._lastStateSeq = msg.seq;

    const now = this.time.now;
    for (const state of msg.players ?? []) {
      const player = this.players.find((p) => p.playerId === state.id);
      if (player) applyPlayerState(player, state, now);
    }

    const prevBombs = Array.from(this._bombMirrorsById.values());
    const { added: addedBombs, removed: removedBombs } = diffById(prevBombs, msg.bombs ?? []);
    for (const b of removedBombs) {
      this.cubeRenderer?.removeBomb(this._bombMirrorsById.get(b.id));
      this._bombMirrorsById.delete(b.id);
    }
    for (const b of addedBombs) {
      const mirror = { id: b.id, face: b.face, col: b.col, row: b.row, detonated: false };
      this._bombMirrorsById.set(b.id, mirror);
      this.cubeRenderer?.addBomb(mirror);
    }
    this.bombs = Array.from(this._bombMirrorsById.values());

    const prevItems = Array.from(this._itemMirrorsById.values());
    const { added: addedItems, removed: removedItems } = diffById(prevItems, msg.items ?? []);
    for (const it of removedItems) {
      this.cubeRenderer?.removeItem(this._itemMirrorsById.get(it.id));
      this._itemMirrorsById.delete(it.id);
    }
    for (const it of addedItems) {
      const mirror = { id: it.id, face: it.face, col: it.col, row: it.row, type: it.type };
      this._itemMirrorsById.set(it.id, mirror);
      this.cubeRenderer?.addItem(mirror);
    }
    this.items = Array.from(this._itemMirrorsById.values());

    this.battleSystem.elapsedMs = msg.elapsedMs ?? this.battleSystem.elapsedMs;
    this.battleSystem.isOver = !!msg.isOver;
    if (msg.isOver && msg.winnerId != null && !this.battleSystem.winner) {
      this.battleSystem.winner = this.players.find((p) => p.playerId === msg.winnerId) ?? null;
    }
  }

  /** ホストからの単発イベント(explosion/item_pickup/result)を反映する */
  _applyNetworkEvent(msg) {
    if (msg.kind === 'explosion') {
      this.cubeRenderer?.showExplosion(msg.face, msg.tiles ?? [], this.time.now);
      soundSystem.playSE(msg.isChainReaction ? 'chain_explosion' : 'explosion');
      for (const b of msg.broken ?? []) this.cubeRenderer?.removeBlockAt(msg.face, b.col, b.row);
      for (const m of msg.mirrorBroken ?? []) this.cubeRenderer?.removeBlockAt(m.face, m.col, m.row);
    } else if (msg.kind === 'item_pickup') {
      soundSystem.playSE('item_get');
    } else if (msg.kind === 'result') {
      this._handleGuestResult(msg);
    }
  }

  _handleGuestResult(msg) {
    if (this.resultTriggered) return;
    this.resultTriggered = true;
    this.battleSystem.isOver = true;
    this.battleSystem.winner = this.players.find((p) => p.playerId === msg.winnerId) ?? null;
    const humanWon = this.humanPlayer && this.humanPlayer.playerId === msg.winnerId;
    soundSystem.playSE(humanWon ? 'victory' : 'defeat');
    soundSystem.stopBGM();

    this.time.delayedCall(1500, () => {
      const myIds = this.humanPlayer ? [this.humanPlayer.playerId] : [];
      this.scene.start(SCENE_KEYS.RESULT, {
        winner: this.battleSystem.winner,
        mode: this.config.mode,
        humanPlayerIds: myIds,
        // ゲストは自分の1人分だけをランキング送信対象にする(ホストも
        // 別途自分の1人分だけ送るため、これで参加者全員が重複なく1回ずつ
        // 送信される。update()内のrankingPlayerIdsのコメントも参照)。
        rankingPlayerIds: myIds,
        players: msg.players ?? [],
        finalRanks: msg.finalRanks ?? {},
      });
    });
  }

  /** ゲスト側のメインループ: 自分の入力を送りつつ、受信済みの状態を描画するだけ(ロジックは一切実行しない) */
  _updateGuest(time) {
    if (!this._matchInitReceived) return;
    this._sendGuestMoveInputIfDue(time);
    this._updateHud();
    if (this.cubeRenderer?.ready) {
      this.cubeRenderer.syncPlayers(this.players, time);
      if (this.humanPlayer) this.cubeRenderer.rotateToFace(this.humanPlayer.face, time);
      this.cubeRenderer.render(time);
    }
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
      // 起動直後の初期表示なので、アニメーションさせず即座にその面を正面に向ける
      // (rotateToFace()だと「何もしていないのに立方体が回る」ように見えてしまう)。
      if (this.humanPlayer) this.cubeRenderer.snapToFace(this.humanPlayer.face);
      console.log('[GameScene] サイコロ6面ステージの3D描画(Three.js)を初期化しました。');
    } catch (e) {
      console.error(
        '[GameScene] 3D描画(Three.js)の初期化に失敗しました。CDNへの到達やindex.htmlのimport map設定をご確認ください。',
        e
      );
    }
  }

  /**
   * 全プレイヤーの見た目をVRMモデルの4方向(正面/背面/左/右)スナップショットに
   * 差し替える。
   *
   * - プレイヤー1(自分/humanPlayers[0]): タイトル画面でカスタムVRMが
   *   アップロードされていればそれを、無ければ同梱のデフォルトVRM
   *   (assets/vrm/kumacchi.vrm)を使用する。
   * - それ以外の全員(AI、およびPVPの2人目以降の人間プレイヤー): 「敵キャラを
   *   全部このキャラにしてほしい」という要望に対応し、同梱のデフォルトVRM
   *   (地の色は赤)を各プレイヤーのPLAYER_COLORS配色(赤/青/黄/緑/黒/白)に
   *   合わせて色調補正(PLAYER_COLOR_FILTERS)した見た目にする。VRMを色ごとに
   *   再レンダリングするのはコストが高いため、デフォルトVRMは1回だけ
   *   レンダリングし、色調補正はCanvas2Dのfilterで軽量に行う
   *   (VRMSystem.tintSnapshotSet)。
   *
   * 読込・描画に失敗した場合は何もせず、デフォルトの色付き四角のままにする
   * （開発ルール8: VRM対応の有無がゲームロジックに影響しないこと）。
   *
   * 進行状況・失敗時のエラーは画面右上に小さく表示する（ブラウザの
   * 開発者コンソールを開かなくても状態がわかるようにするため）。
   */
  async _loadAllVrmAppearances() {
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

    const progressLabels = {
      'loading-modules': 'VRM: ライブラリ読込中...',
      parsing: 'VRM: 解析中...',
      rendering: 'VRM: 描画中...',
      'rendered-down': 'VRM: 正面を描画中...',
      'rendered-up': 'VRM: 背面を描画中...',
      'rendered-left': 'VRM: 左向きを描画中...',
      'rendered-right': 'VRM: 右向きを描画中...',
      done: 'VRM: 読み込み完了',
    };
    const onProgress = (stage) => setStatus(progressLabels[stage] ?? 'VRM読み込み中...', '#88ddaa');

    try {
      // 敵キャラ(AI・2人目以降の人間プレイヤー)の見た目のベースとして、
      // 同梱のデフォルトVRMは常に読み込む(自分がカスタムVRMを使っていても、
      // 敵キャラは常に「kumacchi」キャラの色違いにするため)。
      console.log(`[GameScene] 敵キャラ用にデフォルトVRM(${DEFAULT_VRM_PATH})を読み込みます。`);
      let enemyBaseSnapshotSet = null;
      const response = await fetch(DEFAULT_VRM_PATH);
      if (response.ok) {
        const defaultArrayBuffer = await response.arrayBuffer();
        enemyBaseSnapshotSet = await vrmSystem.renderSnapshotSet(defaultArrayBuffer, 128, onProgress);
      } else {
        console.error(
          `[GameScene] デフォルトVRMの読み込みに失敗しました (HTTP ${response.status})。敵キャラは色付き四角のままになります。`
        );
      }

      // プレイヤー1(自分): カスタムVRMがあればそれを使う。無ければ、上で
      // 読み込んだデフォルトVRMのスナップショットをそのまま使い回す
      // (同じファイルを2回レンダリングしない)。
      let primarySnapshotSet = enemyBaseSnapshotSet;
      if (vrmSystem.customArrayBuffer) {
        console.log(`[GameScene] アップロード済みVRM(${vrmSystem.customFileName})を使用します。`);
        primarySnapshotSet = await vrmSystem.renderSnapshotSet(vrmSystem.customArrayBuffer, 128, onProgress);
      }

      if (!this._sceneActive) return;

      // 3D描画側(CubeRenderer)の初期化が終わるまで待ってからテクスチャを渡す
      await this._cubeRendererReadyPromise;
      if (!this._sceneActive || !this.cubeRenderer?.ready) {
        setStatus('VRM: 3D描画が未初期化のため反映を保留しました', '#ffcc66');
        return;
      }

      if (primarySnapshotSet && this.humanPlayer?.isAlive) {
        const textureSet = {};
        for (const facing of Object.keys(primarySnapshotSet)) {
          textureSet[facing] = this.cubeRenderer.createCanvasTexture(primarySnapshotSet[facing]);
        }
        this.cubeRenderer.setPlayerTextures(this.humanPlayer.playerId, textureSet);
      }

      if (enemyBaseSnapshotSet) {
        for (const player of this.players) {
          if (player === this.humanPlayer || !player.isAlive) continue;
          const colorName = PLAYER_COLORS[player.colorIndex % PLAYER_COLORS.length];
          const filterCss = PLAYER_COLOR_FILTERS[colorName] ?? 'none';
          const tintedSet = vrmSystem.tintSnapshotSet(enemyBaseSnapshotSet, filterCss);
          const textureSet = {};
          for (const facing of Object.keys(tintedSet)) {
            textureSet[facing] = this.cubeRenderer.createCanvasTexture(tintedSet[facing]);
          }
          this.cubeRenderer.setPlayerTextures(player.playerId, textureSet);
        }
      }

      setStatus('VRM: 表示中', '#88ddaa');
      this.time.delayedCall(2000, () => statusText?.destroy());
    } catch (e) {
      console.error('[GameScene] VRMの読み込みに失敗したため、デフォルト表示のままにします。', e);
      setStatus(`VRM読み込み失敗: ${e.message ?? e}`, '#ff8888');
    }
  }

  /**
   * CubeStage.generate(totalParticipants, humanCount)は開始地点配列の先頭
   * humanCount件を人間プレイヤー用(PVP時は全員同じ面)、残りをAI用として
   * 順に並べて返すため、そのままインデックスで人間/AIを判定できる。
   */
  _createPlayers(totalParticipants) {
    const startPositions = this.stage.getStartPositions();
    this.players = [];

    for (let i = 0; i < totalParticipants; i++) {
      const pos = startPositions[i] ?? startPositions[0];
      const isHuman = i < this.config.humanCount;
      const player = new Player(this, this.stage, pos.face, pos.col, pos.row, {
        colorIndex: i,
        isAI: !isHuman,
        playerId: i + 1,
      });
      this.players.push(player);
    }

    // humanPlayers[0]が「プレイヤー1」= カメラが常に追従する基準プレイヤー。
    // PVP(humanCount>=2)ではhumanPlayers全員が同じ面から一緒にスタートする
    // ため、プレイヤー1を映しておけば他の人間プレイヤーも同じ面にいる限り
    // 画面に映る(v1の割り切り: 誰かが単独で他の面へ渡った場合、カメラは
    // 引き続きプレイヤー1の面だけを映す)。
    this.humanPlayers = this.players.filter((p) => !p.isAI);
    this.humanPlayer = this.humanPlayers[0];
  }

  _createHud() {
    // PVP(人間プレイヤー複数)では1人1行になり行数が増えるため、下端固定では
    // 画面からはみ出す恐れがある。上端からの表示に変更し、下方向へ伸びる
    // ようにする。
    this.hudText = this.add.text(10, 10, '', {
      fontSize: '15px',
      color: '#ffffff',
      lineSpacing: 4,
    });
    this.hudText.setDepth(DEPTH.UI);
  }

  /**
   * 人間プレイヤー1人につき1つ、HUMAN_KEY_MAPS(GameConstants.js)の
   * キー配列を順番に割り当てる(ローカルPVP対応: 同一キーボードでの
   * ホットシート対戦。プレイヤー1=矢印キー+Space、プレイヤー2=WASD+F、
   * プレイヤー3=IJKL+U、プレイヤー4=テンキー)。
   * ポーズ(ESC)は全員共通の1つのキーのままにする(誰が押しても一時停止)。
   *
   * オンライン対戦のホストは、ローカルキーで操作するのは自分の1人分
   * (humanPlayers[0])だけにする。2人目以降(ネットワーク越しの参加者)は
   * ホストの物理キーボードとは無関係なので、_networkMoveStates(相手から
   * 届いた入力状態)を_handleMovementInputで併せて処理する。
   */
  _createInput() {
    const KeyCodes = Phaser.Input.Keyboard.KeyCodes;
    this.escKey = this.input.keyboard.addKey(KeyCodes.ESC);
    this.escKey.on('down', () => {
      if (this.countdownActive) return;
      this._pauseGame();
    });

    const isOnlineHost = this.config.mode === 'online';
    const localHumanPlayers = isOnlineHost ? this.humanPlayers.slice(0, 1) : this.humanPlayers;

    this._humanInputs = localHumanPlayers.map((player, index) => {
      const map = HUMAN_KEY_MAPS[index] ?? HUMAN_KEY_MAPS[HUMAN_KEY_MAPS.length - 1];
      const keys = {
        up: this.input.keyboard.addKey(KeyCodes[map.up]),
        down: this.input.keyboard.addKey(KeyCodes[map.down]),
        left: this.input.keyboard.addKey(KeyCodes[map.left]),
        right: this.input.keyboard.addKey(KeyCodes[map.right]),
        bomb: this.input.keyboard.addKey(KeyCodes[map.bomb]),
      };
      keys.bomb.on('down', () => {
        if (this.countdownActive) return;
        this._tryPlaceBomb(player);
      });
      return { player, keys };
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
    // (オンライン対戦のホストの場合、ゲストへ送るexplosionイベントに含める
    // ため、実際に破壊が確定したマスをmirrorBrokenForBroadcastへ集める)
    const mirrorBrokenForBroadcast = [];
    for (const b of broken) {
      this.cubeRenderer?.removeBlockAt(bomb.face, b.col, b.row);
      if (b.spawnItem && b.itemType) {
        const item = new Item(this, bomb.face, b.col, b.row, b.itemType);
        this.items.push(item);
        this.cubeRenderer?.addItem(item);
      }
      // 面の隅・approachマスを壊した場合は、面をまたいだ先(隣接面)の対応する
      // マスも連動して破壊する。爆風は面をまたいで伝播しないため、これが無いと
      // 隣接面側の対応マスが壊せる壁のまま残り、👻無しでは絶対に足を踏み入れ
      // られず、結果的にその面から一切移動できなくなってしまう(不具合修正)。
      for (const mirror of this.stage.getMirrorCells(bomb.face, b.col, b.row)) {
        const mirrorResult = this.stage.breakBlock(mirror.face, mirror.col, mirror.row);
        if (mirrorResult.destroyed) {
          this.cubeRenderer?.removeBlockAt(mirror.face, mirror.col, mirror.row);
          mirrorBrokenForBroadcast.push({ face: mirror.face, col: mirror.col, row: mirror.row });
          if (mirrorResult.spawnItem && mirrorResult.itemType) {
            const mirrorItem = new Item(this, mirror.face, mirror.col, mirror.row, mirrorResult.itemType);
            this.items.push(mirrorItem);
            this.cubeRenderer?.addItem(mirrorItem);
          }
        }
      }
    }

    // オンライン対戦のホストは、ゲスト側でも爆風エフェクト・ブロック破壊を
    // 即座に反映できるよう単発イベントとして送る(周期的なstate同期だけだと
    // 爆風の一瞬の見た目や破壊タイミングが揃わないため)。
    if (this.config.mode === 'online') {
      this.config.online.network.send(
        buildExplosionEvent(bomb, tiles, broken, mirrorBrokenForBroadcast, isChainReaction)
      );
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

      if (this.config.mode === 'online') {
        this.config.online.network.send(buildItemPickupEvent(item, player.playerId));
      }
    }
  }

  update(time, delta) {
    if (this.countdownActive) return;

    if (this.config.mode === 'online' && this.config.online?.role === 'guest') {
      this._updateGuest(time);
      return;
    }

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
      if (this.humanPlayer) this.cubeRenderer.rotateToFace(this.humanPlayer.face, time);
      this.cubeRenderer.render(time);
    }

    if (this.config.mode === 'online') this._broadcastStateIfDue(time);

    if (this.battleSystem.isOver && !this.resultTriggered) {
      this.resultTriggered = true;
      // PVP(人間複数)では「人間の誰かが勝ったか」で勝利/敗北SEを選ぶ
      const humanWon = (this.humanPlayers ?? []).includes(this.battleSystem.winner);
      soundSystem.playSE(humanWon ? 'victory' : 'defeat');
      soundSystem.stopBGM();

      // rankingPlayerIds: ランキング(RankingSystem)に対戦結果を送信すべき
      // 「このブラウザ(クライアント)が実際に操作していたプレイヤー」のID。
      // ai/ローカルPVPでは1つの端末が試合全体を実行するのでhumanPlayerIds
      // とそのまま同じでよいが、オンライン対戦ではホスト・各ゲストが
      // それぞれ独立にResultSceneへ遷移するため、humanPlayerIds(=試合参加者
      // 全員の人間プレイヤーID)をそのまま使うと、全員分のランキング行が
      // クライアントの数だけ重複送信されてしまう。オンライン対戦時は
      // 「自分の1人分」だけに絞る。
      const rankingPlayerIds =
        this.config.mode === 'online'
          ? [this.humanPlayers?.[0]?.playerId].filter((id) => id != null)
          : (this.humanPlayers ?? []).map((p) => p.playerId);

      const resultPayload = {
        winner: this.battleSystem.winner,
        mode: this.config.mode,
        humanPlayerIds: (this.humanPlayers ?? []).map((p) => p.playerId),
        rankingPlayerIds,
        players: this.players.map((p) => ({
          playerId: p.playerId,
          isAI: p.isAI,
          stats: { ...p.stats },
        })),
        finalRanks: Object.fromEntries(this.battleSystem.finalRanks),
      };

      // オンライン対戦のホストは、ゲスト側も同じタイミングでリザルトへ
      // 遷移できるよう結果をブロードキャストする。
      if (this.config.mode === 'online') {
        this.config.online.network.send(
          buildResultEvent(this.battleSystem.winner?.playerId ?? null, resultPayload.players, resultPayload.finalRanks)
        );
      }

      this.time.delayedCall(1500, () => {
        this.scene.start(SCENE_KEYS.RESULT, resultPayload);
      });
    }
  }

  /**
   * 人間プレイヤーぶん移動入力を処理する。ローカル(ホスト自身を含む)は
   * 割り当てキー(_humanInputs)を毎フレーム参照し、オンライン対戦で
   * ネットワーク越しに参加している人間プレイヤーは、直近に届いた入力状態
   * (_networkMoveStates、_onHostNetworkMessage参照)を参照する。
   */
  _handleMovementInput() {
    const isBlockedByBomb = (face, col, row) => this._isTileOccupiedByBomb(face, col, row);

    for (const { player, keys } of this._humanInputs ?? []) {
      if (!player.isAlive) continue;
      if (keys.up.isDown) {
        player.tryMove('up', isBlockedByBomb);
      } else if (keys.down.isDown) {
        player.tryMove('down', isBlockedByBomb);
      } else if (keys.left.isDown) {
        player.tryMove('left', isBlockedByBomb);
      } else if (keys.right.isDown) {
        player.tryMove('right', isBlockedByBomb);
      }
    }

    if (this._networkMoveStates) {
      for (const [playerId, keysState] of this._networkMoveStates) {
        const player = this.players.find((p) => p.playerId === playerId);
        if (!player || !player.isAlive) continue;
        const direction = pickDirectionFromKeys(keysState);
        if (direction) player.tryMove(direction, isBlockedByBomb);
      }
    }
  }

  /** 残り時間の表示用文字列。「制限時間なし」(timeLimitMs=Infinity)なら∞と表示する */
  _formatRemainingTime() {
    if (!Number.isFinite(this.battleSystem.timeLimitMs)) return '∞';
    const remainingMs = Math.max(0, this.battleSystem.timeLimitMs - this.battleSystem.elapsedMs);
    return `${Math.ceil(remainingMs / 1000)}s`;
  }

  /**
   * PVP(人間プレイヤーが複数)対応: 全員ぶんのステータスを1行ずつ表示する。
   * ソロ+AIモード(人間1人)では従来通り1行のみになる。
   */
  _updateHud() {
    if (!this.humanPlayers || this.humanPlayers.length === 0) return;
    const alive = this.players.filter((p) => p.isAlive).length;
    const remainingLabel = this._formatRemainingTime();

    const lines = this.humanPlayers.map((player, index) => {
      const liveRank = this.battleSystem.getLiveRank(player);
      const label = this.humanPlayers.length > 1 ? `P${index + 1} ` : '';
      return (
        `${label}面:${player.face} 残機:${player.lives} ` +
        `爆弾:${player.activeBombCount}/${player.maxBombs} 爆風:${player.blastRange} 順位:${liveRank ?? '-'}`
      );
    });
    lines.push(`生存: ${alive}/${this.players.length}   残り時間: ${remainingLabel}`);

    this.hudText.setText(lines);
  }
}
