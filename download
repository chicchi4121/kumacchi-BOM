/**
 * RankingSystem.js
 * ------------------------------------------------------------
 * Supabaseと連携し、ランキングデータ（勝利数・撃破数・爆破数・
 * 連勝数・最速勝利・プレイ回数・勝率）の送受信を担当するシステム
 * （Phase4実装予定）。
 *
 * Phase1〜3ではSupabase接続がまだ無いため、LocalStorage(Save.js)の
 * ランキングキャッシュを参照するモックとして動作する。
 * ------------------------------------------------------------
 */
import { Save } from '../utils/Save.js';

export class RankingSystem {
  constructor(supabaseClient = null) {
    // TODO(Phase4): Supabaseクライアントを注入して実際のDB送信を行う。
    this.supabaseClient = supabaseClient;
  }

  async fetchRanking() {
    if (!this.supabaseClient) {
      // Supabase未接続時はローカルキャッシュを返す。
      return Save.getRankingCache();
    }
    // TODO(Phase4): supabaseClient.from('rankings').select(...) を実装。
    return [];
  }

  async submitResult(result) {
    if (!this.supabaseClient) {
      const cache = Save.getRankingCache();
      cache.push(result);
      Save.setRankingCache(cache);
      return;
    }
    // TODO(Phase4): supabaseClient.from('rankings').upsert(result) を実装。
  }
}
