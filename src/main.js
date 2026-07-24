/**
 * main.js
 * ------------------------------------------------------------
 * ゲームのエントリーポイント。Phaser 3のGameインスタンスを生成し、
 * 各シーンを登録する。
 * ------------------------------------------------------------
 */
import { SCREEN_WIDTH, SCREEN_HEIGHT, TARGET_FPS } from './constants/GameConstants.js';
import { TitleScene } from './scenes/TitleScene.js';
import { LobbyScene } from './scenes/LobbyScene.js';
import { GameScene } from './scenes/GameScene.js';
import { ResultScene } from './scenes/ResultScene.js';
import { PauseScene } from './scenes/PauseScene.js';

/** @type {Phaser.Types.Core.GameConfig} */
const config = {
  type: Phaser.AUTO,
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  parent: 'game-container',
  backgroundColor: '#1e1e1e',
  fps: {
    target: TARGET_FPS,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Phase1は見下ろし型のグリッド移動のみのため物理エンジンは未使用。
  // Phase3以降で必要になった場合にArcade Physics等を追加する。
  scene: [TitleScene, LobbyScene, GameScene, ResultScene, PauseScene],
};

window.addEventListener('load', () => {
  // eslint-disable-next-line no-new
  new Phaser.Game(config);
});
