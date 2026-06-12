/**
 * Web アプリのエントリポイント。
 */
function doGet() {
  ensureSheets_(); // 初回アクセス時にシートを自動作成 (Db.gs)
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('ProjectFlow')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** HTML テンプレートから部分ファイルを読み込む (<?!= include('styles') ?>) */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
