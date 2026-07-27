/**
 * SoundSystem.js
 * ------------------------------------------------------------
 * BGM・効果音の再生を担当するシステム。
 *
 * 開発ルール9「描画・物理・AI・UI・サウンド・データ管理を完全に分離する
 * こと」に基づき、Phaserには依存せずWeb Audio APIのみで完結させている。
 * これにより、assets/audio/配下にSuno制作のBGMや効果音ファイルが
 * 用意でき次第、SE_DEFINITIONS/BGM_DEFINITIONSの中身を
 * 「オシレーター合成」から「音声ファイル再生」に差し替えるだけで
 * 移行できる（呼び出し側のplaySE()/playBGM()のAPIは変更不要）。
 *
 * 現時点(Phase2)では音源ファイルが無いため、オシレーターによる
 * 簡易な合成音をプレースホルダーとして使用する。
 * ------------------------------------------------------------
 */
import { Save } from '../utils/Save.js';

// 効果音定義（データ駆動）: 1つの効果音は複数の音符(note)の連なりとして表現する。
// TODO(将来): assets/audio/se/ に実音源が用意されたら、ここを
// { file: 'bomb_place.mp3' } のような形式に差し替える。
const SE_DEFINITIONS = Object.freeze({
  bomb_place: [{ freq: 220, duration: 0.1, type: 'square', gain: 0.35 }],
  explosion: [{ freq: 180, duration: 0.28, type: 'sawtooth', sweepTo: 45, gain: 0.4 }],
  chain_explosion: [{ freq: 240, duration: 0.24, type: 'sawtooth', sweepTo: 60, gain: 0.38 }],
  item_get: [
    { freq: 440, duration: 0.08, type: 'sine', gain: 0.3 },
    { freq: 660, duration: 0.14, type: 'sine', gain: 0.3, delay: 0.08 },
  ],
  // 「一人1回まで爆弾に当たっても大丈夫」の猶予を消費して助かった際の合図音
  bomb_grace: [
    { freq: 880, duration: 0.06, type: 'triangle', gain: 0.28 },
    { freq: 990, duration: 0.1, type: 'triangle', gain: 0.28, delay: 0.06 },
  ],
  victory: [
    { freq: 523.25, duration: 0.16, type: 'triangle', gain: 0.3 },
    { freq: 659.25, duration: 0.16, type: 'triangle', gain: 0.3, delay: 0.16 },
    { freq: 783.99, duration: 0.32, type: 'triangle', gain: 0.3, delay: 0.32 },
  ],
  defeat: [
    { freq: 392, duration: 0.22, type: 'triangle', gain: 0.3 },
    { freq: 311.13, duration: 0.22, type: 'triangle', gain: 0.3, delay: 0.22 },
    { freq: 261.63, duration: 0.4, type: 'triangle', gain: 0.3, delay: 0.44 },
  ],
  button: [{ freq: 800, duration: 0.05, type: 'square', gain: 0.2 }],
  countdown_tick: [{ freq: 660, duration: 0.1, type: 'square', gain: 0.3 }],
  countdown_go: [{ freq: 990, duration: 0.28, type: 'square', gain: 0.35 }],
});

// BGM定義: 明るくコミカルな雰囲気のシンプルな音階ループ（プレースホルダー）
const BGM_DEFINITIONS = Object.freeze({
  title: [
    { freq: 523.25, duration: 0.28 },
    { freq: 659.25, duration: 0.28 },
    { freq: 783.99, duration: 0.28 },
    { freq: 659.25, duration: 0.28 },
  ],
  game: [
    { freq: 587.33, duration: 0.22 },
    { freq: 698.46, duration: 0.22 },
    { freq: 880.0, duration: 0.22 },
    { freq: 698.46, duration: 0.22 },
    { freq: 587.33, duration: 0.22 },
    { freq: 493.88, duration: 0.22 },
  ],
});

export class SoundSystem {
  constructor() {
    this.ctx = null;
    this.masterSeGain = null;
    this.masterBgmGain = null;
    this.bgmTimer = null;
    this.currentBgmKey = null;

    const savedVolume = Save.getVolume();
    this.bgmVolume = savedVolume.bgm ?? 0.8;
    this.seVolume = savedVolume.se ?? 0.8;
  }

  /** AudioContextはユーザー操作(クリック等)後でないと開始できないブラウザが多いため遅延生成する */
  _ensureContext() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return; // 非対応環境では何もしない

    this.ctx = new AudioCtx();
    this.masterSeGain = this.ctx.createGain();
    this.masterSeGain.gain.value = this.seVolume;
    this.masterSeGain.connect(this.ctx.destination);

    this.masterBgmGain = this.ctx.createGain();
    this.masterBgmGain.gain.value = this.bgmVolume;
    this.masterBgmGain.connect(this.ctx.destination);
  }

  /**
   * @param {'bgm'|'se'} type
   * @param {number} value - 0.0〜1.0
   */
  setVolume(type, value) {
    const clamped = Math.max(0, Math.min(1, value));
    this._ensureContext();
    if (type === 'bgm') {
      this.bgmVolume = clamped;
      if (this.masterBgmGain) this.masterBgmGain.gain.value = clamped;
    } else {
      this.seVolume = clamped;
      if (this.masterSeGain) this.masterSeGain.gain.value = clamped;
    }
    Save.setVolume({ bgm: this.bgmVolume, se: this.seVolume });
  }

  getVolume() {
    return { bgm: this.bgmVolume, se: this.seVolume };
  }

  playSE(key) {
    this._ensureContext();
    if (!this.ctx) return;
    const notes = SE_DEFINITIONS[key];
    if (!notes) {
      console.warn(`[SoundSystem] 未定義の効果音キー: ${key}`);
      return;
    }
    for (const note of notes) this._playTone(note, this.masterSeGain);
  }

  _playTone({ freq, duration, type = 'sine', sweepTo = null, delay = 0, gain = 0.3 }, destination) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = type;

    const start = ctx.currentTime + delay;
    osc.frequency.setValueAtTime(freq, start);
    if (sweepTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(sweepTo, 1), start + duration);
    }

    // クリックノイズ防止のための簡易エンベロープ（アタック→リリース）
    gainNode.gain.setValueAtTime(0.0001, start);
    gainNode.gain.linearRampToValueAtTime(gain, start + 0.01);
    gainNode.gain.linearRampToValueAtTime(0.0001, start + duration);

    osc.connect(gainNode);
    gainNode.connect(destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /** @param {'title'|'game'} key */
  playBGM(key) {
    this._ensureContext();
    if (!this.ctx || this.currentBgmKey === key) return;
    this.stopBGM();

    const sequence = BGM_DEFINITIONS[key];
    if (!sequence) return;

    this.currentBgmKey = key;
    let index = 0;
    const step = () => {
      if (this.currentBgmKey !== key) return; // 停止済み or 別BGMに切り替え済み
      const note = sequence[index % sequence.length];
      this._playTone({ ...note, type: note.type ?? 'triangle', gain: 0.14 }, this.masterBgmGain);
      index++;
      this.bgmTimer = window.setTimeout(step, note.duration * 1000);
    };
    step();
  }

  stopBGM() {
    this.currentBgmKey = null;
    if (this.bgmTimer) {
      window.clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

// アプリ全体で1つのAudioContextを共有するシングルトン
export const soundSystem = new SoundSystem();
