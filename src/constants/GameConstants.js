/**
 * GameConstants.js
 * ------------------------------------------------------------
 * ゲーム全体で使用する設定値・マジックナンバーを一元管理するファイル。
 * 開発ルール5「マジックナンバーを避け、設定値は定数ファイルで一元管理すること」
 * に基づき、他ファイルからは必ずこのファイル経由で値を参照すること。
 * ------------------------------------------------------------
 */

// --- 画面・グリッド設定 -----------------------------------------
export const TILE_SIZE = 48; // 1マスのピクセルサイズ
export const GRID_COLS = 15; // マップの横マス数（奇数推奨：迷路生成の都合上）
export const GRID_ROWS = 11; // マップの縦マス数（奇数推奨）
export const SCREEN_WIDTH = TILE_SIZE * GRID_COLS;
export const SCREEN_HEIGHT = TILE_SIZE * GRID_ROWS + 64; // 下部UI分の余白

// --- パフォーマンス目標 -----------------------------------------
export const TARGET_FPS = 60;
export const MAX_LOAD_TIME_MS = 5000;

// --- プレイヤー設定 ---------------------------------------------
export const PLAYER_MOVE_DURATION_MS = 150; // 1マス移動にかかる時間
export const PLAYER_DEFAULT_LIVES = 3;
export const PLAYER_INVINCIBLE_DURATION_MS = 5000; // 🛡アイテムの無敵時間
export const PLAYER_SPEED_BOOST_MULTIPLIER = 1.6; // 👟アイテムの速度倍率
export const PLAYER_COLORS = ['red', 'blue', 'yellow', 'green', 'black', 'white'];
export const MAX_PLAYERS = 6;

// 敵キャラ(AI・2人目以降の人間プレイヤー)の見た目を「同じキャラクター
// (同梱のkumacchi.vrm、地の色は赤)」の色違いにするためのCanvas2D
// filterプロパティ用CSS文字列。PLAYER_COLORSの各色に対応する
// (赤=自分のカスタム/デフォルト見た目そのまま、他の色は色相回転・
// 彩度/明度調整で作る)。実際の見え方はブラウザでの確認が必要。
export const PLAYER_COLOR_FILTERS = Object.freeze({
  red: 'none',
  blue: 'hue-rotate(220deg) saturate(1.1)',
  yellow: 'hue-rotate(50deg) saturate(1.2) brightness(1.05)',
  green: 'hue-rotate(120deg)',
  black: 'saturate(0.3) brightness(0.3)',
  white: 'saturate(0.2) brightness(1.9)',
});

// --- ローカル対戦(PVP)設定 ------------------------------------------
// 同一キーボードでのホットシート対戦を想定し、最大4人までの人間プレイヤーに
// 別々のキー割り当てを用意する（5人目以降は物理的なキー競合を避けるのが
// 難しいため、現状はAI専用とする）。各配列の並びは
// [up, down, left, right, bomb] のPhaser.Input.Keyboard.KeyCodes名。
export const MAX_HUMAN_PLAYERS = 4;
export const HUMAN_KEY_MAPS = Object.freeze([
  Object.freeze({ up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', bomb: 'SPACE' }), // プレイヤー1: 矢印キー+Space
  Object.freeze({ up: 'W', down: 'S', left: 'A', right: 'D', bomb: 'F' }), // プレイヤー2: WASD+F
  Object.freeze({ up: 'I', down: 'K', left: 'J', right: 'L', bomb: 'U' }), // プレイヤー3: IJKL+U
  Object.freeze({ up: 'NUMPAD_EIGHT', down: 'NUMPAD_TWO', left: 'NUMPAD_FOUR', right: 'NUMPAD_SIX', bomb: 'NUMPAD_ZERO' }), // プレイヤー4: テンキー
]);

// --- 爆弾設定 -----------------------------------------------------
export const BOMB_INITIAL_COUNT = 1;
export const BOMB_MAX_COUNT = 10;
export const BOMB_FUSE_MS = 3000; // 設置から爆発までの時間（約3秒）
export const BLAST_INITIAL_RANGE = 1; // 初期爆風範囲（マス数）
export const BLAST_MAX_RANGE = 10; // 最大爆風範囲
export const EXPLOSION_LIFETIME_MS = 400; // 爆風エフェクトの表示時間

// --- ブロック設定 ---------------------------------------------------
export const BLOCK_TYPES = Object.freeze({
  EMPTY: 'empty',
  HARD: 'hard', // 壊せないブロック
  SOFT: 'soft', // 壊せるブロック
  ITEM: 'item', // アイテム入りブロック（破壊後にアイテム出現）
});

export const ITEM_BLOCK_RATE = 0.35; // 壊せるブロックのうちアイテムを内包する割合
export const SAFE_ZONE_RADIUS = 1; // 各プレイヤー開始地点周辺の安全地帯半径（マス）

// --- アイテム設定 ---------------------------------------------------
export const ITEM_TYPES = Object.freeze({
  BOMB_UP: 'bomb_up', // 💣 爆弾数+1
  FIRE_UP: 'fire_up', // 🔥 爆風+1
  SPEED_UP: 'speed_up', // 👟 移動速度アップ
  SHIELD: 'shield', // 🛡 5秒無敵
  LIFE_UP: 'life_up', // ❤️ 残機+1
  GHOST: 'ghost', // 👻 壊せるブロックを通過可能
  KICK: 'kick', // 💥 爆弾キック
});

// --- 必殺技設定 ------------------------------------------------------
export const SKILL_GAUGE_MAX = 100;
export const SKILL_GAUGE_PER_BLOCK_BREAK = 4;
export const SKILL_GAUGE_PER_KILL = 25;
export const RAGE_MODE_DURATION_MS = 8000; // 「爆裂モード」継続時間

// --- AI設定 ----------------------------------------------------------
export const AI_DIFFICULTY = Object.freeze({
  EASY: 'easy',
  NORMAL: 'normal',
  HARD: 'hard',
  EXPERT: 'expert',
});
export const MAX_AI_PLAYERS = 5;

// --- 勝敗判定・リザルト設定 -------------------------------------------------
export const EXP_PER_KILL = 100; // 撃破1件あたりの獲得経験値
export const EXP_PER_BOMB_EXPLODED = 10; // 爆破1件あたりの獲得経験値
export const EXP_PER_ITEM_COLLECTED = 20; // アイテム取得1件あたりの獲得経験値
export const EXP_WIN_BONUS = 300; // 勝利ボーナス

// --- 試合開始前カウントダウン設定 ------------------------------------------
export const COUNTDOWN_STEPS = ['3', '2', '1', 'START'];
export const COUNTDOWN_STEP_MS = 800;

// --- 入力キー設定 ------------------------------------------------------
export const KEYS = Object.freeze({
  UP: 'UP',
  DOWN: 'DOWN',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  BOMB: 'SPACE',
  PAUSE: 'ESC',
});

// --- シーンキー ---------------------------------------------------------
export const SCENE_KEYS = Object.freeze({
  TITLE: 'TitleScene',
  LOBBY: 'LobbyScene',
  ONLINE_LOBBY: 'OnlineLobbyScene',
  RANKING: 'RankingScene',
  GAME: 'GameScene',
  RESULT: 'ResultScene',
  PAUSE: 'PauseScene',
});

// --- 描画レイヤー深度（z-index相当） -------------------------------------
export const DEPTH = Object.freeze({
  FLOOR: 0,
  ITEM: 5,
  BLOCK: 10,
  BOMB: 15,
  EXPLOSION: 20,
  PLAYER: 25,
  UI: 100,
});

// --- オンライン対戦(Supabase Realtime)設定 -------------------------------
// ローカルPVP(同一キーボードでのホットシート、HUMAN_KEY_MAPS)とは別に、
// 別々の端末・ブラウザからSupabase Realtimeのbroadcast/presence経由で
// 対戦できるオンラインPVPに対応する(NetworkSystem.js/NetworkProtocol.js)。
// アーキテクチャ: ホスト(部屋を作った側)の端末だけがゲームロジック全体
// (マップ生成・AI・爆弾・アイテム・勝敗判定)を実行する「ホスト権威型」。
// ゲスト(部屋に参加した側)はホストから届く状態(state)・イベント
// (explosion/item_pickup等)を描画するだけで、自分のキー入力はホストへ
// 送信するのみ(ローカルでは移動処理を行わない)。これにより盤面のズレ
// (デシンク)が原理的に起こらない設計にしている。
export const NETWORK_STATE_BROADCAST_INTERVAL_MS = 100; // ホスト→全員: 状態同期の送信間隔(約10Hz)
export const NETWORK_INPUT_SEND_INTERVAL_MS = 50; // ゲスト→ホスト: 入力送信間隔(約20Hz)
export const NETWORK_INIT_REQUEST_RETRY_MS = 1500; // ゲスト: match_init未受信時の再送要求間隔
export const ROOM_CODE_LENGTH = 5;
// 誤読しやすい0/O・1/Iを除いた文字だけで部屋コードを生成する。
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
// オンライン対戦は同一キーボードでのキー競合が無い(各プレイヤーが自分の
// 端末で操作する)ため、ローカルPVPのMAX_HUMAN_PLAYERS(4、物理キー制約)
// より緩く、面の数と同じ最大6人まで対応する。
export const MAX_ONLINE_PLAYERS = MAX_PLAYERS;
// マップ生成結果(ブロック種別)をネットワーク越しに送る際の1文字エンコード。
// 文字列化してデータ量を抑える(1マス1文字、1面11x11=121文字)。
export const BLOCK_TYPE_CHAR = Object.freeze({
  [BLOCK_TYPES.EMPTY]: '.',
  [BLOCK_TYPES.HARD]: '#',
  [BLOCK_TYPES.SOFT]: '+',
  [BLOCK_TYPES.ITEM]: '$',
});
export const CHAR_BLOCK_TYPE = Object.freeze(
  Object.fromEntries(Object.entries(BLOCK_TYPE_CHAR).map(([type, char]) => [char, type]))
);

// --- サイコロ6面ステージ設定 ---------------------------------------------
// バトルエリアを1枚の平面マップではなく、立方体(サイコロ)の6つの面を
// それぞれ独立した平面マップとして持ち、面の端まで移動すると隣接する面へ
// 乗り移れるようにする（詳細はCubeStage.js/CubeTopology.js参照）。
export const CUBE_FACE_NAMES = Object.freeze(['FRONT', 'BACK', 'RIGHT', 'LEFT', 'TOP', 'BOTTOM']);
export const CUBE_FACE_COLS = 11; // 1面あたりの横マス数（奇数推奨：迷路生成の都合上）
export const CUBE_FACE_ROWS = 11; // 1面あたりの縦マス数（奇数推奨）

// 面をまたいで移動した際、サイコロが転がったように見えるアニメーションの所要時間。
// CubeRenderer.jsのrotateToFace()が使う(詳細は同ファイルの解説コメント参照)。
export const CUBE_ROLL_DURATION_MS = 550;

// --- オートマッチング設定 -------------------------------------------------
// オンライン対戦の「部屋コードで作成/参加」とは別に、部屋コードのやり取り
// なしで自動的に他プレイヤーと組み合わせる「オートマッチング」用の設定。
// 実装(OnlineLobbyScene.js)は、固定の合言葉チャンネル(待合ロビー)に
// presenceで参加し、参加者が集まる(または一定時間待つ)と、参加順が一番
// 早いクライアントが実際の対戦部屋を作成して合図を送る、という
// クライアント主導の簡易マッチングになっている(専用サーバーを持たない
// 構成のため。ごく稀に複数クライアントがほぼ同時にマッチを成立させる
// 競合が発生し得る点はREADME.mdに既知の制限として明記している)。
export const AUTO_MATCH_LOBBY_CODE = 'AUTOMATCH-LOBBY-V1'; // 5文字のランダム部屋コードとは衝突しない固定チャンネル名
export const AUTO_MATCH_MIN_PLAYERS = 2; // これ未満(=自分一人)の場合は制限時間まで他の参加者を待つ
export const AUTO_MATCH_WAIT_MS = 8000; // 自分が待合ロビーに参加してから、他の参加者を待つ最大時間
export const AUTO_MATCH_LEADER_CONFIRM_DELAY_MS = 400; // マッチ確定前の再確認待ち時間(複数クライアントの同時確定を減らす)
export const AUTO_MATCH_SOLO_AI_COUNT = 3; // 制限時間まで待っても自分一人だった場合に補充するAI人数
