/**
 * 公開サーバー API (google.script.run から呼ばれる)。
 * すべて JSON シリアライズ可能なプレーンオブジェクトを返す。
 * エラーは throw new Error('日本語メッセージ')。
 * 各関数は冒頭で ensureSheets_() を呼ぶ(シートが揃っていれば安価)。
 * 書き込み系は withLock_ で直列化する。読み取り系はロック不要。
 */

// ---- 内部ヘルパー ----

function getProjectRow_(projectId) {
  var rows = readAll_('projects');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === String(projectId)) return rows[i];
  }
  return null;
}

function insertActivity_(projectId, type, content) {
  var activity = {
    id: uuid_(),
    project_id: projectId,
    type: type,
    content: content,
    created_at: nowIso_()
  };
  appendRow_('activities', activity);
  return activity;
}

function sanitizePriority_(p) {
  return (p === 'high' || p === 'medium' || p === 'low') ? p : 'medium';
}

function sanitizeDueDate_(d) {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return null;
}

/** due_date 昇順、null は末尾。 */
function sortByDueDateAsc_(a, b) {
  if (a.due_date === b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return a.due_date < b.due_date ? -1 : 1;
}

function projectToApi_(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

var STATUS_LABEL_ = {
  todo: '未着手',
  in_progress: '進行中',
  done: '完了'
};

// ---- ダッシュボード ----

function apiGetDashboard() {
  ensureSheets_();

  var t = todayStr_();
  var weekDate = new Date();
  weekDate.setDate(weekDate.getDate() + 7);
  var weekStr = Utilities.formatDate(weekDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  var taskRows = readAll_('tasks');
  var openTasks = [];
  for (var i = 0; i < taskRows.length; i++) {
    if (taskRows[i].status !== 'done') openTasks.push(rowToTask_(taskRows[i]));
  }

  var overdue = openTasks.filter(function (task) {
    return task.due_date !== null && task.due_date < t;
  }).sort(sortByDueDateAsc_);

  var dueThisWeek = openTasks.filter(function (task) {
    return task.due_date !== null && task.due_date >= t && task.due_date <= weekStr;
  }).sort(sortByDueDateAsc_);

  var overdueIds = {};
  overdue.forEach(function (x) { overdueIds[x.id] = true; });
  var weekIds = {};
  dueThisWeek.forEach(function (x) { weekIds[x.id] = true; });

  var highPriority = openTasks.filter(function (task) {
    return task.priority === 'high' && !overdueIds[task.id] && !weekIds[task.id];
  }).sort(sortByDueDateAsc_);

  // active プロジェクトのみ + カウント
  var projectRows = readAll_('projects');
  var meetingRows = readAll_('meetings');
  var openCountByProject = {};
  var meetingCountByProject = {};
  for (var a = 0; a < taskRows.length; a++) {
    if (taskRows[a].status !== 'done') {
      var pid = taskRows[a].project_id;
      openCountByProject[pid] = (openCountByProject[pid] || 0) + 1;
    }
  }
  for (var m = 0; m < meetingRows.length; m++) {
    var mpid = meetingRows[m].project_id;
    meetingCountByProject[mpid] = (meetingCountByProject[mpid] || 0) + 1;
  }

  var projects = projectRows
    .filter(function (p) { return p.status === 'active'; })
    .map(function (p) {
      var obj = projectToApi_(p);
      obj.open_task_count = openCountByProject[p.id] || 0;
      obj.meeting_count = meetingCountByProject[p.id] || 0;
      return obj;
    });
  // created_at 降順
  projects.sort(function (x, y) {
    return x.created_at < y.created_at ? 1 : (x.created_at > y.created_at ? -1 : 0);
  });

  return {
    overdue: overdue,
    due_this_week: dueThisWeek,
    high_priority: highPriority,
    projects: projects
  };
}

// ---- プロジェクト ----

function apiCreateProject(name, description) {
  ensureSheets_();
  return withLock_(function () {
    var n = typeof name === 'string' ? name.trim() : '';
    if (!n) throw new Error('プロジェクト名は必須です');
    var ts = nowIso_();
    var project = {
      id: uuid_(),
      name: n,
      description: typeof description === 'string' ? description : '',
      status: 'active',
      created_at: ts,
      updated_at: ts
    };
    appendRow_('projects', project);
    insertActivity_(project.id, 'project_created', 'プロジェクト「' + project.name + '」を作成');
    return project;
  });
}

function apiGetProjectDetail(projectId) {
  ensureSheets_();
  var row = getProjectRow_(projectId);
  if (!row) throw new Error('プロジェクトが見つかりません');

  var meetings = readAll_('meetings')
    .filter(function (m) { return m.project_id === String(projectId); })
    .map(rowToMeeting_);
  // date 降順 → created_at 降順
  meetings.sort(function (x, y) {
    if (x.date !== y.date) return x.date < y.date ? 1 : -1;
    if (x.created_at !== y.created_at) return x.created_at < y.created_at ? 1 : -1;
    return 0;
  });

  var tasks = readAll_('tasks')
    .filter(function (t) { return t.project_id === String(projectId); })
    .map(rowToTask_);
  tasks.sort(function (x, y) {
    return x.created_at < y.created_at ? 1 : (x.created_at > y.created_at ? -1 : 0);
  });

  var activities = readAll_('activities')
    .filter(function (act) { return act.project_id === String(projectId); });
  activities.sort(function (x, y) {
    return x.created_at < y.created_at ? 1 : (x.created_at > y.created_at ? -1 : 0);
  });

  var detail = projectToApi_(row);
  detail.meetings = meetings;
  detail.tasks = tasks;
  detail.activities = activities;
  return detail;
}

function apiUpdateProject(projectId, patch) {
  ensureSheets_();
  return withLock_(function () {
    var existing = getProjectRow_(projectId);
    if (!existing) throw new Error('プロジェクトが見つかりません');
    patch = patch || {};
    var rowPatch = { updated_at: nowIso_() };
    if (typeof patch.name === 'string') rowPatch.name = patch.name;
    if (typeof patch.description === 'string') rowPatch.description = patch.description;
    if (patch.status === 'active' || patch.status === 'archived') rowPatch.status = patch.status;
    var updated = updateRowById_('projects', projectId, rowPatch);
    if (!updated) throw new Error('プロジェクトが見つかりません');
    return projectToApi_(updated);
  });
}

function apiDeleteProject(projectId) {
  ensureSheets_();
  return withLock_(function () {
    var existing = getProjectRow_(projectId);
    if (!existing) throw new Error('プロジェクトが見つかりません');
    // カスケード削除
    deleteRowsWhere_('tasks', 'project_id', projectId);
    deleteRowsWhere_('meetings', 'project_id', projectId);
    deleteRowsWhere_('activities', 'project_id', projectId);
    deleteRowById_('projects', projectId);
    return { ok: true };
  });
}

// ---- 音声文字起こし (ステップ1) ----

function apiTranscribeAudio(projectId, base64Data, filename, mimeType) {
  ensureSheets_();
  var project = getProjectRow_(projectId);
  if (!project) throw new Error('プロジェクトが見つかりません');

  var blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data),
    mimeType || 'audio/mpeg',
    filename || 'audio.m4a'
  );

  // Drive にコピーを保存して file ID を控える
  var folder = getOrCreateAudioFolder_();
  var file = folder.createFile(blob);
  var audioFileId = file.getId();

  var transcript = aiTranscribe_(blob);

  return {
    transcript: transcript,
    audio_file_id: audioFileId,
    audio_filename: filename || null
  };
}

// ---- 議事録作成 (ステップ2) ----

function apiCreateMeeting(payload) {
  ensureSheets_();
  payload = payload || {};
  var projectRow = getProjectRow_(payload.projectId);
  if (!projectRow) throw new Error('プロジェクトが見つかりません');

  var transcript = typeof payload.transcript === 'string' ? payload.transcript.trim() : '';
  if (!transcript) throw new Error('文字起こしテキストが空です');

  var date = (typeof payload.date === 'string' && payload.date.trim())
    ? payload.date.trim()
    : todayStr_();

  var project = projectToApi_(projectRow);
  // AI 呼び出しは数分かかりうるためロックの外で行う
  // (ロックは他タブからのタスク操作等の書き込みを止めてしまう)
  var extraction = aiExtractMinutes_(transcript, project.name, project.description, date);

  var titleInput = typeof payload.title === 'string' ? payload.title.trim() : '';
  var title = titleInput || extraction.title;

  return withLock_(function () {
    var meeting = {
      id: uuid_(),
      project_id: project.id,
      title: title,
      date: date,
      audio_file_id: payload.audioFileId === undefined || payload.audioFileId === null ? null : payload.audioFileId,
      audio_filename: payload.audioFilename === undefined || payload.audioFilename === null ? null : payload.audioFilename,
      transcript: transcript,
      summary_md: extraction.summary_md,
      decisions: extraction.decisions || [],
      open_questions: extraction.open_questions || [],
      created_at: nowIso_()
    };
    appendRow_('meetings', meetingToRow_(meeting));

    // 抽出タスク挿入
    var tasks = [];
    var extractedTasks = extraction.tasks || [];
    for (var i = 0; i < extractedTasks.length; i++) {
      var et = extractedTasks[i];
      var ts = nowIso_();
      var task = {
        id: uuid_(),
        project_id: project.id,
        meeting_id: meeting.id,
        title: et.title,
        description: et.description || '',
        assignee: et.assignee || '',
        due_date: sanitizeDueDate_(et.due_date),
        priority: sanitizePriority_(et.priority),
        status: 'todo',
        source: 'ai',
        created_at: ts,
        updated_at: ts
      };
      appendRow_('tasks', taskToRow_(task));
      tasks.push(task);
    }

    // activities
    insertActivity_(project.id, 'meeting_added',
      '議事録「' + title + '」を追加 — ' + extraction.progress_note);
    if (tasks.length > 0) {
      insertActivity_(project.id, 'task_created',
        '会議から' + tasks.length + '件のタスクを自動登録');
    }

    return { meeting: meeting, tasks: tasks };
  });
}

function apiGetMeeting(meetingId) {
  ensureSheets_();
  var meetingRows = readAll_('meetings');
  var found = null;
  for (var i = 0; i < meetingRows.length; i++) {
    if (meetingRows[i].id === String(meetingId)) { found = meetingRows[i]; break; }
  }
  if (!found) throw new Error('議事録が見つかりません');

  var tasks = readAll_('tasks')
    .filter(function (t) { return t.meeting_id === String(meetingId); })
    .map(rowToTask_);
  // created_at 昇順
  tasks.sort(function (x, y) {
    return x.created_at < y.created_at ? -1 : (x.created_at > y.created_at ? 1 : 0);
  });

  return { meeting: rowToMeeting_(found), tasks: tasks };
}

function apiDeleteMeeting(meetingId) {
  ensureSheets_();
  return withLock_(function () {
    var meetingRows = readAll_('meetings');
    var exists = false;
    for (var i = 0; i < meetingRows.length; i++) {
      if (meetingRows[i].id === String(meetingId)) { exists = true; break; }
    }
    if (!exists) throw new Error('議事録が見つかりません');
    // 関連タスク削除(Drive の音声は残す)
    deleteRowsWhere_('tasks', 'meeting_id', meetingId);
    deleteRowById_('meetings', meetingId);
    return { ok: true };
  });
}

// ---- タスク ----

function apiCreateTask(payload) {
  ensureSheets_();
  return withLock_(function () {
    payload = payload || {};
    var projectId = typeof payload.projectId === 'string' ? payload.projectId : '';
    var title = typeof payload.title === 'string' ? payload.title.trim() : '';
    if (!projectId) throw new Error('project_id は必須です');
    if (!title) throw new Error('タスクのタイトルは必須です');
    if (!getProjectRow_(projectId)) throw new Error('プロジェクトが見つかりません');

    var ts = nowIso_();
    var task = {
      id: uuid_(),
      project_id: projectId,
      meeting_id: null,
      title: title,
      description: typeof payload.description === 'string' ? payload.description : '',
      assignee: typeof payload.assignee === 'string' ? payload.assignee : '',
      due_date: (typeof payload.dueDate === 'string' && payload.dueDate) ? payload.dueDate : null,
      priority: sanitizePriority_(payload.priority),
      status: 'todo',
      source: 'manual',
      created_at: ts,
      updated_at: ts
    };
    appendRow_('tasks', taskToRow_(task));
    insertActivity_(projectId, 'task_created', 'タスク「' + title + '」を追加');
    return task;
  });
}

function apiUpdateTask(taskId, patch) {
  ensureSheets_();
  return withLock_(function () {
    patch = patch || {};
    var taskRows = readAll_('tasks');
    var existing = null;
    for (var i = 0; i < taskRows.length; i++) {
      if (taskRows[i].id === String(taskId)) { existing = rowToTask_(taskRows[i]); break; }
    }
    if (!existing) throw new Error('タスクが見つかりません');

    var rowPatch = { updated_at: nowIso_() };
    if (typeof patch.title === 'string') rowPatch.title = patch.title;
    if (typeof patch.description === 'string') rowPatch.description = patch.description;
    if (typeof patch.assignee === 'string') rowPatch.assignee = patch.assignee;
    if (patch.due_date === null || typeof patch.due_date === 'string') {
      rowPatch.due_date = patch.due_date || '';
    }
    if (patch.priority === 'high' || patch.priority === 'medium' || patch.priority === 'low') {
      rowPatch.priority = patch.priority;
    }
    var newStatus = null;
    if (patch.status === 'todo' || patch.status === 'in_progress' || patch.status === 'done') {
      rowPatch.status = patch.status;
      newStatus = patch.status;
    }

    var statusChanged = newStatus !== null && newStatus !== existing.status;

    var updatedRow = updateRowById_('tasks', taskId, rowPatch);
    if (!updatedRow) throw new Error('タスクが見つかりません');
    var updated = rowToTask_(updatedRow);

    if (statusChanged) {
      insertActivity_(updated.project_id, 'task_updated',
        'タスク「' + updated.title + '」を' + STATUS_LABEL_[updated.status] + 'に変更');
    }

    return updated;
  });
}

function apiDeleteTask(taskId) {
  ensureSheets_();
  return withLock_(function () {
    var ok = deleteRowById_('tasks', taskId);
    if (!ok) throw new Error('タスクが見つかりません');
    return { ok: true };
  });
}

// ---- 現状整理 (ダイジェスト) ----

function apiGenerateDigest(projectId) {
  ensureSheets_();
  var projectRow = getProjectRow_(projectId);
  if (!projectRow) throw new Error('プロジェクトが見つかりません');
  var project = projectToApi_(projectRow);
  {

    // 未完了タスク (created_at 降順)
    var openTasks = readAll_('tasks')
      .filter(function (t) { return t.project_id === String(projectId) && t.status !== 'done'; })
      .map(rowToTask_);
    openTasks.sort(function (x, y) {
      return x.created_at < y.created_at ? 1 : (x.created_at > y.created_at ? -1 : 0);
    });

    // 直近20 activities (created_at 降順)
    var activities = readAll_('activities')
      .filter(function (act) { return act.project_id === String(projectId); });
    activities.sort(function (x, y) {
      return x.created_at < y.created_at ? 1 : (x.created_at > y.created_at ? -1 : 0);
    });
    var recentActivities = activities.slice(0, 20);

    // 直近5 meetings (date 降順 → created_at 降順)
    var meetings = readAll_('meetings')
      .filter(function (m) { return m.project_id === String(projectId); })
      .map(rowToMeeting_);
    meetings.sort(function (x, y) {
      if (x.date !== y.date) return x.date < y.date ? 1 : -1;
      if (x.created_at !== y.created_at) return x.created_at < y.created_at ? 1 : -1;
      return 0;
    });
    var recentMeetings = meetings.slice(0, 5);

    // AI 呼び出しはロックの外で行い、書き込みのみロックする
    var digest = aiGenerateDigest_(project, openTasks, recentActivities, recentMeetings);

    var activity = withLock_(function () {
      return insertActivity_(projectId, 'digest', digest);
    });
    return { digest: digest, activity: activity };
  }
}
