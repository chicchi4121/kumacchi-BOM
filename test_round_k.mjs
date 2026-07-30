/**
 * test_round_k.mjs
 * ------------------------------------------------------------
 * 今回(2026-07 続報)の4件の要望対応を検証する簡易ユニットテスト。
 *
 * 1. 「トップ画面全体に画像表示させてほしい」
 * 2. 「選択項目は見やすくしてほしい」
 *   → 上記2件の詳細な静的検証はtest_round_j.mjsの「5b」セクションで
 *     実施済みのため、本ファイルでは重複を避け3・4のみを扱う。
 * 3. 「敵がまだ爆弾をかわし過ぎるのでもう少し弱くしてほしい」→
 *    AI.jsのAI_PROFILESに難易度依存の`escapeSearchDepth`
 *    (回避経路探索のBFS深さ)が追加され、_findSafeDirectionが
 *    ハードコードされた固定値ではなくこれを参照するようになったこと、
 *    かつ難易度が上がるほど深く(≒回避が上手く)なる単調増加関係を持つ
 *    ことの検証。
 * 4. 「新しいアイテム時限装置機能アイテムを追加してほしい」→
 *    ⏱(TIMER)アイテムがITEM_TYPES/ITEM_SPAWN_WEIGHTS/ITEM_EMOJIに
 *    データ駆動で登録され、ItemSystemが取得時にPlayer.hasRemoteDetonator
 *    フラグを立てること、GameScene._tryPlaceBombがこのフラグを見て
 *    「通常設置できない状況では自分の爆弾を即時リモート起爆する」
 *    (_tryRemoteDetonate)よう分岐していることの検証。
 * ------------------------------------------------------------
 */
import fs from 'fs';

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

console.log('== 3. 敵のボム回避を弱める(escapeSearchDepth) ==');
{
  const aiSrc = fs.readFileSync('src/objects/AI.js', 'utf8');

  check('AI_PROFILESの各難易度にescapeSearchDepthが定義されている', (aiSrc.match(/escapeSearchDepth:\s*\d+/g) || []).length === 4);
  check(
    '_findSafeDirectionが固定値ではなくthis.profile.escapeSearchDepthを参照している',
    /const maxDepth = this\.profile\.escapeSearchDepth/.test(aiSrc),
  );

  // 実際に各難易度のプロファイル値を読み取り、難易度が上がるほど
  // escapeSearchDepth(≒回避の上手さ)が単調増加することを検証する。
  const mod = await import('./src/objects/AI.js');
  const { AI_DIFFICULTY } = await import('./src/constants/GameConstants.js');
  const ai = new mod.AI(null, AI_DIFFICULTY.EASY);
  const depths = Object.values(AI_DIFFICULTY).map((d) => {
    const tmp = new mod.AI(null, d);
    return tmp.profile.escapeSearchDepth;
  });
  check('escapeSearchDepthは全て正の整数である', depths.every((d) => Number.isInteger(d) && d > 0));
  check(
    'escapeSearchDepthはEASY<NORMAL<HARD<EXPERTの順で単調増加する(易しいほど回避が浅く弱い)',
    depths[0] < depths[1] && depths[1] < depths[2] && depths[2] < depths[3],
  );
  // 2026-07「敵をまだ弱くしてほしい」対応(3回目)でEASYのescapeSearchDepthを
  // 2→1にさらに削った(ほぼ回避できないレベル)。
  check('EASYのescapeSearchDepthは1である(ほぼ最浅=回避失敗しやすい)', ai.profile.escapeSearchDepth === 1);
}

console.log('\n== 4. 新アイテム「時限装置」(⏱ TIMER: リモート起爆)対応 ==');
{
  const constSrc = fs.readFileSync('src/constants/GameConstants.js', 'utf8');
  const itemSrc = fs.readFileSync('src/objects/Item.js', 'utf8');
  const itemSystemSrc = fs.readFileSync('src/systems/ItemSystem.js', 'utf8');
  const playerSrc = fs.readFileSync('src/objects/Player.js', 'utf8');
  const gameSceneSrc = fs.readFileSync('src/scenes/GameScene.js', 'utf8');

  check('ITEM_TYPESにTIMERが定義されている', /TIMER:\s*'timer'/.test(constSrc));
  // 【2026-07再設計】「時限装置アイテムの出現個数を1ステージ4個にして」
  // への対応で、TIMERはもうITEM_SPAWN_WEIGHTSの重み付き抽選には含めず、
  // TIMER_ITEM_COUNT_PER_STAGE(固定数)による専用の割り当て方式
  // (CubeStage._assignFixedTimerItems)に変わった。詳細な検証は
  // test_round_m.mjsで行う。
  check('ITEM_SPAWN_WEIGHTSにはもうTIMERの重みが定義されていない(固定数出現方式へ移行)', !/\[ITEM_TYPES\.TIMER\]/.test(constSrc.split('ITEM_SPAWN_WEIGHTS')[1]?.split('});')[0] ?? ''));
  check('TIMER_ITEM_COUNT_PER_STAGEが定義されている', /TIMER_ITEM_COUNT_PER_STAGE\s*=\s*4/.test(constSrc));
  check('ITEM_EMOJIにTIMER(⏱)の表示が定義されている', /\[ITEM_TYPES\.TIMER\]:\s*'⏱'/.test(itemSrc));

  check(
    'ItemSystemのITEM_EFFECTSがTIMER取得時にplayer.hasRemoteDetonatorをtrueにする',
    /\[ITEM_TYPES\.TIMER\]:\s*\(player\)\s*=>\s*\{\s*\n\s*player\.hasRemoteDetonator = true;/.test(itemSystemSrc),
  );
  check('Player.jsがhasRemoteDetonatorフィールドをfalse初期値で持つ', /this\.hasRemoteDetonator = false;/.test(playerSrc));

  // 【2026-07再設計】「時限装置取った後はプレイヤーが指示出すか、誘爆以外で
  // 爆発しないようにして。なにか別のボタン押すと爆発するような感じ」への
  // 対応で、リモート起爆はもう「爆弾設置できない場面のフォールバック」では
  // なく、専用の起爆ボタン(HUMAN_KEY_MAPS.detonate)からのみ呼ばれる設計に
  // 変わった。詳細な検証はtest_round_m.mjsで行う。
  check(
    'GameScene._tryPlaceBombはもうhasRemoteDetonatorによるフォールバック起爆をしない(専用ボタンに分離)',
    !/if \(player\.hasRemoteDetonator\) this\._tryRemoteDetonate\(player\);/.test(gameSceneSrc),
  );
  check(
    'Bomb作成時にplayer.hasRemoteDetonatorをnoAutoFuseとして渡している',
    /noAutoFuse: player\.hasRemoteDetonator/.test(gameSceneSrc),
  );
  check(
    '_tryRemoteDetonateが自分の未起爆の爆弾を全てdetonate()する(導火線タイマー任せにしない)',
    /_tryRemoteDetonate\(player\)\s*\{\s*\n\s*if \(!player \|\| !player\.hasRemoteDetonator\) return;\s*\n\s*const ownBombs = this\.bombs\.filter\(\(b\) => b\.ownerId === player\.playerId && !b\.detonated\);/.test(
      gameSceneSrc,
    ) && /for \(const bomb of ownBombs\) \{\s*\n\s*bomb\.detonate\(\);/.test(gameSceneSrc),
  );
  check('_tryRemoteDetonateは⏱未取得のプレイヤーには何もしない(早期return)', /if \(!player \|\| !player\.hasRemoteDetonator\) return;/.test(gameSceneSrc));
  check('_tryRemoteDetonateは自分の爆弾が1つも無い場合は何もしない(早期return)', /if \(ownBombs\.length === 0\) return;/.test(gameSceneSrc));
}

console.log(`\n合計: ${pass} 件成功 / ${fail} 件失敗`);
if (fail > 0) process.exit(1);
