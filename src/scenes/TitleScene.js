/**
 * TitleScene.js
 * ------------------------------------------------------------
 * タイトル画面。「ゲーム開始」「ランキング」「設定」「VRM変更」への
 * 導線を表示する。
 *
 * 「ゲーム開始」→LobbyScene: 参加人数・人間プレイヤー数(ローカルPVP、
 * 同一キーボードでのホットシート対戦)・AI難易度・制限時間を選んで対戦する。
 * 「オンライン対戦」→OnlineLobbyScene: Supabase Realtime経由で別々の
 * 端末・ブラウザから対戦する(部屋の作成・コード入力での参加)。
 * 「ランキング」→RankingScene: Supabase(未設定時はこの端末のローカル
 * 履歴)から対戦結果ランキングを表示する。
 *
 * Phase2では「設定」画面（BGM/SE音量調整、Save.js経由で永続化）を実装する。
 * Phase3の第一歩として「VRM変更」でのVRMファイルアップロードにも対応した
 * （アップロード後の実際の見た目差し替えはGameScene側でVRMSystem経由で行う）。
 * ファイル本体はサイズの都合上このブラウザタブ内でのみ保持し、LocalStorage
 * にはファイル名のみ保存する（Save.js）。
 * ------------------------------------------------------------
 */
import { SCENE_KEYS, SCREEN_WIDTH, SCREEN_HEIGHT } from '../constants/GameConstants.js';
import { soundSystem } from '../systems/SoundSystem.js';
import { vrmSystem } from '../systems/VRMSystem.js';
import { Save } from '../utils/Save.js';

const VRM_FILE_INPUT_ID = 'kumacchi-vrm-file-input';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.TITLE });
  }

  create() {
    const centerX = SCREEN_WIDTH / 2;
    soundSystem.playBGM('title');

    this.add
      .text(centerX, 70, 'くまっちボム！', { fontSize: '40px', color: '#ffffff' })
      .setOrigin(0.5);

    this._createMenuButton(centerX, 155, 'ゲーム開始', () => {
      soundSystem.playSE('button');
      this.scene.start(SCENE_KEYS.LOBBY);
    });

    this._createMenuButton(centerX, 210, 'オンライン対戦', () => {
      soundSystem.playSE('button');
      this.scene.start(SCENE_KEYS.ONLINE_LOBBY);
    });

    this._createMenuButton(centerX, 265, 'ランキング', () => {
      soundSystem.playSE('button');
      this.scene.start(SCENE_KEYS.RANKING);
    });

    this._createMenuButton(centerX, 320, '設定', () => {
      soundSystem.playSE('button');
      this._toggleSettingsPanel();
    });

    this._createMenuButton(centerX, 375, 'VRM変更', () => {
      soundSystem.playSE('button');
      this._openVrmFilePicker();
    });

    this.vrmStatusText = this.add
      .text(centerX, 408, this._getVrmStatusLabel(), { fontSize: '13px', color: '#88ddaa' })
      .setOrigin(0.5);

    this.add
      .text(centerX, SCREEN_HEIGHT - 30, '操作: ↑↓←→ 移動 / Space 爆弾設置 / Esc ポーズ', {
        fontSize: '14px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    this._createSettingsPanel(centerX, 440);
  }

  _getVrmStatusLabel() {
    if (vrmSystem.hasCustomVrm()) return `使用中のVRM: ${vrmSystem.customFileName}`;
    const saved = Save.getVrmInfo();
    if (saved?.fileName) return `使用中のVRM: ${saved.fileName}（再アップロードが必要です）`;
    return '使用中のVRM: デフォルト（くまっち）';
  }

  /**
   * ブラウザのファイル選択ダイアログを開き、選択された.vrmファイルを
   * VRMSystemに渡す。Phaserはcanvas描画のため、ネイティブのファイル
   * ダイアログは隠しHTML要素(<input type="file">)経由で呼び出す。
   */
  _openVrmFilePicker() {
    let input = document.getElementById(VRM_FILE_INPUT_ID);
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.accept = '.vrm';
      input.id = VRM_FILE_INPUT_ID;
      input.style.display = 'none';
      document.body.appendChild(input);
    }

    // 前回と同じファイルを選び直しても'change'が発火するようにリセットしておく
    input.value = '';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const arrayBuffer = await file.arrayBuffer();
        vrmSystem.setCustomVrm(arrayBuffer, file.name);
        Save.setVrmInfo({ fileName: file.name });
        this.vrmStatusText.setText(this._getVrmStatusLabel());
      } catch (e) {
        console.warn('[TitleScene] VRMファイルの読み込みに失敗しました。', e);
        this.vrmStatusText.setText('VRMファイルの読み込みに失敗しました');
      }
    };
    input.click();
  }

  _createMenuButton(x, y, label, onClick, disabled = false) {
    const text = this.add
      .text(x, y, label, {
        fontSize: '22px',
        color: disabled ? '#666666' : '#ffffff',
        backgroundColor: disabled ? '#222222' : '#3a3a3a',
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0.5);

    if (disabled) return text;

    text.setInteractive({ useHandCursor: true });
    text.on('pointerover', () => text.setStyle({ backgroundColor: '#55606e' }));
    text.on('pointerout', () => text.setStyle({ backgroundColor: '#3a3a3a' }));
    text.on('pointerdown', onClick);
    return text;
  }

  /** BGM/SE音量調整・プレイヤー名設定を行う簡易設定パネル（Save.js経由で永続化） */
  _createSettingsPanel(x, y) {
    const { bgm, se } = soundSystem.getVolume();

    this.settingsContainer = this.add.container(x, y);
    this.settingsContainer.setVisible(false);

    const bg = this.add.rectangle(0, 55, 360, 150, 0x000000, 0.55);
    this.bgmRow = this._createVolumeRow(0, 0, 'BGM音量', bgm, (v) => soundSystem.setVolume('bgm', v));
    this.seRow = this._createVolumeRow(0, 45, 'SE音量', se, (v) => soundSystem.setVolume('se', v));
    this.nameRow = this._createPlayerNameRow(0, 95);

    this.settingsContainer.add([bg, this.bgmRow.container, this.seRow.container, this.nameRow.container]);
  }

  /**
   * ランキング(RankingScene/RankingSystem)に記録する際の表示名を設定する行。
   * このゲームには専用のログイン機構が無いため、ブラウザ標準のprompt()で
   * 簡易的に入力してもらう(Save.getPlayerName/setPlayerName経由で永続化)。
   */
  _createPlayerNameRow(x, y) {
    const container = this.add.container(x, y);
    const labelText = this.add.text(-170, 0, 'ランキング表示名', { fontSize: '16px', color: '#ffffff' }).setOrigin(0, 0.5);
    const valueText = this.add
      .text(60, 0, Save.getPlayerName(), { fontSize: '16px', color: '#ffe066' })
      .setOrigin(0.5);
    const editBtn = this.add
      .text(150, 0, '変更', { fontSize: '16px', color: '#ffffff', backgroundColor: '#3a3a3a', padding: { x: 10, y: 2 } })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    editBtn.on('pointerdown', () => {
      soundSystem.playSE('button');
      const input = window.prompt('ランキングに表示する名前を入力してください(最大12文字)', Save.getPlayerName());
      if (!input) return;
      const name = input.trim().slice(0, 12) || 'プレイヤー';
      Save.setPlayerName(name);
      valueText.setText(name);
    });

    container.add([labelText, valueText, editBtn]);
    return { container };
  }

  _createVolumeRow(x, y, label, initialValue, onChange) {
    const container = this.add.container(x, y);
    let value = initialValue;

    const labelText = this.add.text(-170, 0, label, { fontSize: '16px', color: '#ffffff' }).setOrigin(0, 0.5);
    const valueText = this.add
      .text(80, 0, `${Math.round(value * 100)}%`, { fontSize: '16px', color: '#ffe066' })
      .setOrigin(0.5);

    const minusBtn = this._createStepperButton(30, 0, '-', () => {
      value = Math.max(0, Math.round((value - 0.1) * 10) / 10);
      valueText.setText(`${Math.round(value * 100)}%`);
      onChange(value);
    });
    const plusBtn = this._createStepperButton(130, 0, '+', () => {
      value = Math.min(1, Math.round((value + 0.1) * 10) / 10);
      valueText.setText(`${Math.round(value * 100)}%`);
      onChange(value);
    });

    container.add([labelText, valueText, minusBtn, plusBtn]);
    return { container };
  }

  _createStepperButton(x, y, label, onClick) {
    const btn = this.add
      .text(x, y, label, {
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#3a3a3a',
        padding: { x: 10, y: 2 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => {
      soundSystem.playSE('button');
      onClick();
    });
    return btn;
  }

  _toggleSettingsPanel() {
    this.settingsContainer.setVisible(!this.settingsContainer.visible);
  }
}
