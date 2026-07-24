/**
 * TitleScene.js
 * ------------------------------------------------------------
 * タイトル画面。「ゲーム開始」「ランキング」「設定」「VRM変更」への
 * 導線を表示する。
 *
 * NOTE: 現状ローカルでの複数人操作（ホットシート対戦）には未対応のため、
 * 「ゲーム開始」は1人目のみ操作可能な対戦（残りはAIが埋める）としてLobby
 * Sceneへ遷移する。複数人分の操作系統が実装され次第、真のPVPモードを
 * 別途追加する想定。
 *
 * Phase2では「設定」画面（BGM/SE音量調整、Save.js経由で永続化）を実装する。
 * Phase3の第一歩として「VRM変更」でのVRMファイルアップロードにも対応した
 * （アップロード後の実際の見た目差し替えはGameScene側でVRMSystem経由で行う）。
 * ファイル本体はサイズの都合上このブラウザタブ内でのみ保持し、LocalStorage
 * にはファイル名のみ保存する（Save.js）。「ランキング」(Phase4)は引き続き
 * 導線のみ表示する。
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

    this._createMenuButton(centerX, 180, 'ゲーム開始', () => {
      soundSystem.playSE('button');
      this.scene.start(SCENE_KEYS.LOBBY);
    });

    this._createMenuButton(centerX, 280, 'ランキング（Phase4実装予定）', () => {}, true);

    this._createMenuButton(centerX, 335, '設定', () => {
      soundSystem.playSE('button');
      this._toggleSettingsPanel();
    });

    this._createMenuButton(centerX, 390, 'VRM変更', () => {
      soundSystem.playSE('button');
      this._openVrmFilePicker();
    });

    this.vrmStatusText = this.add
      .text(centerX, 425, this._getVrmStatusLabel(), { fontSize: '13px', color: '#88ddaa' })
      .setOrigin(0.5);

    this.add
      .text(centerX, SCREEN_HEIGHT - 30, '操作: ↑↓←→ 移動 / Space 爆弾設置 / Esc ポーズ', {
        fontSize: '14px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    this._createSettingsPanel(centerX, 460);
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

  /** BGM/SE音量を10%刻みで調整できる簡易設定パネル（Save.js経由で永続化） */
  _createSettingsPanel(x, y) {
    const { bgm, se } = soundSystem.getVolume();

    this.settingsContainer = this.add.container(x, y);
    this.settingsContainer.setVisible(false);

    const bg = this.add.rectangle(0, 35, 360, 110, 0x000000, 0.55);
    this.bgmRow = this._createVolumeRow(0, 0, 'BGM音量', bgm, (v) => soundSystem.setVolume('bgm', v));
    this.seRow = this._createVolumeRow(0, 45, 'SE音量', se, (v) => soundSystem.setVolume('se', v));

    this.settingsContainer.add([bg, this.bgmRow.container, this.seRow.container]);
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
