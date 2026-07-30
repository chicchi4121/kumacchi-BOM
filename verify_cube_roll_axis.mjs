/**
 * verify_cube_roll_axis.mjs
 * ------------------------------------------------------------
 * 「上から面移動したら縦回転で、横から面移動は横回転で画面が変わって
 * ほしい。面の切り替わり方がぐちゃぐちゃ」への対応(CubeRenderer.js
 * rotateToFace)の回転設計が、全24通り(6面×4方向)の面またぎで
 * 数学的に正しく成立するかをNode上で検証するための使い捨てスクリプト
 * (threeパッケージ不使用、verify_cube_rotation.mjsと同じ手法で最小限の
 * 行列/クォータニオン演算を手書きで再実装して確認する)。
 *
 * 設計: 現在の姿勢Q_Aから、移動方向に応じた固定軸(縦移動=axisA、
 * 横移動=axisB)まわりのちょうど90度回転(「転がり」)を適用した中間姿勢
 * Q_midを求め、Q_midから目標姿勢Q_B(_getTargetQuaternionForFaceと同じ式)
 * への残差(「捻り」)を計算する。この残差が常にカメラの正面方向軸
 * (targetOutward)まわりの回転(0度〜180度)だけになっている
 * ことを検証する(=対角線上のおかしな軸で回転することがない)。
 * ------------------------------------------------------------
 */
import { FACE_AXES, CROSSING_TABLE } from './src/constants/CubeTopology.js';

function normalize([x, y, z]) {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}
function cross([ax, ay, az], [bx, by, bz]) {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}
function dot([ax, ay, az], [bx, by, bz]) {
  return ax * bx + ay * by + az * bz;
}
function makeBasis(xAxis, yAxis, zAxis) {
  return [xAxis[0], yAxis[0], zAxis[0], xAxis[1], yAxis[1], zAxis[1], xAxis[2], yAxis[2], zAxis[2]];
}
function quatFromMatrix(m) {
  const [m11, m12, m13, m21, m22, m23, m31, m32, m33] = m;
  const trace = m11 + m22 + m33;
  let x, y, z, w;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    w = 0.25 / s;
    x = (m32 - m23) * s;
    y = (m13 - m31) * s;
    z = (m21 - m12) * s;
  } else if (m11 > m22 && m11 > m33) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);
    w = (m32 - m23) / s;
    x = 0.25 * s;
    y = (m12 + m21) / s;
    z = (m13 + m31) / s;
  } else if (m22 > m33) {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);
    w = (m13 - m31) / s;
    x = (m12 + m21) / s;
    y = 0.25 * s;
    z = (m23 + m32) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);
    w = (m21 - m12) / s;
    x = (m13 + m31) / s;
    y = (m23 + m32) / s;
    z = 0.25 * s;
  }
  return [x, y, z, w];
}
function quatMultiply(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
function quatInvert([x, y, z, w]) {
  return [-x, -y, -z, w];
}
function quatFromAxisAngle(axis, angleRad) {
  const s = Math.sin(angleRad / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angleRad / 2)];
}

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

function faceQuaternion(face) {
  const { N, R, D } = FACE_AXES[face];
  const upLocal = [-D[0], -D[1], -D[2]];
  return quatFromMatrix(makeBasis(R, upLocal, N));
}

const CAMERA_ELEVATION_RAD = (50 * Math.PI) / 180;
const targetOutward = [0, Math.sin(CAMERA_ELEVATION_RAD), Math.cos(CAMERA_ELEVATION_RAD)]; // c
const worldUpHint = [0, 1, 0];
const axisA = normalize(cross(worldUpHint, targetOutward)); // targetRight(a): 「縦移動」の回転軸
const axisB = cross(targetOutward, axisA); // targetUp(b): 「横移動」の回転軸
const Mdst = quatFromMatrix(makeBasis(axisA, axisB, targetOutward));

function targetQuaternionForFace(face) {
  const Msrc = faceQuaternion(face);
  return quatMultiply(Mdst, quatInvert(Msrc));
}

const ROLL_QUATERNIONS = {
  up: quatFromAxisAngle(axisA, Math.PI / 2),
  down: quatFromAxisAngle(axisA, -Math.PI / 2),
  left: quatFromAxisAngle(axisB, Math.PI / 2),
  right: quatFromAxisAngle(axisB, -Math.PI / 2),
};

/** fromから見て最短経路になるようtoの符号を揃える(CubeRenderer._ensureShortestPathと同じ) */
function ensureShortestPath(from, to) {
  return dot(from, to) < 0 ? to.map((v) => -v) : to;
}

console.log('== 固定軸(axisA/axisB)の直交性チェック ==');
check('axisAは単位ベクトル', Math.abs(Math.hypot(...axisA) - 1) < 1e-9);
check('axisBは単位ベクトル', Math.abs(Math.hypot(...axisB) - 1) < 1e-9);
check('axisA・targetOutwardは直交', Math.abs(dot(axisA, targetOutward)) < 1e-9);
check('axisB・targetOutwardは直交', Math.abs(dot(axisB, targetOutward)) < 1e-9);
check('axisA・axisBは直交', Math.abs(dot(axisA, axisB)) < 1e-9);

console.log('\n== 全24通りの面×移動方向: 転がり(tumble)+捻り(twist)で正しい最終姿勢に到達するか ==');
let allTumbleCorrectAxis = true;
let allTwistIsPureC = true;
for (const [face, table] of Object.entries(CROSSING_TABLE)) {
  const qFrom = targetQuaternionForFace(face);
  for (const [direction, entry] of Object.entries(table)) {
    const qTargetRaw = targetQuaternionForFace(entry.toFace);
    const roll90 = ROLL_QUATERNIONS[direction];

    // 1. 転がり: qFromにroll90を適用した中間姿勢
    const qMid = quatMultiply(roll90, qFrom);

    // 2. 捻り: qMidから最終目標(最短経路)への残差
    const qTarget = ensureShortestPath(qMid, qTargetRaw);
    let twist = quatMultiply(qTarget, quatInvert(qMid));
    if (twist[3] < 0) twist = twist.map((v) => -v); // 正準形(w>=0)に揃えてから角度を測る
    const twistW = Math.max(-1, Math.min(1, twist[3]));
    const twistAngleDeg = (2 * Math.acos(twistW) * 180) / Math.PI;
    const twistSinHalf = Math.sqrt(Math.max(0, 1 - twistW * twistW));
    const twistAxis = twistSinHalf < 1e-6 ? [0, 0, 0] : [twist[0] / twistSinHalf, twist[1] / twistSinHalf, twist[2] / twistSinHalf];
    const twistIsIdentity = twistAngleDeg < 1e-3;
    const twistIsPureC = twistIsIdentity || Math.abs(dot(twistAxis, targetOutward)) > 0.999;
    if (!twistIsPureC) allTwistIsPureC = false;

    // 3. 転がり自体が常にaxisA(up/down)またはaxisB(left/right)まわりの
    //    ちょうど90度回転になっているか(roll90自体の定義から自明だが、
    //    念のためqFrom→qMidの実際の差分からも逆算して確認する)。
    let rollDelta = quatMultiply(qMid, quatInvert(qFrom));
    if (rollDelta[3] < 0) rollDelta = rollDelta.map((v) => -v);
    const rollW = Math.max(-1, Math.min(1, rollDelta[3]));
    const rollAngleDeg = (2 * Math.acos(rollW) * 180) / Math.PI;
    const rollSinHalf = Math.sqrt(Math.max(0, 1 - rollW * rollW));
    const rollAxis = rollSinHalf < 1e-6 ? [0, 0, 0] : [rollDelta[0] / rollSinHalf, rollDelta[1] / rollSinHalf, rollDelta[2] / rollSinHalf];
    const expectedAxis = direction === 'up' || direction === 'down' ? axisA : axisB;
    const rollAxisMatches = Math.abs(Math.abs(dot(rollAxis, expectedAxis)) - 1) < 1e-6;
    const rollAngleIs90 = Math.abs(rollAngleDeg - 90) < 1e-3;
    if (!rollAxisMatches || !rollAngleIs90) allTumbleCorrectAxis = false;

    console.log(
      `  情報 ${face}--${direction}-->${entry.toFace}: 転がり=${rollAngleDeg.toFixed(1)}度(軸一致=${rollAxisMatches}) 捻り=${twistAngleDeg.toFixed(1)}度(c軸のみ=${twistIsPureC})`
    );
  }
}
check(
  '全24通りで「転がり」が必ず期待した軸(up/down=axisA, left/right=axisB)まわりのちょうど90度回転になっている',
  allTumbleCorrectAxis
);
check('全24通りで「捻り」の残差は必ずカメラ正面方向軸(c)まわりの回転だけになっている(斜めの軸になることはない)', allTwistIsPureC);

console.log(`\n合計: ${pass} 件成功 / ${fail} 件失敗`);
if (fail > 0) process.exit(1);
