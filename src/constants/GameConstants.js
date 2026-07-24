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
