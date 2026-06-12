/**
 * データアクセス層 — Google スプレッドシートを DB とする。
 * - ensureSheets_()            : 4シートの初期化(ヘッダー/書式/凍結)
 * - 汎用行ヘルパー             : readAll_/appendRow_/updateRowById_/deleteRowById_/deleteRowsWhere_
 * - ドメイン変換               : meeting/task 行 ↔ API オブジェクト
 * - ロック・ユーティリティ     : withLock_/nowIso_/todayStr_/uuid_
 * - Drive                      : getOrCreateAudioFolder_()
 *
 * 全セル値は文字列として保存する。日時は ISO 8601、配列は JSON 文字列。
 * Sheets による日付の自動変換を避けるため、各シートは書式 '@'(プレーンテキスト)。
 */

// ---- シート定義 (ヘッダーは DESIGN-GAS.md と完全一致) ----

var SHEET_HEADERS = {
  projects: ['id', 'name', 'description', 'status', 'created_at', 'updated_at'],
  meetings: [
    'id', 'project_id', 'title', 'date', 'audio_file_id', 'audio_filename',
    'transcript', 'summary_md', 'decisions', 'open_questions', 'created_at'
  ],
  tasks: [
    'id', 'project_id', 'meeting_id', 'title', 'description', 'assignee',
    'due_date', 'priority', 'status', 'source', 'created_at', 'updated_at'
  ],
  activities: ['id', 'project_id', 'type', 'content', 'created_at']
};

var SHEET_NAMES = ['projects', 'meetings', 'tasks', 'activities'];

/**
 * コンテナのスプレッドシートに4シートを用意する。
 * 無ければ作成し、ヘッダー行・プレーンテキスト書式・1行目凍結を設定する。
 * 新規にシートを作成し、かつデフォルトの空 'シート1'/'Sheet1' があれば削除する。
 */
function ensureSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var createdAny = false;

  for (var i = 0; i < SHEET_NAMES.length; i++) {
    var name = SHEET_NAMES[i];
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      createdAny = true;
      // 日付の自動変換を防ぐためプレーンテキスト書式に固定
      sheet.getRange('A:Z').setNumberFormat('@');
      var headers = SHEET_HEADERS[name];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  }

  if (createdAny) {
    var defaults = ['シート1', 'Sheet1'];
    for (var d = 0; d < defaults.length; d++) {
      var def = ss.getSheetByName(defaults[d]);
      if (def && SHEET_NAMES.indexOf(def.getName()) === -1) {
        // 空(ヘッダーも無い)ときのみ削除。最後の1枚は削除できないので保険で件数確認
        if (def.getLastRow() === 0 && ss.getSheets().length > 1) {
          ss.deleteSheet(def);
        }
      }
    }
  }
}

// ---- 汎用行ヘルパー ----

function getSheet_(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    ensureSheets_();
    sheet = ss.getSheetByName(sheetName);
  }
  return sheet;
}

/**
 * シート全行をヘッダーをキーとするオブジェクト配列で返す。
 * getDataRange().getValues() で1回だけ読み出す。
 */
function readAll_(sheetName) {
  var sheet = getSheet_(sheetName);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    // 完全空行はスキップ
    var hasId = String(row[0]) !== '';
    if (!hasId) continue;
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[String(headers[c])] = row[c] === undefined ? '' : String(row[c]);
    }
    out.push(obj);
  }
  return out;
}

/** obj をヘッダー順に並べて1行追記する。 */
function appendRow_(sheetName, obj) {
  var sheet = getSheet_(sheetName);
  var headers = SHEET_HEADERS[sheetName];
  var row = [];
  for (var c = 0; c < headers.length; c++) {
    var v = obj[headers[c]];
    row.push(v === undefined || v === null ? '' : String(v));
  }
  sheet.appendRow(row);
  return obj;
}

/**
 * id 列(A列)を走査し、一致行に patch を適用する。
 * 戻り値は更新後の全フィールドを持つオブジェクト、見つからなければ null。
 */
function updateRowById_(sheetName, id, patch) {
  var sheet = getSheet_(sheetName);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;
  var headers = values[0];
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]) === String(id)) {
      var obj = {};
      for (var c = 0; c < headers.length; c++) {
        var key = String(headers[c]);
        var newVal;
        if (patch.hasOwnProperty(key)) {
          newVal = patch[key] === undefined || patch[key] === null ? '' : String(patch[key]);
        } else {
          newVal = values[r][c] === undefined ? '' : String(values[r][c]);
        }
        obj[key] = newVal;
      }
      var rowArr = headers.map(function (h) { return obj[String(h)]; });
      sheet.getRange(r + 1, 1, 1, headers.length).setValues([rowArr]);
      return obj;
    }
  }
  return null;
}

/** id 一致の行を削除する。削除できたら true。 */
function deleteRowById_(sheetName, id) {
  var sheet = getSheet_(sheetName);
  var values = sheet.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]) === String(id)) {
      sheet.deleteRow(r + 1);
      return true;
    }
  }
  return false;
}

/** 指定列 col の値が value と一致する全行を削除する(下から順に)。削除件数を返す。 */
function deleteRowsWhere_(sheetName, col, value) {
  var sheet = getSheet_(sheetName);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return 0;
  var headers = values[0];
  var colIdx = -1;
  for (var c = 0; c < headers.length; c++) {
    if (String(headers[c]) === col) { colIdx = c; break; }
  }
  if (colIdx === -1) return 0;
  var toDelete = [];
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][colIdx]) === String(value)) {
      toDelete.push(r + 1); // 1-based row index
    }
  }
  // 行番号がずれないよう下から削除
  for (var i = toDelete.length - 1; i >= 0; i--) {
    sheet.deleteRow(toDelete[i]);
  }
  return toDelete.length;
}

// ---- ドメイン変換 ----

/** JSON 文字列 → string[]。失敗時は空配列。 */
function parseStrArray_(s) {
  if (s === undefined || s === null || s === '') return [];
  try {
    var v = JSON.parse(s);
    if (!Array.isArray(v)) return [];
    return v.map(function (x) { return String(x); });
  } catch (e) {
    return [];
  }
}

/** meeting シート行(文字列値) → API オブジェクト。decisions/open_questions を配列化、audio_file_id '' → null。 */
function rowToMeeting_(row) {
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    date: row.date,
    audio_file_id: row.audio_file_id === '' ? null : row.audio_file_id,
    audio_filename: row.audio_filename === '' ? null : row.audio_filename,
    transcript: row.transcript,
    summary_md: row.summary_md,
    decisions: parseStrArray_(row.decisions),
    open_questions: parseStrArray_(row.open_questions),
    created_at: row.created_at
  };
}

/** API meeting オブジェクト → シート行 obj。配列は JSON 文字列化、null → ''。 */
function meetingToRow_(m) {
  return {
    id: m.id,
    project_id: m.project_id,
    title: m.title,
    date: m.date,
    audio_file_id: m.audio_file_id === null || m.audio_file_id === undefined ? '' : m.audio_file_id,
    audio_filename: m.audio_filename === null || m.audio_filename === undefined ? '' : m.audio_filename,
    transcript: m.transcript,
    summary_md: m.summary_md,
    decisions: JSON.stringify(m.decisions || []),
    open_questions: JSON.stringify(m.open_questions || []),
    created_at: m.created_at
  };
}

/** task シート行(文字列値) → API オブジェクト。due_date/meeting_id '' → null。 */
function rowToTask_(row) {
  return {
    id: row.id,
    project_id: row.project_id,
    meeting_id: row.meeting_id === '' ? null : row.meeting_id,
    title: row.title,
    description: row.description,
    assignee: row.assignee,
    due_date: row.due_date === '' ? null : row.due_date,
    priority: row.priority,
    status: row.status,
    source: row.source,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/** API task オブジェクト → シート行 obj。null → ''。 */
function taskToRow_(t) {
  return {
    id: t.id,
    project_id: t.project_id,
    meeting_id: t.meeting_id === null || t.meeting_id === undefined ? '' : t.meeting_id,
    title: t.title,
    description: t.description,
    assignee: t.assignee,
    due_date: t.due_date === null || t.due_date === undefined ? '' : t.due_date,
    priority: t.priority,
    status: t.status,
    source: t.source,
    created_at: t.created_at,
    updated_at: t.updated_at
  };
}

// ---- ロック・ユーティリティ ----

/**
 * スクリプトロックで fn を直列化する。30秒待っても取れなければエラー。
 */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('他の処理が実行中です。しばらくしてからお試しください。');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function nowIso_() {
  return new Date().toISOString();
}

function todayStr_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function uuid_() {
  return Utilities.getUuid();
}

// ---- Drive ----

/** マイドライブ直下に 'ProjectFlow_Audio' フォルダを取得/作成する。 */
function getOrCreateAudioFolder_() {
  var name = 'ProjectFlow_Audio';
  var it = DriveApp.getFoldersByName(name);
  while (it.hasNext()) {
    var f = it.next();
    // マイドライブ直下のものを優先(getFoldersByName は全体検索なので親確認)
    var parents = f.getParents();
    if (!parents.hasNext()) {
      return f;
    }
    while (parents.hasNext()) {
      var p = parents.next();
      if (p.getId() === DriveApp.getRootFolder().getId()) {
        return f;
      }
    }
  }
  return DriveApp.getRootFolder().createFolder(name);
}
