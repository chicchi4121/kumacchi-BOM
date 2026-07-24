/**
 * test_phase1.mjs
 * ------------------------------------------------------------
 * Phase1のコアロジックに対する簡易ユニットテスト。
 * サンドボックス環境からPhaser CDN(cdnjs)へのネットワークアクセスが
 * 遮断されているため実ブラウザでの起動確認ができない代わりに、
 * ・全モジュールが構文/参照エラーなくimportできること
 * ・Phaser非依存の純粋ロジック(Stage生成・爆風伝播・乱数)が
 *   仕様通りに動作すること
 * をNode上で検証する。ユーザー環境（通常のインターネット接続がある
 * ブラウザ）ではindex.htmlからCDN経由でPhaserを読み込んで動作する。
 * ------------------------------------------------------------
 */

// ---- Phaser未実行環境でもシーンクラスをimportできるよう最小限のスタブを用意 ----
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

console.log('== 1. 全モジュールのimport確認 ==');
const modules = [
  './src/constants/GameConstants.js',
  './src/utils/Random.js',
  './src/utils/Collision.js',
  './src/utils/Save.js',
  './src/objects/Stage.js',
  './src/objects/Block.js',
  './src/objects/Player.js',
  './src/objects/Bomb.js',
  './src/objects/Explosion.js',
  './src/objects/Item.js',
  './src/objects/AI.js',
  './src/systems/BattleSystem.js',
  './src/systems/ItemSystem.js',
  './src/systems/AISystem.js',
  './src/systems/RankingSystem.js',
  './src/systems/VRMSystem.js',
  './src/systems/SkillSystem.js',
  './src/systems/NetworkSystem.js',
  './src/scenes/TitleScene.js',
  './src/scenes/LobbyScene.js',
  './src/scenes/GameScene.js',
  './src/scenes/ResultScene.js',
  './src/scenes/PauseScene.js',
];

for (const path of modules) {
  try {
    await import(path);
    check(`import成功: ${path}`, true);
  } catch (e) {
    check(`import成功: ${path} -> ${e.message}`, false);
  }
}

console.log('\n== 2. Stage生成ロジック ==');
const { Stage } = await import('./src/objects/Stage.js');
const { BLOCK_TYPES } = await import('./src/constants/GameConstants.js');

for (let trial = 0; trial < 20; trial++) {
  const stage = new Stage(15, 11);
  stage.generate(4);
  const grid = stage.grid;

  // 外周は必ずHARD
  let borderOk = true;
  for (let c = 0; c < 15; c++) {
    if (grid[0][c] !== BLOCK_TYPES.HARD || grid[10][c] !== BLOCK_TYPES.HARD) borderOk = false;
  }
  for (let r = 0; r < 11; r++) {
    if (grid[r][0] !== BLOCK_TYPES.HARD || grid[r][14] !== BLOCK_TYPES.HARD) borderOk = false;
  }
  if (trial === 0) check('外周が全てHARDブロック', borderOk);

  // 各プレイヤー開始地点は必ず通行可能（安全地帯）
  let startOk = true;
  for (const pos of stage.getStartPositions()) {
    if (!stage.isWalkable(pos.col, pos.row)) startOk = false;
  }
  if (trial === 0) check('プレイヤー開始地点は通行可能', startOk);
  if (!startOk) fail++, console.log('  NG  (試行', trial, ')開始地点が塞がれています');
}

console.log('\n== 3. 爆風伝播ロジック(Explosion) ==');
const { Explosion } = await import('./src/objects/Explosion.js');

// テスト用の疑似Stage（getBlockType/breakBlockのみ実装）
function makeMockStage(rowsDef) {
  const grid = rowsDef.map((row) => row.slice());
  return {
    grid,
    getBlockType(col, row) {
      if (!grid[row] || grid[row][col] === undefined) return BLOCK_TYPES.HARD;
      return grid[row][col];
    },
    breakBlock(col, row) {
      const type = grid[row][col];
      if (type !== BLOCK_TYPES.SOFT && type !== BLOCK_TYPES.ITEM) {
        return { destroyed: false, spawnItem: false };
      }
      const spawnItem = type === BLOCK_TYPES.ITEM;
      grid[row][col] = BLOCK_TYPES.EMPTY;
      return { destroyed: true, spawnItem };
    },
  };
}

{
  // 横一列: 中央から右へHARDブロックがあるパターン -> 壁で停止することを確認
  const E = BLOCK_TYPES.EMPTY;
  const H = BLOCK_TYPES.HARD;
  const S = BLOCK_TYPES.SOFT;
  const row = [E, E, E, H, E, E, E];
  const { tiles } = Explosion.computeBlastTiles(makeMockStage([row]), 2, 0, 5);
  const rightTiles = tiles.filter((t) => t.row === 0 && t.col > 2).map((t) => t.col);
  check('爆風は壁(HARD)の手前で停止する', JSON.stringify(rightTiles.sort()) === JSON.stringify([]));
}

{
  // 壊せるブロックにぶつかったら、そのマスまで届いて破壊され、そこで止まる
  const E = BLOCK_TYPES.EMPTY;
  const S = BLOCK_TYPES.SOFT;
  const row = [E, E, E, S, E, E, E];
  const stage = makeMockStage([row]);
  const { tiles, broken } = Explosion.computeBlastTiles(stage, 2, 0, 5);
  const rightTiles = tiles.filter((t) => t.row === 0 && t.col > 2).map((t) => t.col);
  check('爆風は壊せるブロックのマスまで届く', rightTiles.includes(3));
  check('壊せるブロックの先へは伝播しない', !rightTiles.includes(4));
  check('壊せるブロックがbrokenリストに含まれる', broken.some((b) => b.col === 3 && b.row === 0));
  check('破壊後はEMPTYになる', stage.getBlockType(3, 0) === BLOCK_TYPES.EMPTY);
}

{
  // 爆風範囲(range)を超えた先には届かない
  const E = BLOCK_TYPES.EMPTY;
  const row = [E, E, E, E, E, E, E];
  const { tiles } = Explosion.computeBlastTiles(makeMockStage([row]), 3, 0, 2);
  const rightTiles = tiles.filter((t) => t.row === 0 && t.col > 3).map((t) => t.col).sort();
  check('爆風範囲(range)を超えては届かない', JSON.stringify(rightTiles) === JSON.stringify([4, 5]));
}

console.log('\n== 4. Random ==');
const { Random } = await import('./src/utils/Random.js');
{
  const r = new Random(12345);
  let allInRange = true;
  for (let i = 0; i < 1000; i++) {
    const v = r.nextInt(0, 10);
    if (v < 0 || v >= 10) allInRange = false;
  }
  check('nextInt(0,10)は常に0〜9の範囲', allInRange);

  const r1 = new Random(999);
  const r2 = new Random(999);
  const seq1 = Array.from({ length: 5 }, () => r1.nextInt(0, 100));
  const seq2 = Array.from({ length: 5 }, () => r2.nextInt(0, 100));
  check('同じシードなら再現可能な乱数列になる', JSON.stringify(seq1) === JSON.stringify(seq2));
}

console.log(`\n合計: ${pass} 件成功 / ${fail} 件失敗`);
if (fail > 0) process.exit(1);
