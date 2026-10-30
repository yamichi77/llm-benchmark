# LLM Benchmark

日本語解説・固定repo要約・LP・3Dの保存済み結果を比較する記録です。

[結果を見る](index.html) / [比較ビューア](results/public/index.html)

32試行を保存しています。success 24件、permission-required 3件、incomplete 2件、interrupted / invalid / artifact-error 各1件です。成果の有無と成功状態は別です。モデル・経路・実行条件・欠測は各試行の result.json を参照してください。順位や統一条件での性能値を主張するものではありません。

## 公開版の処理

本人のローカル利用者名と内部IPは例示値に、結果記録の絶対パスは匿名化表記に、セッション識別子は公開用の仮名に置換しました。privateファイルへのリンクは除去しています。測定値、status、失敗理由の意味は保持しています。出力ハッシュや元のバイト数が記録されている場合、それらは匿名化前の原記録の値です。

非公開入力repoの要約とキャラクター参照・成果は本人の公開方針に基づき含めています。元の入力repo、生ログ、認証設定、バックアップ、制作ソースは含めません。これらの入力を必要とする本番課題の完全再実行は、この公開物だけではできません。

## 閲覧

index.htmlを開くと保存済み結果を表示します。比較ビューアは静的HTTP配信で利用できます。閲覧にOAuth、モデルAPI、推論実行は不要です。LPのプレビューはsandbox内に表示します。

## コードと依存

runtime/ は実行・ビューア生成コード、runtime/benchmarks/v2/ は課題と実行条件、development/ はテストとダミー入力です。package.jsonとpackage-lock.jsonでthree 0.180.0 / playwright-core 1.56.1を固定しています。

実行用設定とCLIアダプタにはPUBLIC_USER、例示IPなどのプレースホルダーが残ります。利用者の環境に設定し直す必要があります。Python/Blender/MCPやモデルCLIは別途必要で、Node lockfileだけでは揃いません。本番実行は入力送信や課金を伴い得ます。

実モデルを使わないテストは、Node依存導入後に npm test。ブラウザテストはEdgeのパス等を環境に合わせてから実施してください。今回の公開準備では本番推論を実行していません。

## ライセンス

自作の実行コード・ビューアコード・テストコードと、それらの説明文書には [MIT License](LICENSE) を適用します。著作権表示は `Copyright (c) 2026 yamichi77` です。

対象は、`runtime/` と `development/` 内の自作スクリプト・ビューア実装、および `index.html`・`結果を見る.html`・`results/public/index.html` 等に含まれる自作ビューアコードです。第三者コードと、以下のベンチマーク資料・成果は、このMITライセンスの対象に含めません。

- キャラクター参照画像、生成画像、録画、3Dモデル、生成文章・要約・LPなどのベンチマーク成果物。
- `results/public/models/` の成果物・試行記録、`results/public/manifest.json`・`manifest.js` の結果データ、`results/public/entry/assets/` に埋め込まれた成果物。
- 固定課題のプロンプト・入力資料など、コード以外のベンチマーク資料。

成果物がHTMLやJavaScriptの形式でも、ビューアコードとは区別します。これらの資料・成果物に対し、今回の公開による追加の再利用許諾は付与しません。既存の権利や許諾を変更するものではありません。

第三者コードにはそれぞれのライセンスが適用されます。three.jsの [ライセンス表示](results/public/vendor/LICENSE) を保持し、生成済み `results/public/entry/three.js` にもライセンス表示を含めています。その他の依存パッケージのライセンス・著作権表示も、それぞれに従って扱います。
