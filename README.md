# くまっちボム！ (Phase1〜2: ゲーム基盤 + ゲーム完成)

ボンバーマン系対戦アクションゲーム。本リポジトリは開発仕様書のPhase1
（ゲーム基盤）とPhase2（ゲーム完成：アイテム・AI・勝敗判定・UI・BGM・
効果音）までを実装したものです。

## 動かし方

ES Modulesを使用しているため、`file://`で直接開くとCORSエラーになります。
簡易サーバーを立ち上げてアクセスしてください。

```bash
npm run dev
# もしくは
python3 -m http.server 8080
```

ブラウザで `http://localhost:8080` を開いてください。

## テスト

Phaser非依存のコアロジックに対する簡易ユニットテストを同梱しています。

```bash
node test_phase1.mjs   # マップ生成・爆風伝播・乱数（Phase1）
node test_phase2.mjs   # アイテム効果・勝敗判定/順位確定・AI（Phase2）
```

## 操作方法

- 矢印キー（↑↓←→）: 移動
- Space: 爆弾設置
- Esc: ポーズ

タイトル画面の「ゲーム開始」→ロビー画面で参加人数・AI難易度・制限時間を
選んでから対戦を開始します（現状ローカルでの複数人操作には未対応のため、
自分以外の参加者は全てAIです）。

## 現在の実装状況

### Phase1: ゲーム基盤

- [x] Phaser 3 環境構築（CDN読み込み、ビルドステップなし）
- [x] マップのランダム生成（毎試合、開始地点は安全地帯を保証）
- [x] プレイヤー移動（グリッドベース、壁・ブロックとの当たり判定）
- [x] 爆弾設置・約3秒後の爆発・十字方向の爆風・壁で停止
- [x] 爆弾同士の誘爆（連鎖爆発）

### Phase2: ゲーム完成

- [x] アイテム出現・取得・効果適用（💣🔥👟🛡❤️👻💥、ItemSystem）
- [x] AI行動（爆弾回避・アイテム取得・追跡・簡易閉じ込め戦術、難易度別パラメータ）
- [x] 詳細な勝敗判定（残機→撃破数→抽選）・死亡順に基づく最終順位確定
- [x] UI強化（ロビー画面での対戦設定、HUDへの順位表示、リザルトの詳細スコア表）
- [x] 試合開始前カウントダウン（3・2・1・START）
- [x] BGM・効果音（Web Audio APIによる合成音。実音源への差し替えはSoundSystem.jsのSE_DEFINITIONS/BGM_DEFINITIONSを変更するだけでOK）

## 未実装（Phase3以降で対応予定）

- 必殺技の発動（SkillSystemはゲージ管理のみ実装済み、発動UI・入力は未接続）
- VRM対応（VRMSystem）
- サイコロ6面ステージ
- Supabase連携（ランキング・セーブ）
- オンライン対戦（NetworkSystem）
- ローカルでの複数人同時操作（ホットシート対戦用の複数キーマップ）
- BGM/効果音の実音源（Suno制作分）への差し替え

詳細は各ファイル内のコメント（`TODO(PhaseN): ...`）を参照してください。

## GitHubへの登録

このフォルダは既に `git init` 済み・初回コミット済みです。GitHubで空の
リポジトリを作成し、以下を実行するだけでプッシュできます。

```bash
git remote add origin https://github.com/<あなたのユーザー名>/kumacchi-bomb.git
git push -u origin main
```

## Renderへのデプロイ

ビルド不要な静的サイト（Phaser CDN読み込み + ES Modules）なので、
Renderの「Static Site」で十分動きます。

1. Render ( https://dashboard.render.com ) にログイン
2. 「New +」→「Static Site」を選択し、GitHubの `kumacchi-bomb` リポジトリを接続
3. 設定項目:
   - Build Command: 空欄のままでOK（何もビルドしない）
   - Publish Directory: `.`（リポジトリ直下、`index.html`がある場所）
4. 「Create Static Site」でデプロイ完了。数十秒でURLが発行されます。

同梱の `render.yaml` を使えば、「New +」→「Blueprint」からリポジトリを
選択するだけで上記設定が自動適用されます。
