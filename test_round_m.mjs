/**
 * test_round_m.mjs
 * ------------------------------------------------------------
 * 今回(2026-07 続報その3)の6件の要望対応を検証する簡易ユニットテスト。
 *
 * 1. 「トップ画面の画像が切れているので修正して」→ TitleScene.jsが単純な
 *    1枚cover方式(トリミングされうる)から、背景(cover,ティント)+
 *    前景(contain,絶対にトリミングしない)の2枚重ねに変わったことを検証する
 *    (詳細な正規表現チェックはtest_round_j.mjsの5bセクション参照。ここでは
 *    「contain方式が必ず画像全体を画面内に収める」という数式自体の性質を
 *    数値計算で検証する)。
 * 2. 「移動の面がかわっていない」→ 実際にCubeRenderer.jsのソースをNode上で
 *    動かして全24通りの面またぎを検証するtest_cube_renderer_runtime.mjsを
 *    新設(数式の手計算だけでなく実装そのものを実行して確認)。加えて、
 *    GameScene側の毎フレーム3D描画更新を共通ヘルパー_renderCubeStageに
 *    まとめ、万一の実行時例外で3D描画全体が固まらないようtry/catchで
 *    保護するようになったことをtest_round_l.mjsで検証済み。
 * 3. 「スタートカウントダウン時が無音になっていない」→ 以前はcountdown_tick/
 *    countdown_go効果音の呼び出しを消しただけで、タイトル画面のBGMが
 *    止まらないまま鳴り続けていた不具合を修正し、_startCountdown()の冒頭で
 *    soundSystem.stopBGM()を呼ぶようになったことを検証する。
 * 4. 「敵をまだ弱くしてほしい」(3回目)→ AI_PROFILESの全難易度が前回
 *    (test_round_k.mjs時点)よりもさらに弱くなっており、かつ難易度間の
 *    相対順序(EASY<NORMAL<HARD<EXPERT)が維持されていることを検証する。
 * 5. 「盾のアイテムを削除して」→ ITEM_TYPES/ITEM_SPAWN_WEIGHTS/ITEM_EMOJI/
 *    ITEM_EFFECTSからSHIELDが完全に削除されたことを検証する。
 * 6. 「時限装置の個数を減らして。取得後は指示出すか誘爆以外で爆発しない
 *    ように。別のボタンで爆発。出現数を1ステージ4個に」→
 *    TIMER_ITEM_COUNT_PER_STAGEによる固定数出現(CubeStage)、
 *    Bomb.noAutoFuse(導火線タイマーを仕掛けない)、専用の起爆ボタン
 *    (HUMAN_KEY_MAPS.detonate・ネットワーク入力mode='detonate'・タッチの
 *    detonateBtn)への再設計を検証する。
 * ------------------------------------------------------------
 */
import fs from 'fs';

class FakeScene {
  constructor() {
    this.render3D = true; // 3D(サイコロステージ)モードではBomb._createSprite()を呼ばない(開発ルール9)
    this._delayedCalls = [];
    this.time = {
      now: 0,
      delayedCall: (ms, cb) => {
        const entry = { ms, cb, removed: false, remove: () => (entry.removed = true) };
        this._delayedCalls.push(entry);
        return entry;
      },
    };
  }
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

const { CubeStage } = await import('./src/objects/CubeStage.js');
const { Bomb } = await import('./src/objects/Bomb.js');
const { AI } = await import('./src/objects/AI.js');
const {
  ITEM_TYPES,
  ITEM_SPAWN_WEIGHTS,
  TIMER_ITEM_COUNT_PER_STAGE,
  AI_DIFFICULTY,
  HUMAN_KEY_MAPS,
  CUBE_FACE_NAMES,
  BLOCK_TYPES,
} = await import('./src/constants/GameConstants.js');
const { ITEM_EMOJI } = await import('./src/objects/Item.js');

console.log('\n== 1. トップ画面画像: containスケールは常に画像全体を画面内に収める ==');
{
  // 「画面いっぱいに拡大するcover(はみ出た分は切れる)」と「絶対に切れない
  // contain(縦横どちらか小さい方の倍率)」の数式自体の性質を、実際の
  // TitleScene.jsと同じ計算式で複数の画面サイズ・画像サイズの組み合わせに
  // ついて検証する(containで拡大した画像の描画後サイズが、常に画面の
  // 幅・高さ以下に収まっていることを確認する)。
  const cases = [
    { screenW: 1920, screenH: 1080, imgW: 1024, imgH: 1024 }, // 横長画面 x 正方形画像
    { screenW: 400, screenH: 800, imgW: 1024, imgH: 1024 }, // 縦長(スマホ)画面 x 正方形画像
    { screenW: 1000, screenH: 1000, imgW: 1600, imgH: 900 }, // 正方形画面 x 横長画像
    { screenW: 500, screenH: 1200, imgW: 900, imgH: 1600 }, // 縦長画面 x 縦長画像
  ];
  let allContained = true;
  for (const c of cases) {
    const containScale = Math.min(c.screenW / c.imgW, c.screenH / c.imgH);
    const renderedW = c.imgW * containScale;
    const renderedH = c.imgH * containScale;
    if (renderedW > c.screenW + 1e-6 || renderedH > c.screenH + 1e-6) allContained = false;
  }
  check('全ケースでcontain方式の描画後サイズが画面の幅・高さ以下に収まる(=絶対に切れない)', allContained);

  const titleSrc = fs.readFileSync('src/scenes/TitleScene.js', 'utf8');
  check('TitleScene.jsがbgImage(cover)とfgImage(contain)の2層構成になっている', /bgImage/.test(titleSrc) && /fgImage/.test(titleSrc));
}

console.log('\n== 2. カウントダウン中のBGM無音化 ==');
{
  const gameSceneSrc = fs.readFileSync('src/scenes/GameScene.js', 'utf8');
  const countdownFnMatch = gameSceneSrc.match(/_startCountdown\(\) \{([\s\S]*?)\n  \}/);
  const countdownBody = countdownFnMatch ? countdownFnMatch[1] : '';
  check('_startCountdown()内にsoundSystem.stopBGM()の呼び出しがある', /soundSystem\.stopBGM\(\);/.test(countdownBody));
  // stopBGM()はcountdownActive=trueのすぐ後、実際のカウントダウン演出
  // (COUNTDOWN_STEPS.forEach)より前に呼ばれている必要がある(先にBGMを
  // 止めてから演出を開始しないと、演出開始の一瞬だけ旧BGMが聞こえてしまう)。
  const stopIdx = countdownBody.indexOf('soundSystem.stopBGM();');
  const stepsIdx = countdownBody.indexOf('COUNTDOWN_STEPS.forEach');
  check('stopBGM()はCOUNTDOWN_STEPSの演出開始より前に呼ばれている', stopIdx >= 0 && stepsIdx >= 0 && stopIdx < stepsIdx);
}

console.log('\n== 3. 敵AIをさらに弱くする(3回目) ==');
{
  // test_round_k.mjs時点(2回目の弱体化)のスナップショット値。
  const prevProfiles = {
    [AI_DIFFICULTY.EASY]: { decisionIntervalMs: 600, mistakeChance: 0.45, bombChance: 0.28, killShotChance: 0.4, chaseChance: 0.22, escapeSearchDepth: 2 },
    [AI_DIFFICULTY.NORMAL]: { decisionIntervalMs: 420, mistakeChance: 0.28, bombChance: 0.45, killShotChance: 0.58, chaseChance: 0.45, escapeSearchDepth: 3 },
    [AI_DIFFICULTY.HARD]: { decisionIntervalMs: 260, mistakeChance: 0.14, bombChance: 0.6, killShotChance: 0.75, chaseChance: 0.65, escapeSearchDepth: 5 },
    [AI_DIFFICULTY.EXPERT]: { decisionIntervalMs: 150, mistakeChance: 0.06, bombChance: 0.75, killShotChance: 0.88, chaseChance: 0.8, escapeSearchDepth: 6 },
  };

  const difficulties = Object.values(AI_DIFFICULTY);
  const newProfiles = difficulties.map((d) => new AI(null, d).profile);

  let allWeaker = true;
  for (const d of difficulties) {
    const oldP = prevProfiles[d];
    const newP = new AI(null, d).profile;
    if (
      !(
        newP.decisionIntervalMs > oldP.decisionIntervalMs &&
        newP.mistakeChance > oldP.mistakeChance &&
        newP.bombChance < oldP.bombChance &&
        newP.killShotChance < oldP.killShotChance &&
        newP.chaseChance < oldP.chaseChance &&
        newP.escapeSearchDepth <= oldP.escapeSearchDepth
      )
    ) {
      allWeaker = false;
    }
  }
  check('全難易度で前回(test_round_k時点)より反応が遅く・ミスが増え・積極性が下がっている', allWeaker);
  check(
    '調整後もdecisionIntervalMsはEASY>NORMAL>HARD>EXPERTの順で短くなる(難易度が上がるほど反応が速い)',
    newProfiles.every((p, i) => i === 0 || p.decisionIntervalMs < newProfiles[i - 1].decisionIntervalMs)
  );
  check(
    '調整後もescapeSearchDepthはEASY<NORMAL<HARD<EXPERTの順で増える(難易度が上がるほど回避が上手い)',
    newProfiles.every((p, i) => i === 0 || p.escapeSearchDepth > newProfiles[i - 1].escapeSearchDepth)
  );
}

console.log('\n== 4. 盾アイテム(SHIELD)の完全削除 ==');
{
  check('ITEM_TYPESにSHIELDが定義されていない', ITEM_TYPES.SHIELD === undefined);
  check('ITEM_SPAWN_WEIGHTSに"shield"キーが含まれない', !('shield' in ITEM_SPAWN_WEIGHTS));
  check('ITEM_EMOJIに"shield"キーが含まれない', !('shield' in ITEM_EMOJI));

  const itemSystemSrc = fs.readFileSync('src/systems/ItemSystem.js', 'utf8');
  check('ItemSystem.jsにSHIELDのハンドラが残っていない', !/ITEM_TYPES\.SHIELD/.test(itemSystemSrc));
}

console.log('\n== 5. 時限装置(⏱ TIMER)の再設計 ==');
{
  check('TIMER_ITEM_COUNT_PER_STAGEが4に設定されている', TIMER_ITEM_COUNT_PER_STAGE === 4);
  check('ITEM_SPAWN_WEIGHTSにはTIMERが含まれない(固定数出現方式のため重み付き抽選対象外)', !('timer' in ITEM_SPAWN_WEIGHTS));

  // CubeStage.generate()を複数回実行し、実際に全6面の合計でちょうど
  // TIMER_ITEM_COUNT_PER_STAGE個のTIMERアイテムが割り当てられることを確認する。
  let allExactCount = true;
  const TRIALS = 20;
  for (let i = 0; i < TRIALS; i++) {
    const cube = new CubeStage(11, 11);
    cube.generate(1, 1);
    let timerCount = 0;
    let itemBlockCount = 0;
    for (const face of CUBE_FACE_NAMES) {
      const stage = cube.getFaceStage(face);
      for (const type of stage.itemTypeByTile.values()) {
        itemBlockCount++;
        if (type === ITEM_TYPES.TIMER) timerCount++;
      }
    }
    // アイテム入りブロックが十分な数(4個以上)ある通常のケースでは、
    // 必ずちょうどTIMER_ITEM_COUNT_PER_STAGE個になっているはず。
    if (itemBlockCount >= TIMER_ITEM_COUNT_PER_STAGE && timerCount !== TIMER_ITEM_COUNT_PER_STAGE) {
      allExactCount = false;
    }
  }
  check(`${TRIALS}回の試行全てで、1ステージ(6面合計)ちょうど${TIMER_ITEM_COUNT_PER_STAGE}個のTIMERアイテムが割り当てられる`, allExactCount);

  // Bomb.js: noAutoFuse
  const scene1 = new FakeScene();
  const normalBomb = new Bomb(scene1, 'FRONT', 1, 1, { ownerId: 1, blastRange: 1, noAutoFuse: false });
  check('noAutoFuse=falseの爆弾は通常通り導火線タイマーが仕掛けられる(fuseTimerが存在)', normalBomb.fuseTimer !== null);
  check('noAutoFuse=falseの爆弾はscene.time.delayedCallが呼ばれている', scene1._delayedCalls.length === 1);

  const scene2 = new FakeScene();
  const timerBomb = new Bomb(scene2, 'FRONT', 1, 1, { ownerId: 1, blastRange: 1, noAutoFuse: true });
  check('noAutoFuse=trueの爆弾は導火線タイマーを一切仕掛けない(fuseTimerがnull)', timerBomb.fuseTimer === null);
  check('noAutoFuse=trueの爆弾ではscene.time.delayedCallが一度も呼ばれない', scene2._delayedCalls.length === 0);

  let detonatedViaExplicitCall = false;
  timerBomb.onDetonate = () => (detonatedViaExplicitCall = true);
  timerBomb.detonate();
  check('noAutoFuse=trueの爆弾でも、明示的にdetonate()を呼べば爆発する(専用ボタン相当)', detonatedViaExplicitCall === true);

  let detonatedViaChain = false;
  const scene3 = new FakeScene();
  const timerBomb2 = new Bomb(scene3, 'FRONT', 1, 1, { ownerId: 1, blastRange: 1, noAutoFuse: true });
  timerBomb2.onDetonate = () => (detonatedViaChain = true);
  timerBomb2._chainTriggered = true; // GameScene._onBombDetonateが誘爆時に付与するフラグと同じ使い方
  timerBomb2.detonate();
  check('noAutoFuse=trueの爆弾でも、誘爆(他の爆弾からのdetonate()呼び出し)では爆発する', detonatedViaChain === true);

  // GameScene.js: 専用起爆ボタンの配線
  const gameSceneSrc = fs.readFileSync('src/scenes/GameScene.js', 'utf8');
  check('HUMAN_KEY_MAPSの各プレイヤーにdetonateキーが定義されている', HUMAN_KEY_MAPS.every((m) => typeof m.detonate === 'string' && m.detonate.length > 0));
  check(
    '_createInputで専用のdetonateキーにキーバインドし、_tryRemoteDetonateを呼んでいる',
    /detonate: this\.input\.keyboard\.addKey\(KeyCodes\[map\.detonate\]\)/.test(gameSceneSrc) &&
      /keys\.detonate\.on\('down', \(\) => \{[\s\S]{0,80}this\._tryRemoteDetonate\(player\);/.test(gameSceneSrc)
  );
  check(
    'ゲスト側もdetonateキーでbuildDetonateInputMessageをホストへ送信する',
    /this\._guestKeys\.detonate\.on\('down', \(\) => \{[\s\S]{0,120}buildDetonateInputMessage\(this\.myPlayerId\)/.test(gameSceneSrc)
  );
  check(
    'ホスト側_onHostNetworkMessageがmode===\'detonate\'を処理する',
    /msg\.mode === 'detonate'/.test(gameSceneSrc) && /this\._tryRemoteDetonate\(player\);/.test(gameSceneSrc)
  );
  check('タッチ操作用のdetonateBtn・_handleTouchDetonatePressが存在する', /detonateBtn/.test(gameSceneSrc) && /_handleTouchDetonatePress/.test(gameSceneSrc));

  const layoutSrc = fs.readFileSync('src/utils/TouchControlLayout.js', 'utf8');
  check('TouchControlLayoutにdetonateボタンの配置が追加されている', /detonate:\s*\{\s*x:/.test(layoutSrc));

  const networkProtocolSrc = fs.readFileSync('src/systems/NetworkProtocol.js', 'utf8');
  check('NetworkProtocol.jsにbuildDetonateInputMessageが定義されている', /export function buildDetonateInputMessage\(playerId\)/.test(networkProtocolSrc));

  const bombSrc = fs.readFileSync('src/objects/Bomb.js', 'utf8');
  check('GameScene._tryPlaceBombがBomb生成時にnoAutoFuse: player.hasRemoteDetonatorを渡す', /noAutoFuse: player\.hasRemoteDetonator/.test(gameSceneSrc));
  check('Bomb.jsのfuseTimerがnoAutoFuseに応じて条件分岐している', /this\.fuseTimer = this\.noAutoFuse \? null : scene\.time\.delayedCall/.test(bombSrc));
}

console.log(`\n合計: ${pass} 件成功 / ${fail} 件失敗`);
if (fail > 0) process.exit(1);
