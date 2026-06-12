/**
 * AI 連携層 (変更禁止 — 設計監査済み)
 * - aiTranscribe_(blob)                  : Whisper API による文字起こし
 * - aiExtractMinutes_(transcript, ...)   : Claude structured outputs による議事録・タスク抽出
 * - aiGenerateDigest_(...)               : プロジェクト現状整理の生成
 *
 * Claude API は GAS に公式 SDK がないため UrlFetchApp の raw HTTP で呼ぶ。
 * モデル: claude-opus-4-8 / adaptive thinking / structured outputs (json_schema)
 */

var ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
var ANTHROPIC_MODEL = 'claude-opus-4-8';
var WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';

function getAnthropicKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY が設定されていません。Apps Script の「プロジェクトの設定 → スクリプト プロパティ」で設定してください。');
  }
  return key;
}

/**
 * Claude Messages API 呼び出し共通部。
 * GAS の UrlFetchApp はタイムアウトが伸ばせないため、effort=medium・控えめな
 * max_tokens で応答時間を抑える。
 */
function callClaude_(body) {
  var res = UrlFetchApp.fetch(ANTHROPIC_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': getAnthropicKey_(),
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code !== 200) {
    var detail = '';
    try {
      detail = JSON.parse(res.getContentText()).error.message;
    } catch (e) {
      detail = res.getContentText().slice(0, 200);
    }
    throw new Error('Claude API エラー (HTTP ' + code + '): ' + detail);
  }
  var data = JSON.parse(res.getContentText());
  if (data.stop_reason === 'refusal') {
    throw new Error('AI が処理を拒否しました。入力内容を確認してください。');
  }
  if (data.stop_reason === 'max_tokens') {
    throw new Error('生成結果が長すぎて途中で打ち切られました。文字起こしを分割してお試しください。');
  }
  var text = '';
  for (var i = 0; i < data.content.length; i++) {
    if (data.content[i].type === 'text') text += data.content[i].text;
  }
  if (!text) throw new Error('AI の応答が空でした。もう一度お試しください。');
  return text;
}

/** 議事録・タスク抽出の JSON Schema (structured outputs) */
var MINUTES_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: '会議の内容を表す簡潔なタイトル(例: 〇〇キックオフMTG)'
    },
    summary_md: {
      type: 'string',
      description: '議事録本文 (Markdown)。## 見出しで議題ごとに整理し、議論の要点・経緯を箇条書きでまとめる。発言の単純な羅列ではなく構造化された議事録にする'
    },
    decisions: {
      type: 'array',
      items: { type: 'string' },
      description: '会議で決定した事項のリスト'
    },
    open_questions: {
      type: 'array',
      items: { type: 'string' },
      description: '未解決のまま持ち越された論点・宿題のリスト'
    },
    tasks: {
      type: 'array',
      description: '会議から発生したアクションアイテム(タスク)',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'タスクの簡潔なタイトル' },
          description: { type: 'string', description: '背景・完了条件など。なければ空文字' },
          assignee: { type: 'string', description: '担当者名。特定できなければ空文字' },
          due_date: {
            type: ['string', 'null'],
            description: '期限 (YYYY-MM-DD)。相対表現は会議日付から解決。不明なら null'
          },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] }
        },
        required: ['title', 'description', 'assignee', 'due_date', 'priority'],
        additionalProperties: false
      }
    },
    progress_note: {
      type: 'string',
      description: '経緯タイムライン用の1〜2文の進捗メモ(この会議で何が前進したか)'
    }
  },
  required: ['title', 'summary_md', 'decisions', 'open_questions', 'tasks', 'progress_note'],
  additionalProperties: false
};

var EXTRACT_SYSTEM_PROMPT =
  'あなたは優秀なプロジェクトマネージャーのアシスタントです。\n' +
  '会議の文字起こしテキストから、構造化された議事録とアクションアイテムを抽出します。\n\n' +
  '抽出方針:\n' +
  '- 議事録は読み手がその場にいなくても経緯と結論が分かるように書く\n' +
  '- 決定事項と「単に話題に出ただけのこと」を区別する\n' +
  '- タスクは実行可能な粒度で抽出する。明確な担当者・期限が会話に出ていれば必ず拾う\n' +
  '- 相対的な日付表現(「来週まで」「月末」など)は会議日付を基準に YYYY-MM-DD に解決する\n' +
  '- 文字起こしの誤変換が推測できる場合は文脈から正しい用語に直してよい\n' +
  '- 出力はすべて日本語';

/**
 * 文字起こしから議事録+タスクを抽出する。
 * @return {Object} {title, summary_md, decisions[], open_questions[], tasks[], progress_note}
 */
function aiExtractMinutes_(transcript, projectName, projectDescription, meetingDate) {
  var userContent =
    'プロジェクト名: ' + projectName + '\n' +
    'プロジェクト概要: ' + (projectDescription || '(未設定)') + '\n' +
    '会議日付: ' + meetingDate + '\n\n' +
    '以下が会議の文字起こしです。議事録とタスクを抽出してください。\n\n' +
    '<transcript>\n' + transcript + '\n</transcript>';

  var text = callClaude_({
    model: ANTHROPIC_MODEL,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: MINUTES_SCHEMA }
    },
    system: EXTRACT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }]
  });

  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error('議事録の解析に失敗しました。もう一度お試しください。');
  }
  return parsed;
}

var DIGEST_SYSTEM_PROMPT =
  'あなたは優秀なプロジェクトマネージャーのアシスタントです。\n' +
  'プロジェクトの現状データから「いま何をやるべきか」を簡潔に整理します。\n\n' +
  '出力形式 (Markdown、日本語):\n' +
  '## 現在地\n' +
  'プロジェクトがどこまで進んでいるか 2〜3文で。\n\n' +
  '## 今やるべきこと\n' +
  '優先度順の箇条書き(最大5件)。期限切れ・期限間近を最優先。各項目になぜ今やるべきかを一言添える。\n\n' +
  '## 注意点・リスク\n' +
  '未解決事項や停滞しているものがあれば指摘(なければこのセクションは省略)。';

/**
 * プロジェクト現状整理 (Markdown テキスト) を生成する。
 * @param {Object} project {name, description}
 * @param {Array} openTasks Task[] (status != done)
 * @param {Array} recentActivities Activity[]
 * @param {Array} recentMeetings Meeting[] (decisions/open_questions は string[])
 */
function aiGenerateDigest_(project, openTasks, recentActivities, recentMeetings) {
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  var taskLines = openTasks.map(function (t) {
    return '- [' + t.status + '] ' + t.title +
      ' (優先度:' + t.priority +
      (t.due_date ? ' 期限:' + t.due_date : '') +
      (t.assignee ? ' 担当:' + t.assignee : '') + ')';
  }).join('\n');

  var activityLines = recentActivities.map(function (a) {
    return '- ' + String(a.created_at).slice(0, 10) + ' [' + a.type + '] ' + a.content;
  }).join('\n');

  var meetingLines = recentMeetings.map(function (m) {
    return '### ' + m.date + ' ' + m.title + '\n' +
      '決定事項: ' + (m.decisions.join(' / ') || 'なし') + '\n' +
      '未解決: ' + (m.open_questions.join(' / ') || 'なし');
  }).join('\n\n');

  var userContent =
    '今日の日付: ' + today + '\n\n' +
    '# プロジェクト: ' + project.name + '\n' + (project.description || '') + '\n\n' +
    '# 未完了タスク (' + openTasks.length + '件)\n' + (taskLines || 'なし') + '\n\n' +
    '# 直近の経緯\n' + (activityLines || 'なし') + '\n\n' +
    '# 直近の議事録サマリ\n' + (meetingLines || 'なし') + '\n\n' +
    'このプロジェクトの現状整理をお願いします。';

  return callClaude_({
    model: ANTHROPIC_MODEL,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system: DIGEST_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }]
  }).trim();
}

/**
 * Whisper API による音声文字起こし。
 * @param {Blob} blob 音声ファイル (名前設定済みであること)
 * @return {string} 文字起こしテキスト
 */
function aiTranscribe_(blob) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('音声文字起こしには OPENAI_API_KEY の設定が必要です(スクリプト プロパティ)。文字起こし済みテキストの貼り付けでも議事録を作成できます。');
  }
  // payload に blob を含めると UrlFetchApp が multipart/form-data で送信する
  var res = UrlFetchApp.fetch(WHISPER_URL, {
    method: 'post',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: {
      file: blob,
      model: 'whisper-1',
      language: 'ja',
      response_format: 'text'
    },
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code !== 200) {
    throw new Error('文字起こしに失敗しました (HTTP ' + code + '): ' + res.getContentText().slice(0, 200));
  }
  var text = res.getContentText().trim();
  if (!text) {
    throw new Error('文字起こし結果が空でした。音声ファイルを確認してください。');
  }
  return text;
}
