/**
 * test_cube_renderer_runtime.mjs
 * ------------------------------------------------------------
 * 「移動の面がかわっていない」報告への対応。verify_cube_roll_axis.mjs
 * は回転の数式を手計算で別実装して検証しただけで、実際のCubeRenderer.js
 * のソースコードは1行も実行していなかった。今回はNode上に最小限の
 * フェイクthree.js(node_modules/three、テスト専用)を用意し、実際の
 * CubeRenderer.jsをimportしてinit()・snapToFace()・rotateToFace()・
 * render()を本当に呼び出し、cubeRootのクォータニオンが実際に
 * 「時間経過とともに変化し」「最終的に数学的な目標姿勢へ正しく到達する」
 * ことを、全24通り(6面×4方向)の面またぎで確認する。
 * ------------------------------------------------------------
 */
if (typeof globalThis.window === 'undefined') {
  globalThis.window = { devicePixelRatio: 1 };
}

import { CubeRenderer } from './src/systems/CubeRenderer.js';
import { CUBE_FACE_NAMES, BLOCK_TYPES } from './src/constants/GameConstants.js';
import { CROSSING_TABLE } from './src/constants/CubeTopology.js';

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) {
    pass++;
    console.log(`  OK  ${label}`);
  } else {
    fail++;
    console.log(`  NG  ${label}`);
  }
}

function makeFakeCanvas() {
  return {
    clientWidth: 800,
    clientHeight: 600,
    width: 800,
    height: 600,
    style: {},
    getContext: () => null,
  };
}

function makeFakeFaceStage() {
  return {
    rows: 9,
    cols: 9,
    getBlockType: () => BLOCK_TYPES.EMPTY,
  };
}

function makeFakeStage() {
  const faces = {};
  for (const name of CUBE_FACE_NAMES) faces[name] = makeFakeFaceStage();
  return { getFaceStage: (face) => faces[face] };
}

function quatDistance(q1, q2) {
  // 2つのクォータニオンが「同じ回転」を表しているか(q, -qが同一回転を表すため
  // 符号違いも許容して)距離を測る。
  const d = Math.abs(q1.x * q2.x + q1.y * q2.y + q1.z * q2.z + q1.w * q2.w);
  return Math.acos(Math.max(-1, Math.min(1, d))) * 2; // ラジアン角度差
}

async function main() {
  const renderer = new CubeRenderer(makeFakeCanvas());
  await renderer.init(makeFakeStage());
  check('init()後にready=trueになる', renderer.ready === true);

  // 初回はsnapToFace相当(アニメーションなし)で開始面を表示する
  renderer.snapToFace('FRONT');
  check('snapToFace後、_currentFaceが設定される', renderer._currentFace === 'FRONT');
  const snappedQuat = renderer._cubeRoot.quaternion.clone();
  const targetForFront = renderer._getTargetQuaternionForFace('FRONT');
  check(
    'snapToFace後のcubeRoot姿勢が目標姿勢と一致する',
    quatDistance(snappedQuat, targetForFront) < 1e-6
  );

  console.log('\n== 全24通り(6面×4方向)の面またぎで実際にrotateToFace()→render()を駆動して検証 ==');
  let allReachedTarget = true;
  let allActuallyMoved = true;
  let allMonotonicProgress = true;

  for (const [face, table] of Object.entries(CROSSING_TABLE)) {
    for (const [direction, entry] of Object.entries(table)) {
      // 各ケースごとに新しいrendererを使い、「現在face」から独立して検証する
      const r = new CubeRenderer(makeFakeCanvas());
      await r.init(makeFakeStage());
      r.snapToFace(face);

      const beforeQuat = r._cubeRoot.quaternion.clone();
      const t0 = 1000;
      r.rotateToFace(entry.toFace, direction, t0);

      check(`${face}--${direction}--> rotateToFace呼び出し直後、_isRotating=trueになる(${entry.toFace})`, r._isRotating === true);

      // アニメーション開始直後(t0のごく直後)は、まだ開始姿勢からほとんど動いていないはず
      r.render(t0 + 1);
      const earlyQuat = r._cubeRoot.quaternion.clone();

      // アニメーション中盤
      r.render(t0 + 275);
      const midQuat = r._cubeRoot.quaternion.clone();

      // アニメーション終了後
      r.render(t0 + 600); // CUBE_ROLL_DURATION_MS(550)を超えた時刻
      const finalQuat = r._cubeRoot.quaternion.clone();

      const targetQuat = r._getTargetQuaternionForFace(entry.toFace);
      const reachedTarget = quatDistance(finalQuat, targetQuat) < 1e-4;
      const movedFromStart = quatDistance(beforeQuat, midQuat) > 1e-3;
      const midDiffersFromEarly = quatDistance(earlyQuat, midQuat) > 1e-4;
      const isRotatingClearedAfterDone = r._isRotating === false;

      if (!reachedTarget) allReachedTarget = false;
      if (!movedFromStart || !midDiffersFromEarly) allActuallyMoved = false;
      if (!isRotatingClearedAfterDone) allMonotonicProgress = false;

      console.log(
        `  情報 ${face}--${direction}-->${entry.toFace}: 開始→中盤の角度差=${((quatDistance(beforeQuat, midQuat) * 180) / Math.PI).toFixed(1)}度, ` +
          `最終姿勢と目標姿勢の差=${((quatDistance(finalQuat, targetQuat) * 180) / Math.PI).toFixed(3)}度, ` +
          `完了後_isRotating=${r._isRotating}`
      );
    }
  }
  check('全24通りで、アニメーション完了後にcubeRootの姿勢が数学的に正しい目標姿勢に一致する', allReachedTarget);
  check('全24通りで、アニメーション中に実際にクォータニオンが変化している(固まっていない)', allActuallyMoved);
  check('全24通りで、アニメーション完了後に_isRotatingがfalseに戻る', allMonotonicProgress);

  // 「同じ面のままなら何もしない」ガードの確認(バグ調査の副産物: このガードが
  // 誤って作動していないか= _currentFaceの更新漏れがないかも合わせて確認)
  const r2 = new CubeRenderer(makeFakeCanvas());
  await r2.init(makeFakeStage());
  r2.snapToFace('FRONT');
  r2.rotateToFace('FRONT', 'up', 2000); // 同じ面 → 何もしないはず
  check('現在と同じ面を指定した場合はrotateToFaceが何もしない(_isRotating=falseのまま)', r2._isRotating === false);

  console.log(`\n合計: ${pass} 件成功 / ${fail} 件失敗`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('テスト実行中に例外が発生しました(これ自体がバグの可能性):', e);
  process.exit(1);
});
