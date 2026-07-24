/**
 * VRMSystem.js
 * ------------------------------------------------------------
 * VRMキャラクターのアップロード・読込・差し替えを担当するシステム
 * （Phase3実装予定）。
 *
 * 開発ルール8「VRMシステムはゲームロジックから分離し、キャラクター
 * 差し替えのみで動作する構造にすること」に従い、本システムは
 * Player.setDisplayObject()を通じて見た目を差し替えるだけで、
 * 移動・当たり判定等のゲームロジックには一切干渉しない。
 * ------------------------------------------------------------
 */
export class VRMSystem {
  constructor() {
    this.loadedVrmUrl = null;
  }

  /**
   * VRMファイルをアップロードし、Playerの表示を差し替える。
   * TODO(Phase3): three-vrm等を用いた実際のモデル読込を実装する。
   * @param {File} file
   * @param {Player} targetPlayer
   */
  async loadAndApply(file, targetPlayer) {
    // TODO(Phase3): 3Dモデルの読込・Phaser(またはThree.jsオーバーレイ)への統合を実装。
    console.warn('[VRMSystem] VRM対応はPhase3で実装予定です。', file, targetPlayer);
  }
}
