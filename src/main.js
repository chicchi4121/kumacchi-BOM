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
import { OnlineLobbyScene } from './scenes/OnlineLobbyScene.js';
import { RankingScene } from './scenes/RankingScene.js';
import { GameScene } from './scenes/GameScene.js';
import { ResultScene } from './scenes/ResultScene.js';
import { PauseScene } from './scenes/PauseScene.js';

/** @type {Phaser.Types.Core.GameConfig} */
const config = {
  type: Phaser.AUTO,
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  parent: 'game-container',
  // サイコロ6面ステージ(Phase3)のバトル画面はThree.js(#cube-canvas)で3D描画し、
  // Phaser側はHUD/UI/カウントダウン等のテキスト・オーバーレイのみを担当する。
  // その3D映像を透過して見せるため、Phaserのcanvas自体は透明にしておく。
  transparent: true,
  fps: {
    target: TARGET_FPS,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Phase1は見下ろし型のグリッド移動のみのため物理エンジンは未使用。
  // Phase3以降で必要になった場合にArcade Physics等を追加する。
  scene: [TitleScene, LobbyScene, OnlineLobbyScene, RankingScene, GameScene, ResultScene, PauseScene],
};

window.addEventListener('load', () => {
  const game = new Phaser.Game(config);
  // #cube-canvas(Three.js)の上にPhaserのcanvas(HUD/UI用)を重ねて表示するため、
  // CSSで積み重ね順を制御できるようクラスを付与する(index.html参照)。
  game.canvas?.classList.add('phaser-canvas');

  // #cube-canvasもPhaserと同じ表示サイズに揃えておく(CubeRendererが実際の
  // 描画解像度はdevicePixelRatio込みで別途調整する)。Phaser.Scale.FITは
  // ウィンドウサイズに応じてcanvasの表示サイズ(CSS上のwidth/height)を
  // 動的に変えるため、resizeイベントのたびに#cube-canvas側にも反映する。
  const cubeCanvas = document.getElementById('cube-canvas');
  const syncCubeCanvasSize = () => {
    if (!cubeCanvas || !game.canvas) return;
    cubeCanvas.style.width = game.canvas.style.width || `${SCREEN_WIDTH}px`;
    cubeCanvas.style.height = game.canvas.style.height || `${SCREEN_HEIGHT}px`;
  };
  syncCubeCanvasSize();
  game.scale.on('resize', syncCubeCanvasSize);
});
