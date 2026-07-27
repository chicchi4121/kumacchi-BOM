/**
 * OnlineLobbyScene.js
 * ------------------------------------------------------------
 * オンライン対戦(Supabase Realtime)の部屋作成・参加を行う画面。
 *
 * ローカル対戦(LobbyScene.js、同一キーボードでのAI戦/ホットシートPVP)とは
 * 別の入口として、TitleScene.jsから「オンライン対戦」で遷移してくる。
 *
 * ・「部屋を作る」→ホストとして部屋(Realtimeチャンネル)を作成し、5文字の
 *   部屋コードを表示する。参加者(ゲスト)が増えるとリアルタイムに一覧へ
 *   反映される(presence)。AI人数・難易度・制限時間を選んで「対戦開始」を
 *   押すと、参加者全員に開始の合図を送ってGameSceneへ遷移する。
 * ・「部屋に参加する」→ホストから伝えられた部屋コードを入力して接続する。
 *   ホストが対戦を開始するまで待機し、合図を受け取ったら自動的にGameScene
 *   へ遷移する。
 *
 * Supabase未設定(src/config/supabaseConfig.js)の場合はその旨を表示し、
 * ローカル対戦は従来通りプレイできる(開発ルール8と同じフォールバック設計)。
 * ------------------------------------------------------------
 */
import { SCENE_KEYS, SCREEN_WIDTH, SCREEN_HEIGHT, MAX_PLAYERS, MAX_ONLINE_PLAYERS } from '../constants/GameConstants.js';
import { soundSystem } from '../systems/SoundSystem.js';
import { NetworkSystem } from '../systems/NetworkSystem.js';
import {
  buildStartGameMessage,
  presenceStateToParticipants,
  buildClientToPlayerId,
  normalizeRoomCode,
} from '../systems/NetworkProtocol.js';
import { DIFFICULTY_ORDER, DIFFICULTY_LABEL, TIME_LIMIT_OPTIONS_SEC } from './LobbyScene.js';

export class OnlineLobbyScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.ONLINE_LOBBY });
  }

  init() {
    this.network = null;
    this.role = null; // 'host' | 'guest'
    this.settings = {
      aiCount: 1,
      difficultyIndex: DIFFICULTY_ORDER.indexOf('normal'),
      timeLimitIndex: TIME_LIMIT_OPTIONS_SEC.indexOf(180),
    };
  }

  async create() {
    const centerX = SCREEN_WIDTH / 2;
    this._sceneActive = true;

    this.add.text(centerX, 50, 'オンライン対戦', { fontSize: '28px', color: '#ffffff' }).setOrigin(0.5);

    this.bodyContainer = this.add.container(0, 0);
    this._showChecking();

    const available = await NetworkSystem.isAvailable().catch(() => false);
    if (!this._sceneActive) return;
    if (!available) {
      this._showUnavailable();
      return;
    }
    this._showModeSelect();

    this.events.once('shutdown', () => {
      this._sceneActive = false;
      this._cleanupNetwork();
    });
  }

  _clearBody() {
    this.bodyContainer.removeAll(true);
  }

  _showChecking() {
    this._clearBody();
    const text = this.add
      .text(SCREEN_WIDTH / 2, 200, 'Supabaseの接続状況を確認中...', { fontSize: '16px', color: '#cccccc' })
      .setOrigin(0.5);
    this.bodyContainer.add(text);
  }

  _showUnavailable() {
    this._clearBody();
    const centerX = SCREEN_WIDTH / 2;
    const lines = [
      'Supabaseが設定されていないため、オンライン対戦は利用できません。',
      '',
      'src/config/supabaseConfig.js に、あなたのSupabaseプロジェクトの',
      'Project URL と anon(publishable) key を設定してください。',
      '(supabase/schema.sql をSQL Editorで実行する手順もREADME.mdを参照)',
    ];
    const text = this.add
      .text(centerX, 200, lines.join('\n'), { fontSize: '15px', color: '#ffcc66', align: 'center' })
      .setOrigin(0.5);
    const backText = this._createButton(centerX, 340, 'タイトルに戻る', () => this.scene.start(SCENE_KEYS.TITLE));
    this.bodyContainer.add([text, backText]);
  }

  _showModeSelect() {
    this._clearBody();
    const centerX = SCREEN_WIDTH / 2;
    const createBtn = this._createButton(centerX, 180, '部屋を作る(ホスト)', () => this._createRoom());
    const joinBtn = this._createButton(centerX, 250, '部屋に参加する(コード入力)', () => this._promptJoinRoom());
    const backBtn = this._createButton(centerX, 340, 'タイトルに戻る', () => this.scene.start(SCENE_KEYS.TITLE));
    this.bodyContainer.add([createBtn, joinBtn, backBtn]);
  }

  // ---- ホスト: 部屋作成 ----------------------------------------------------

  async _createRoom() {
    this._clearBody();
    const centerX = SCREEN_WIDTH / 2;
    const statusText = this.add.text(centerX, 150, '部屋を作成中...', { fontSize: '16px', color: '#cccccc' }).setOrigin(0.5);
    this.bodyContainer.add(statusText);

    try {
      this.network = new NetworkSystem();
      const roomCode = await this.network.createRoom();
      this.role = 'host';
      if (!this._sceneActive) return;
      this._showHostRoom(roomCode);
    } catch (e) {
      console.error('[OnlineLobbyScene] 部屋の作成に失敗しました。', e);
      statusText.setText(`部屋の作成に失敗しました: ${e.message ?? e}`);
    }
  }

  _showHostRoom(roomCode) {
    this._clearBody();
    const centerX = SCREEN_WIDTH / 2;

    const codeLabel = this.add
      .text(centerX, 110, `部屋コード: ${roomCode}`, { fontSize: '26px', color: '#ffe066' })
      .setOrigin(0.5);
    const hintLabel = this.add
      .text(centerX, 145, 'このコードを対戦相手に伝えてください', { fontSize: '13px', color: '#aaaaaa' })
      .setOrigin(0.5);

    this.participantsText = this.add
      .text(centerX, 190, '', { fontSize: '14px', color: '#ffffff', align: 'center' })
      .setOrigin(0.5, 0);

    const aiRow = this._createStepperRow(
      centerX,
      270,
      'AI追加人数',
      () => `${this.settings.aiCount}人`,
      {
        onDecrease: () => {
          this.settings.aiCount = Math.max(0, this.settings.aiCount - 1);
        },
        onIncrease: () => {
          const maxAi = Math.max(0, MAX_PLAYERS - this._humanCount());
          this.settings.aiCount = Math.min(maxAi, this.settings.aiCount + 1);
        },
      }
    );

    const difficultyRow = this._createStepperRow(
      centerX,
      315,
      'AI難易度',
      () => DIFFICULTY_LABEL[DIFFICULTY_ORDER[this.settings.difficultyIndex]],
      {
        onDecrease: () => {
          this.settings.difficultyIndex = Math.max(0, this.settings.difficultyIndex - 1);
        },
        onIncrease: () => {
          this.settings.difficultyIndex = Math.min(DIFFICULTY_ORDER.length - 1, this.settings.difficultyIndex + 1);
        },
      }
    );

    const timeLimitRow = this._createStepperRow(
      centerX,
      360,
      '制限時間',
      () =>
        TIME_LIMIT_OPTIONS_SEC[this.settings.timeLimitIndex] === null
          ? '制限時間なし'
          : `${TIME_LIMIT_OPTIONS_SEC[this.settings.timeLimitIndex]}秒`,
      {
        onDecrease: () => {
          this.settings.timeLimitIndex = Math.max(0, this.settings.timeLimitIndex - 1);
        },
        onIncrease: () => {
          this.settings.timeLimitIndex = Math.min(TIME_LIMIT_OPTIONS_SEC.length - 1, this.settings.timeLimitIndex + 1);
        },
      }
    );

    const startBtn = this._createButton(centerX, 420, '対戦開始', () => this._startAsHost());
    const backBtn = this._createButton(centerX, 470, 'やめる', () => this.scene.start(SCENE_KEYS.TITLE));

    this.bodyContainer.add([
      codeLabel,
      hintLabel,
      this.participantsText,
      aiRow.label,
      aiRow.valueText,
      aiRow.minusBtn,
      aiRow.plusBtn,
      difficultyRow.label,
      difficultyRow.valueText,
      difficultyRow.minusBtn,
      difficultyRow.plusBtn,
      timeLimitRow.label,
      timeLimitRow.valueText,
      timeLimitRow.minusBtn,
      timeLimitRow.plusBtn,
      startBtn,
      backBtn,
    ]);

    this._offPresence = this.network.onPresenceChange(() => this._refreshParticipants());
    this._refreshParticipants();
  }

  _humanCount() {
    return presenceStateToParticipants(this.network?.getPresenceState() ?? {}).length || 1;
  }

  _refreshParticipants() {
    const participants = presenceStateToParticipants(this.network.getPresenceState());
    const count = Math.max(1, participants.length);
    const maxAi = Math.max(0, MAX_PLAYERS - count);
    this.settings.aiCount = Math.min(this.settings.aiCount, maxAi);
    const label = participants
      .map((p, i) => (p.isHost ? `P${i + 1}(ホスト・あなた)` : `P${i + 1}`))
      .join(' / ');
    this.participantsText?.setText(`参加者(${count}/${MAX_ONLINE_PLAYERS}人): ${label || '(取得中...)'}`);
  }

  async _startAsHost() {
    const participants = presenceStateToParticipants(this.network.getPresenceState());
    const humanCount = Math.max(1, Math.min(MAX_ONLINE_PLAYERS, participants.length || 1));
    const aiCount = Math.max(0, Math.min(MAX_PLAYERS - humanCount, this.settings.aiCount));
    const clientToPlayerId = buildClientToPlayerId(participants.length ? participants : [{ clientId: this.network.clientId, isHost: true, joinedAt: 0 }]);
    const timeLimitSec = TIME_LIMIT_OPTIONS_SEC[this.settings.timeLimitIndex];

    const matchConfig = {
      humanCount,
      aiCount,
      aiDifficulty: DIFFICULTY_ORDER[this.settings.difficultyIndex],
      timeLimitMs: timeLimitSec === null ? Infinity : timeLimitSec * 1000,
      clientToPlayerId,
    };

    soundSystem.playSE('button');
    this.network.send(buildStartGameMessage(matchConfig));
    this._offPresence?.();
    this._handedOffToGame = true;
    this.scene.start(SCENE_KEYS.GAME, {
      mode: 'online',
      playerCount: matchConfig.humanCount,
      humanCount: matchConfig.humanCount,
      aiCount: matchConfig.aiCount,
      aiDifficulty: matchConfig.aiDifficulty,
      timeLimitMs: matchConfig.timeLimitMs,
      online: { network: this.network, role: 'host', roomCode: this.network.roomCode, clientToPlayerId },
    });
  }

  // ---- ゲスト: 部屋参加 -----------------------------------------------------

  _promptJoinRoom() {
    const input = window.prompt('ホストから伝えられた部屋コードを入力してください');
    if (!input) return;
    this._joinRoom(normalizeRoomCode(input));
  }

  async _joinRoom(roomCode) {
    this._clearBody();
    const centerX = SCREEN_WIDTH / 2;
    const statusText = this.add
      .text(centerX, 200, `部屋(${roomCode})に接続中...`, { fontSize: '16px', color: '#cccccc' })
      .setOrigin(0.5);
    this.bodyContainer.add(statusText);

    try {
      this.network = new NetworkSystem();
      await this.network.joinRoom(roomCode);
      this.role = 'guest';
      if (!this._sceneActive) return;
      statusText.setText(`部屋(${roomCode})に接続しました。\nホストが対戦を開始するのを待っています...`);
      this._offGuestMessage = this.network.onMessage((msg) => {
        if (msg?.type === 'start_game') this._onHostStartedGame(msg);
      });
      const backBtn = this._createButton(centerX, 300, 'やめる', () => this.scene.start(SCENE_KEYS.TITLE));
      this.bodyContainer.add(backBtn);
    } catch (e) {
      console.error('[OnlineLobbyScene] 部屋への接続に失敗しました。', e);
      statusText.setText(`接続に失敗しました。部屋コードをご確認ください。\n(${e.message ?? e})`);
      const backBtn = this._createButton(centerX, 300, 'タイトルに戻る', () => this.scene.start(SCENE_KEYS.TITLE));
      this.bodyContainer.add(backBtn);
    }
  }

  _onHostStartedGame(msg) {
    this._offGuestMessage?.();
    this._handedOffToGame = true;
    this.scene.start(SCENE_KEYS.GAME, {
      mode: 'online',
      playerCount: msg.humanCount,
      humanCount: msg.humanCount,
      aiCount: msg.aiCount,
      aiDifficulty: msg.aiDifficulty,
      timeLimitMs: msg.timeLimitMs,
      online: { network: this.network, role: 'guest', roomCode: this.network.roomCode },
    });
  }

  // ---- 共通UI部品 -----------------------------------------------------------

  _createButton(x, y, label, onClick) {
    const text = this.add
      .text(x, y, label, {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#3a3a3a',
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    text.on('pointerover', () => text.setStyle({ backgroundColor: '#55606e' }));
    text.on('pointerout', () => text.setStyle({ backgroundColor: '#3a3a3a' }));
    text.on('pointerdown', () => {
      soundSystem.playSE('button');
      onClick();
    });
    return text;
  }

  _createStepperRow(x, y, labelText, getValueLabel, { onDecrease, onIncrease }) {
    const label = this.add.text(x - 220, y, labelText, { fontSize: '16px', color: '#ffffff' }).setOrigin(0, 0.5);
    const valueText = this.add.text(x + 30, y, getValueLabel(), { fontSize: '16px', color: '#ffe066' }).setOrigin(0.5);
    const refresh = () => valueText.setText(getValueLabel());

    const minusBtn = this._createStepperButton(x - 60, y, '-', () => {
      onDecrease();
      refresh();
    });
    const plusBtn = this._createStepperButton(x + 150, y, '+', () => {
      onIncrease();
      refresh();
    });

    return { label, valueText, minusBtn, plusBtn, refresh };
  }

  _createStepperButton(x, y, label, onClick) {
    const btn = this.add
      .text(x, y, label, { fontSize: '18px', color: '#ffffff', backgroundColor: '#3a3a3a', padding: { x: 10, y: 2 } })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => {
      soundSystem.playSE('button');
      onClick();
    });
    return btn;
  }

  _cleanupNetwork() {
    // GameSceneへ遷移した場合(_handedOffToGame)はnetworkをそのまま使い続ける
    // ため切断しない(GameScene側がライフサイクルを引き継ぐ)。ロビー画面を
    // 離れて対戦を開始しなかった場合(タイトルに戻る等)のみここで破棄する。
    if (this._handedOffToGame) return;
    this.network?.disconnect();
  }
}
