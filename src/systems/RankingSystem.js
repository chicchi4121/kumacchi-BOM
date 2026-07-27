/**
 * RankingSystem.js
 * ------------------------------------------------------------
 * Supabaseと連携し、対戦成績ランキングの送信・取得を担当するシステム。
 *
 * Supabase未設定(src/config/supabaseConfig.js)の場合は、LocalStorage
 * (Save.js)のランキングキャッシュを参照・追記するだけのモックとして
 * 動作する(開発ルール8と同じ「機能の有無がゲーム本体に影響しない」
 * フォールバック設計)。
 *
 * テーブル定義・RLS設定は`supabase/schema.sql`を参照。1試合につき、
 * 参加した各プレイヤー(人間・AI問わず)ごとに1行を記録する「対戦ログ」
 * 形式のシンプルなランキングにしている(勝利数の累計等の集計は将来の
 * 拡張案。README参照)。
 * ------------------------------------------------------------
 */
import { Save } from '../utils/Save.js';
import { getSupabaseClient } from './SupabaseClient.js';

const RANKING_TABLE = 'rankings';

export class RankingSystem {
  constructor() {
    this._clientPromise = null;
  }

  async _getClient() {
    if (!this._clientPromise) {
      this._clientPromise = getSupabaseClient().catch((e) => {
        console.warn('[RankingSystem] Supabaseへの接続に失敗したため、ローカル保存のみで動作します。', e);
        return null;
      });
    }
    return this._clientPromise;
  }

  /**
   * ランキング上位を取得する(降順:exp)。Supabase未設定・取得失敗時は
   * ローカルキャッシュ(自分の端末での対戦履歴のみ)にフォールバックする。
   * @param {number} limit
   * @returns {Promise<Array<object>>}
   */
  async fetchRanking(limit = 20) {
    const client = await this._getClient();
    if (!client) {
      return [...Save.getRankingCache()].sort((a, b) => (b.exp ?? 0) - (a.exp ?? 0)).slice(0, limit);
    }
    try {
      const { data, error } = await client
        .from(RANKING_TABLE)
        .select('*')
        .order('exp', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    } catch (e) {
      console.warn('[RankingSystem] ランキングの取得に失敗しました。ローカルキャッシュを表示します。', e);
      return [...Save.getRankingCache()].sort((a, b) => (b.exp ?? 0) - (a.exp ?? 0)).slice(0, limit);
    }
  }

  /**
   * 1人分の対戦結果を記録する。常にローカルキャッシュにも追記しておく
   * (Supabase接続失敗時のフォールバック・オフラインでも自分の履歴だけは
   * 見られるようにするため)。
   * @param {object} result - { playerName, mode, rank, kills, bombsExploded, itemsCollected, exp, isHuman }
   */
  async submitResult(result) {
    const record = {
      player_name: result.playerName ?? 'プレイヤー',
      mode: result.mode ?? 'ai',
      rank: result.rank ?? null,
      kills: result.kills ?? 0,
      bombs_exploded: result.bombsExploded ?? 0,
      items_collected: result.itemsCollected ?? 0,
      exp: result.exp ?? 0,
      is_human: !!result.isHuman,
    };

    const cache = Save.getRankingCache();
    cache.push({ ...record, created_at: new Date().toISOString() });
    Save.setRankingCache(cache.slice(-200)); // ローカルは肥大化しないよう直近200件までに制限

    const client = await this._getClient();
    if (!client) return;
    try {
      const { error } = await client.from(RANKING_TABLE).insert(record);
      if (error) throw error;
    } catch (e) {
      console.warn('[RankingSystem] Supabaseへのランキング送信に失敗しました(ローカルには保存済みです)。', e);
    }
  }
}

export const rankingSystem = new RankingSystem();
