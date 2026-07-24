/**
 * test_phase2.mjs
 * ------------------------------------------------------------
 * Phase2で追加したロジック（アイテム効果適用・勝敗判定/順位確定・
 * アイテム付きブロックの破壊・AIモジュールのimport)に対する
 * 簡易ユニットテスト。test_phase1.mjsと同様、Phaser CDNへの
 * ネットワークアクセスが無い環境でも検証できるようにしてある。
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

const { BLOCK_TYPES, ITEM_TYPES } = await import('./src/constants/GameConstants.js');
const { Stage } = await import('./src/objects/Stage.js');
const { Explosion } = await import('./src/objects/Explosion.js');
const { ItemSystem } = await import('./src/systems/ItemSystem.js');
const { BattleSystem } = await import('./src/systems/BattleSystem.js');
const { AI } = await import('./src/objects/AI.js');
const { AISystem } = await import('./src/systems/AISystem.js');

console.log('== 1. Stageのアイテム種別事前決定 ==');
{
  let foundItemBlock = false;
  for (let trial = 0; trial < 30 && !foundItemBlock; trial++) {
    const stage = new Stage(15, 11);
    stage.generate(2);
    for (let row = 0; row < stage.rows && !foundItemBlock; row++) {
      for (let col = 0; col < stage.cols && !foundItemBlock; col++) {
        if (stage.getBlockType(col, row) === BLOCK_TYPES.ITEM) {
          const result = stage.breakBlock(col, row);
          check('ITEMブロック破壊でspawnItem=true', result.spawnItem === true);
          check('ITEMブロック破壊でitemTypeがITEM_TYPESのいずれか', Object.values(ITEM_TYPES).includes(result.itemType));
          check('破壊後はブロックがEMPTYになる', stage.getBlockType(col, row) === BLOCK_TYPES.EMPTY);
          foundItemBlock = true;
        }
      }
    }
  }
  check('30回の試行中にITEMブロックが最低1つ生成された', foundItemBlock);
}

console.log('\n== 2. Explosionのdry-run（AI危険地帯予測が盤面を変更しない） ==');
{
  function makeMockStage(rowsDef) {
    const grid = rowsDef.map((r) => r.slice());
    return {
      getBlockType(col, row) {
        if (!grid[row] || grid[row][col] === undefined) return BLOCK_TYPES.HARD;
        return grid[row][col];
      },
      breakBlock() {
        throw new Error('dryRun中はbreakBlockが呼ばれてはいけない');
      },
    };
  }
  const E = BLOCK_TYPES.EMPTY;
  const S = BLOCK_TYPES.SOFT;
  const row = [E, E, E, S, E, E, E];
  const stage = makeMockStage([row]);
  let threw = false;
  let tiles = [];
  try {
    ({ tiles } = Explosion.computeBlastTiles(stage, 2, 0, 5, { dryRun: true }));
  } catch (e) {
    threw = true;
  }
  check('dryRun中はbreakBlockを呼ばない（例外が発生しない）', !threw);
  check('dryRunでも爆風が届くマスは正しく計算される', tiles.some((t) => t.col === 3 && t.row === 0));
}

console.log('\n== 3. ItemSystemの効果適用 ==');
{
  function makeFakePlayer() {
    return {
      maxBombs: 1,
      blastRange: 1,
      speedMultiplier: 1,
      lives: 3,
      invincibleUntil: 0,
      canPassSoftBlock: false,
      canKickBombs: false,
    };
  }
  const fakeScene = { time: { now: 1000 } };

  let p = makeFakePlayer();
  ItemSystem.applyItem(p, ITEM_TYPES.BOMB_UP, fakeScene);
  check('BOMB_UPでmaxBombsが増える', p.maxBombs === 2);

  p = makeFakePlayer();
  ItemSystem.applyItem(p, ITEM_TYPES.FIRE_UP, fakeScene);
  check('FIRE_UPでblastRangeが増える', p.blastRange === 2);

  p = makeFakePlayer();
  ItemSystem.applyItem(p, ITEM_TYPES.LIFE_UP, fakeScene);
  check('LIFE_UPでlivesが増える', p.lives === 4);

  p = makeFakePlayer();
  ItemSystem.applyItem(p, ITEM_TYPES.SHIELD, fakeScene);
  check('SHIELDでinvincibleUntilが未来の時刻になる', p.invincibleUntil === 1000 + 5000);

  p = makeFakePlayer();
  ItemSystem.applyItem(p, ITEM_TYPES.GHOST, fakeScene);
  check('GHOSTでcanPassSoftBlockがtrueになる', p.canPassSoftBlock === true);

  p = makeFakePlayer();
  ItemSystem.applyItem(p, ITEM_TYPES.KICK, fakeScene);
  check('KICKでcanKickBombsがtrueになる', p.canKickBombs === true);
}

console.log('\n== 4. BattleSystemの勝敗判定・順位確定 ==');
{
  function makeFakePlayer(playerId, lives, kills) {
    return { playerId, lives, isAlive: true, stats: { kills, bombsExploded: 0, itemsCollected: 0 } };
  }

  // 4-1. 最後の1人になったら即座に勝者が確定する
  {
    const p1 = makeFakePlayer(1, 3, 0);
    const p2 = makeFakePlayer(2, 0, 0);
    p2.isAlive = false;
    const battle = new BattleSystem([p1, p2], { timeLimitMs: 180000 });
    battle.notifyPlayerDied(p2);
    battle.update(16);
    check('最後の1人になった時点でisOverになる', battle.isOver === true);
    check('生存している方が勝者になる', battle.winner === p1);
    check('勝者の最終順位は1位', battle.finalRanks.get(1) === 1);
    check('死亡したプレイヤーは2位', battle.finalRanks.get(2) === 2);
  }

  // 4-2. 時間切れ時は残機→撃破数の順で勝者を決める
  {
    const p1 = makeFakePlayer(1, 2, 5);
    const p2 = makeFakePlayer(2, 2, 1);
    const p3 = makeFakePlayer(3, 1, 99);
    const battle = new BattleSystem([p1, p2, p3], { timeLimitMs: 100 });
    battle.update(200); // 時間切れ
    check('残機が同点の場合は撃破数が多い方が勝者', battle.winner === p1);
  }

  // 4-3. 生存中のプレイヤーはgetLiveRank()がnullを返す（複数生存時）
  {
    const p1 = makeFakePlayer(1, 3, 0);
    const p2 = makeFakePlayer(2, 3, 0);
    const battle = new BattleSystem([p1, p2], { timeLimitMs: 180000 });
    check('複数生存中はgetLiveRankがnull', battle.getLiveRank(p1) === null);
  }
}

console.log('\n== 5. AI/AISystemのimportとインスタンス化 ==');
{
  const fakePlayer = { isAlive: true, isMoving: false, col: 1, row: 1, canPassSoftBlock: false, canKickBombs: false };
  const ai = new AI(fakePlayer, 'hard');
  check('AIインスタンスが難易度プロファイルを保持する', ai.profile.decisionIntervalMs === 220);

  const aiSystem = new AISystem();
  aiSystem.setup([fakePlayer, fakePlayer], 'expert');
  check('AISystem.setupで難易度が全AIに反映される', aiSystem.aiControllers.every((c) => c.difficulty === 'expert'));
}

console.log(`\n合計: ${pass} 件成功 / ${fail} 件失敗`);
if (fail > 0) process.exit(1);
