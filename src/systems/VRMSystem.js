/**
 * VRMSystem.js
 * ------------------------------------------------------------
 * VRMキャラクターのアップロード・読込・差し替えを担当するシステム。
 *
 * 開発ルール8「VRMシステムはゲームロジックから分離し、キャラクター
 * 差し替えのみで動作する構造にすること」に従い、本システムは
 * Player.setDisplayObject()を通じて見た目を差し替えるだけで、
 * 移動・当たり判定等のゲームロジックには一切干渉しない。
 *
 * 実装方針（現状のスコープ）:
 *   ボンバーマン系の見下ろし2Dグリッド上でVRMをリアルタイム3D表示・
 *   アニメーションさせるのは大掛かりになるため、Phase3の第一段階として
 *   「VRMモデルを正面から1枚レンダリングし、そのcanvasをPhaserの
 *   静止画テクスチャとして使う」方式を採用する。
 *   将来的にライブ3D表示（歩行アニメーション等）に発展させる場合は、
 *   本クラスのAPI(loadFromArrayBuffer / renderSnapshotTexture)は
 *   変えずに内部実装だけ差し替えられるようにしてある。
 *
 * Three.js / @pixiv/three-vrm はビルドステップを増やさないよう
 * index.htmlのimport map経由でCDNからロードする（ベア指定子でdynamic
 * import）。Node環境（ユニットテスト）ではこれらのモジュールは決して
 * importされない（実際にVRMを読み込むメソッドが呼ばれた時だけdynamic
 * importが走るため、モジュール自体の読み込みはNode上でも安全に行える）。
 * ------------------------------------------------------------
 */
export class VRMSystem {
  constructor() {
    this._modulesPromise = null;
    // タイトル画面からアップロードされたVRM(このブラウザタブ内でのみ有効。
    // ファイル本体はサイズの都合上LocalStorageには保存しない）。
    this.customArrayBuffer = null;
    this.customFileName = null;
  }

  /** タイトル画面のVRMアップロード用。読み込んだファイルの中身を記憶する */
  setCustomVrm(arrayBuffer, fileName) {
    this.customArrayBuffer = arrayBuffer;
    this.customFileName = fileName;
  }

  hasCustomVrm() {
    return this.customArrayBuffer !== null;
  }

  /** Three.js/GLTFLoader/three-vrmをCDN(import map経由)から遅延ロードする */
  _loadModules() {
    if (!this._modulesPromise) {
      console.log('[VRMSystem] Three.js / three-vrm をCDNから読み込み中...');
      this._modulesPromise = Promise.all([
        import(/* webpackIgnore: true */ 'three'),
        import(/* webpackIgnore: true */ 'three/addons/loaders/GLTFLoader.js'),
        import(/* webpackIgnore: true */ '@pixiv/three-vrm'),
      ])
        .then((modules) => {
          console.log('[VRMSystem] Three.js / three-vrm の読み込みに成功しました。');
          return modules;
        })
        .catch((e) => {
          // 次回呼び出し時に再試行できるようキャッシュを破棄する
          this._modulesPromise = null;
          console.error(
            '[VRMSystem] Three.js / three-vrm のCDN読み込みに失敗しました。' +
              'ネットワーク環境やindex.htmlのimport mapのURL/バージョン指定をご確認ください。',
            e
          );
          throw e;
        });
    }
    return this._modulesPromise;
  }

  /**
   * VRMファイルの中身(ArrayBuffer)から、正面向きの静止画スナップショットを
   * 描画したHTMLCanvasElementを生成する。失敗した場合は例外を投げる
   * （呼び出し側でcatchし、デフォルト見た目にフォールバックすること）。
   *
   * @param {ArrayBuffer} arrayBuffer
   * @param {number} size - 出力canvasの一辺(px)
   * @param {(stage: string) => void} [onProgress] - 進行状況を通知するコールバック
   * @returns {Promise<HTMLCanvasElement>}
   */
  async renderSnapshot(arrayBuffer, size = 128, onProgress = () => {}) {
    onProgress('loading-modules');
    const [THREE, { GLTFLoader }, threeVrm] = await this._loadModules();
    const { VRMLoaderPlugin, VRMUtils } = threeVrm;

    onProgress('parsing');
    console.log('[VRMSystem] VRMファイルをパース中...', { byteLength: arrayBuffer.byteLength });

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const gltf = await new Promise((resolve, reject) => {
      loader.parse(arrayBuffer, '', resolve, reject);
    });

    const vrm = gltf.userData.vrm;
    if (!vrm) {
      throw new Error('VRMデータが見つかりません（VRM拡張を含まないglTFファイルの可能性があります）');
    }
    console.log('[VRMSystem] VRMのパースに成功しました。スナップショットを描画します。');
    onProgress('rendering');

    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.removeUnnecessaryJoints(gltf.scene);
    // three-vrmはモデルの-Z方向を正面としているため、+Z側(カメラ側)を
    // 向かせるために180度回転させる。
    vrm.scene.rotation.y = Math.PI;
    vrm.update(0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(size, size);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    scene.add(vrm.scene);
    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(0.5, 1, 1);
    scene.add(dirLight);

    // モデル全体が画角に収まるようバウンディングボックスからカメラ距離を決定する
    const box = new THREE.Box3().setFromObject(vrm.scene);
    const dimensions = new THREE.Vector3();
    box.getSize(dimensions);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const maxDim = Math.max(dimensions.x, dimensions.y, dimensions.z) || 1;

    const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
    camera.position.set(center.x, center.y + dimensions.y * 0.05, center.z + maxDim * 1.5);
    camera.lookAt(center);

    renderer.render(scene, camera);
    const glCanvas = renderer.domElement;

    // 重要: glCanvas(renderer.domElement)は'webgl'コンテキストが紐付いた
    // canvasであり、一度webglコンテキストを取得したcanvasは二度と
    // getContext('2d')を取得できない（nullが返る）。Phaser.Textures.addCanvas()
    // は内部で2Dコンテキスト経由のピクセル読み取り(getImageData等)を行うため、
    // webgl canvasをそのまま渡すと「Cannot read properties of null
    // (reading 'getImageData')」で失敗する。
    // そのため、描画結果を独立した2D canvasへdrawImageでコピーしてから返す。
    const canvas2d = document.createElement('canvas');
    canvas2d.width = size;
    canvas2d.height = size;
    const ctx2d = canvas2d.getContext('2d');
    ctx2d.drawImage(glCanvas, 0, 0, size, size);

    renderer.dispose();

    console.log('[VRMSystem] スナップショットの描画が完了しました。', { size, boxDimensions: dimensions });
    onProgress('done');
    return canvas2d;
  }
}

// アプリ全体で共有するシングルトン。
// customVrmArrayBuffer: タイトル画面からアップロードされたVRM(このブラウザ
// セッション中のみ有効。LocalStorageにはファイル名など軽量な情報のみ保存する)。
export const vrmSystem = new VRMSystem();
