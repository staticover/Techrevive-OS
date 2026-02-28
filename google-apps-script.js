// ============================================================
// Tech Revive Wireless — Google Apps Script Backend
// ============================================================
// INSTRUCTIONS:
// 1. Paste this entire file into your Google Apps Script editor
// 2. Click Save (floppy disk icon)
// 3. Click Deploy > New Deployment
// 4. Type: Web App
// 5. Who has access: Anyone
// 6. Click Deploy, then Allow when Google asks for authorization
// 7. Copy the Web App URL and paste it into the app
// ============================================================

const SHEET_NAME = 'TechReviveData';

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange('A1:B1').setValues([['key', 'value']]);
    sheet.getRange('A1:B1').setFontWeight('bold');
  }
  return sheet;
}

function getData(key) {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      try { return JSON.parse(data[i][1]); } catch(e) { return []; }
    }
  }
  return [];
}

function setData(key, value) {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(JSON.stringify(value));
      return;
    }
  }
  // Key not found, append new row
  sheet.appendRow([key, JSON.stringify(value)]);
}

// Handle GET requests (load all data)
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === 'getAll') {
    const result = {
      jobs: getData('jobs'),
      parts: getData('parts'),
      pricing: getData('pricing'),
    };
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: 'Tech Revive Wireless API running' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Handle POST requests (save data)
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { action, table, data } = body;

    if (action === 'set' && table && data !== undefined) {
      setData(table, data);
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', table }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: 'Unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
