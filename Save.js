/**
 * NetworkSystem.js
 * ------------------------------------------------------------
 * オンライン対戦（Supabase Realtime想定）を担当するシステム
 * （Phase5実装予定）。
 *
 * 現段階ではローカル対戦(PVP)・AI対戦のみのため未接続。
 * 将来、各プレイヤーの入力/状態同期をこのクラス経由で行う設計とし、
 * GameScene・Player等のロジックには手を入れずに済むようにする。
 * ------------------------------------------------------------
 */
export class NetworkSystem {
  constructor() {
    this.connected = false;
    this.channel = null;
  }

  async connect(roomId) {
    // TODO(Phase5): Supabase Realtimeチャンネルへの接続を実装する。
    console.warn('[NetworkSystem] オンライン対戦はPhase5で実装予定です。', roomId);
  }

  disconnect() {
    this.connected = false;
    this.channel = null;
  }

  broadcastPlayerState(state) {
    // TODO(Phase5): 自分の状態(位置・爆弾等)を他プレイヤーへ送信する。
  }
}
