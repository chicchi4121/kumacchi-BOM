/**
 * test_cube.mjs
 * ------------------------------------------------------------
 * サイコロ状(立方体)6面ステージのトポロジー(CubeTopology.js)と
 * CubeStage.jsに対する簡易ユニットテスト。
 * 面と面のつながり・座標変換は純粋なロジックなので、Three.js/Phaser
 * いずれにも依存せずNode上で完全に検証できる。
 * ------------------------------------------------------------
 */
class FakeScene {}
globalThis.Phaser = {
  Scene: FakeScene,
  AUTO: 'AUTO',
  Scale: { FIT: 'FIT', CENTER_BOTH: 'CENTER_BOTH' },
  Input: { Keyboard: { KeyCodes: { SPACE: 'SPACE', ESC: 'ESC' } } },
};

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

const { CROSSING_TABLE, OPPOSITE_EDGE, FACE_AXES, faceLocalToWorld } = await import('./src/constants/CubeTopology.js');
const { CubeStage } = await import('./src/objects/CubeStage.js');
const { CUBE_FACE_NAMES } = await import('./src/constants/GameConstants.js');

console.log('== 1. CROSSING_TABLEの整合性(双方向性) ==');
{
  let ok = true;
  for (const f of CUBE_FACE_NAMES) {
    for (const e of ['up', 'down', 'left', 'right']) {
      const t = CROSSING_TABLE[f][e];
      const back = CROSSING_TABLE[t.toFace][t.viaEdge];
      if (back.toFace !== f || back.viaEdge !== e || back.varReversed !== t.varReversed) ok = false;
      if (t.newFacing !== OPPOSITE_EDGE[t.viaEdge]) ok = false;
    }
  }
  check('全24通りの辺で行き来が矛盾なく対応している', ok);
}

console.log('\n== 2. FACE_AXESの直交性(各面のN/R/Dが単位直交ベクトルになっている) ==');
{
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = (a) => Math.sqrt(dot(a, a));
  let ok = true;
  for (const f of CUBE_FACE_NAMES) {
    const { N, R, D } = FACE_AXES[f];
    if (Math.abs(len(N) - 1) > 1e-9 || Math.abs(len(R) - 1) > 1e-9 || Math.abs(len(D) - 1) > 1e-9) ok = false;
    if (Math.abs(dot(N, R)) > 1e-9 || Math.abs(dot(N, D)) > 1e-9 || Math.abs(dot(R, D)) > 1e-9) ok = false;
  }
  check('6面すべてでN・R・Dが単位直交ベクトルになっている', ok);
}

console.log('\n== 3. CubeStage.generate() ==');
{
  const cube = new CubeStage(11, 11);
  cube.generate(6);
  check('6面すべてが生成される', CUBE_FACE_NAMES.every((f) => cube.getFaceStage(f)));
  check('開始地点が参加人数ぶん(6)生成される', cube.getStartPositions().length === 6);
  const centerCol = Math.floor(11 / 2);
  const centerRow = Math.floor(11 / 2);
  check(
    '各面の中央が通行可能(安全地帯)になっている',
    CUBE_FACE_NAMES.every((f) => cube.isWalkable(f, centerCol, centerRow))
  );
  check(
    '開始地点は各面の中央に1つずつ設定されている',
    cube.getStartPositions().every((p) => p.col === centerCol && p.row === centerRow)
  );
}

console.log('\n== 4. resolveMove: 面内の通常移動 ==');
{
  const cube = new CubeStage(11, 11);
  cube.generate(1);
  const result = cube.resolveMove('FRONT', 5, 5, 'right');
  check('面の内部にとどまる移動は同じ面のまま', result.face === 'FRONT' && result.col === 6 && result.row === 5);
  check('crossedはfalse', result.crossed === false);
  check('facingは移動方向のまま', result.facing === 'right');
}

console.log('\n== 5. resolveMove: 面をまたぐ移動(1回) ==');
{
  const cube = new CubeStage(11, 11);
  cube.generate(1);
  // FRONT面の右端(col=10)から右へ出る -> RIGHT面へ
  const result = cube.resolveMove('FRONT', 10, 3, 'right');
  check('右端を超えるとRIGHT面へ移動する', result.face === 'RIGHT');
  check('crossedはtrue', result.crossed === true);
  check('RIGHT面の左端(col=0)に着地する', result.col === 0);
  check('rowは(varReversedがfalseなので)そのまま維持される', result.row === 3);
  check('着地後の向きはright', result.facing === 'right');
}

console.log('\n== 6. resolveMove: 面をまたいだ後、来た辺へ戻ると元の面・元のマスに戻る ==');
{
  // 面をまたいだ直後のnewFacingの逆方向(OPPOSITE_EDGE[crossed.facing])へ
  // さらに1歩進むと、必ず「入ってきた辺(viaEdge)」を逆向きに通ることになり、
  // 出発地点の面・マスに正確に戻る(空間的な往復の正しさを検証する)。
  // なお「向き(facing)」はグリッドキャラの一般的な仕様通り直近の移動方向を
  // そのまま反映するだけなので、往復後は「戻る際の移動方向」になるのが
  // 正しい仕様であり、出発時の向きに戻るわけではない(2D平面でも上→下と
  // 動けば同じマスに戻ってもfacingは'down'になるのと同じ)。
  const cube = new CubeStage(11, 11);
  cube.generate(1);
  let allOk = true;
  for (const startFace of CUBE_FACE_NAMES) {
    for (const dir of ['up', 'down', 'left', 'right']) {
      const col = dir === 'right' ? 10 : dir === 'left' ? 0 : 5;
      const row = dir === 'down' ? 10 : dir === 'up' ? 0 : 5;
      const crossed = cube.resolveMove(startFace, col, row, dir);
      const backDirection = OPPOSITE_EDGE[crossed.facing];
      const back = cube.resolveMove(crossed.face, crossed.col, crossed.row, backDirection);
      const roundTripOk = back.face === startFace && back.col === col && back.row === row;
      if (!roundTripOk) {
        console.log(
          `  NG  ${startFace}(${col},${row}).${dir} -> ${crossed.face}(${crossed.col},${crossed.row}) -> ${backDirection} -> ${back.face}(${back.col},${back.row}) (期待の面/マス: ${startFace}(${col},${row}))`
        );
        allOk = false;
      }
    }
  }
  check('全6面×4方向、面をまたいだ後に来た辺へ戻ると空間的に元の面・元のマスに正確に戻る', allOk);
}

console.log('\n== 7. 4面の「赤道帯」を右方向に回り続けると4回で元の面に戻る ==');
{
  const cube = new CubeStage(11, 11);
  cube.generate(1);
  let face = 'FRONT';
  let col = 10;
  let row = 5;
  const visited = [face];
  for (let i = 0; i < 4; i++) {
    const result = cube.resolveMove(face, col, row, 'right');
    face = result.face;
    col = result.col;
    row = result.row;
    if (i < 3) visited.push(face);
    if (result.crossed) {
      // 次に境界へ再度到達させるため、境界の反対側からもう一度端まで歩くのは
      // このテストでは省略し、境界に着地した直後に再度rightへ出ることで
      // 「毎回境界をまたぐ」動きを模擬する(面の横幅が1マスであるかのように扱う)
      col = 10; // 次の面でも右端にいるとみなして直ちに次の境界へ
    }
  }
  check(
    '赤道帯(FRONT→RIGHT→BACK→LEFT)を4回右へ渡ると元のFRONTに戻る',
    face === 'FRONT'
  );
  check('4回の巡回でFRONT/RIGHT/BACK/LEFTを一通り経由した', new Set(visited).size === 4);
}

console.log('\n== 8. faceLocalToWorld: 面の中心(u=0,v=0)は各面の法線方向そのもの ==');
{
  let ok = true;
  for (const f of CUBE_FACE_NAMES) {
    const [x, y, z] = faceLocalToWorld(f, 0, 0);
    const [nx, ny, nz] = FACE_AXES[f].N;
    if (Math.abs(x - nx) > 1e-9 || Math.abs(y - ny) > 1e-9 || Math.abs(z - nz) > 1e-9) ok = false;
  }
  check('各面の中心(u=0,v=0)がその面の法線ベクトルと一致する', ok);
}

console.log(`\n合計: ${pass} 件成功 / ${fail} 件失敗`);
if (fail > 0) process.exit(1);
