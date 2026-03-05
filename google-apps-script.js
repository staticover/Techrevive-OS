// ============================================================
// Tech Revive Wireless — Google Apps Script Backend v2
// ============================================================
// INSTRUCTIONS:
// 1. Paste this entire file into your Google Apps Script editor
// 2. Click Save (floppy disk icon)
// 3. Click Deploy > New Deployment
// 4. Type: Web App
// 5. Who has access: Anyone
// 6. Click Deploy, then Allow when Google asks for authorization
// 7. Copy the Web App URL and paste it into Settings in the app
// ============================================================

// ---------- SHEET CONFIGURATION ----------
// Each table gets its own sheet tab with clean human-readable columns.
// A "Monthly Summary" tab is auto-generated from Jobs data.

const SHEETS = {
  jobs: {
    name: 'Jobs',
    headers: ['ID', 'Date', 'Customer', 'Phone', 'Device', 'Repair Type', 'Parts Cost ($)', 'Amount Charged ($)', 'Profit ($)', 'Payment Status', 'Notes'],
    toRow: (j) => [
      j.id || '',
      j.date || '',
      j.customer || '',
      j.phone || '',
      j.device || '',
      j.repair || '',
      parseFloat(j.parts || 0).toFixed(2),
      parseFloat(j.charged || 0).toFixed(2),
      (parseFloat(j.charged || 0) - parseFloat(j.parts || 0)).toFixed(2),
      j.payment || 'unpaid',
      j.notes || ''
    ],
    fromRow: (row) => ({
      id: row[0],
      date: row[1],
      customer: row[2],
      phone: row[3],
      device: row[4],
      repair: row[5],
      parts: parseFloat(row[6]) || 0,
      charged: parseFloat(row[7]) || 0,
      payment: row[9] || 'unpaid',
      notes: row[10] || ''
    })
  },

  parts: {
    name: 'Inventory',
    headers: ['ID', 'Part Name', 'Compatible Model', 'Qty in Stock', 'Cost Per Unit ($)', 'Total Value ($)', 'Low Stock Alert (qty)'],
    toRow: (p) => [
      p.id || '',
      p.name || '',
      p.model || '',
      parseInt(p.qty) || 0,
      parseFloat(p.cost || 0).toFixed(2),
      (parseInt(p.qty || 0) * parseFloat(p.cost || 0)).toFixed(2),
      parseInt(p.alert) || 2
    ],
    fromRow: (row) => ({
      id: row[0],
      name: row[1],
      model: row[2],
      qty: parseInt(row[3]) || 0,
      cost: parseFloat(row[4]) || 0,
      alert: parseInt(row[6]) || 2
    })
  },

  pricing: {
    name: 'Pricing',
    headers: ['ID', 'Service Name', 'Device / Model', 'Your Price ($)', 'Avg Parts Cost ($)', 'Margin ($)', 'Margin (%)'],
    toRow: (p) => {
      const price = parseFloat(p.price || 0);
      const cost = parseFloat(p.cost || 0);
      const margin = price - cost;
      const pct = price > 0 ? Math.round((margin / price) * 100) : 0;
      return [
        p.id || '',
        p.service || '',
        p.device || '',
        price.toFixed(2),
        cost.toFixed(2),
        margin.toFixed(2),
        pct + '%'
      ];
    },
    fromRow: (row) => ({
      id: row[0],
      service: row[1],
      device: row[2],
      price: parseFloat(row[3]) || 0,
      cost: parseFloat(row[4]) || 0
    })
  },

  investments: {
    name: 'Future Investments',
    headers: ['ID', 'Item Name', 'Category', 'Est. Cost ($)', 'Priority', 'Status', 'Where to Buy', 'Notes'],
    toRow: (i) => [
      i.id || '',
      i.name || '',
      i.category || '',
      parseFloat(i.cost || 0).toFixed(2),
      i.priority || 'med',
      i.status || 'wanted',
      i.source || '',
      i.notes || ''
    ],
    fromRow: (row) => ({
      id: row[0],
      name: row[1],
      category: row[2],
      cost: parseFloat(row[3]) || 0,
      priority: row[4] || 'med',
      status: row[5] || 'wanted',
      source: row[6] || '',
      notes: row[7] || ''
    })
  }
};

// ---------- SHEET HELPERS ----------

function getOrCreateSheet(sheetName, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    formatHeaderRow(sheet, headers);
  }
  return sheet;
}

function formatHeaderRow(sheet, headers) {
  const range = sheet.getRange(1, 1, 1, headers.length);
  range.setValues([headers]);
  range.setFontWeight('bold');
  range.setBackground('#1a1a2e');
  range.setFontColor('#ffffff');
  range.setFontSize(10);
  sheet.setFrozenRows(1);
  // Auto-resize columns
  for (let i = 1; i <= headers.length; i++) {
    sheet.setColumnWidth(i, 140);
  }
}

function readTableData(table) {
  const cfg = SHEETS[table];
  if (!cfg) return [];
  const sheet = getOrCreateSheet(cfg.name, cfg.headers);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // Only header row
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue; // Skip blank rows
    try {
      rows.push(cfg.fromRow(data[i]));
    } catch(e) {
      // Skip malformed rows
    }
  }
  return rows;
}

function writeTableData(table, data) {
  const cfg = SHEETS[table];
  if (!cfg) return;
  const sheet = getOrCreateSheet(cfg.name, cfg.headers);

  // Clear existing data (keep header)
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, cfg.headers.length).clearContent();
  }

  if (!data || data.length === 0) return;

  // Write all rows
  const rows = data.map(item => cfg.toRow(item));
  sheet.getRange(2, 1, rows.length, cfg.headers.length).setValues(rows);

  // Style alternating rows
  for (let i = 0; i < rows.length; i++) {
    const bg = i % 2 === 0 ? '#ffffff' : '#f5f3ef';
    sheet.getRange(i + 2, 1, 1, cfg.headers.length).setBackground(bg);
  }

  // If jobs table, update monthly summary
  if (table === 'jobs') {
    rebuildMonthlySummary(data);
  }
}

// ---------- MONTHLY SUMMARY SHEET ----------

function rebuildMonthlySummary(jobs) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = 'Monthly Summary';
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clearContents();
    sheet.clearFormats();
  }

  const headers = ['Month', 'Total Jobs', 'Revenue ($)', 'Parts Spent ($)', 'Net Profit ($)', 'Unpaid Balance ($)', 'Avg Profit Per Job ($)'];
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1a1a2e');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontSize(10);
  sheet.setFrozenRows(1);

  // Group by month
  const byMonth = {};
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  jobs.forEach(j => {
    if (!j.date) return;
    const d = new Date(j.date + 'T00:00:00');
    if (isNaN(d)) return;
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!byMonth[key]) {
      byMonth[key] = {
        label: MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear(),
        jobs: 0, revenue: 0, parts: 0, profit: 0, unpaid: 0
      };
    }
    const charged = parseFloat(j.charged || 0);
    const parts = parseFloat(j.parts || 0);
    byMonth[key].jobs++;
    if (j.payment === 'paid') {
      byMonth[key].revenue += charged;
      byMonth[key].parts += parts;
      byMonth[key].profit += charged - parts;
    } else {
      byMonth[key].unpaid += charged;
    }
  });

  // Sort newest first
  const sorted = Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0]));

  if (sorted.length === 0) return;

  const rows = sorted.map(([key, m]) => [
    m.label,
    m.jobs,
    m.revenue.toFixed(2),
    m.parts.toFixed(2),
    m.profit.toFixed(2),
    m.unpaid.toFixed(2),
    m.jobs > 0 ? (m.profit / m.jobs).toFixed(2) : '0.00'
  ]);

  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

  // Style rows
  for (let i = 0; i < rows.length; i++) {
    const bg = i % 2 === 0 ? '#ffffff' : '#f5f3ef';
    sheet.getRange(i + 2, 1, 1, headers.length).setBackground(bg);
    // Color profit column green or red
    const profit = parseFloat(rows[i][4]);
    sheet.getRange(i + 2, 5).setFontColor(profit >= 0 ? '#2d6a4f' : '#c0392b').setFontWeight('bold');
    // Color unpaid column gold
    sheet.getRange(i + 2, 6).setFontColor('#b8860b');
  }

  // Add totals row
  const totalRow = rows.length + 2;
  const totalRevenue = sorted.reduce((s, [, m]) => s + m.revenue, 0);
  const totalParts = sorted.reduce((s, [, m]) => s + m.parts, 0);
  const totalProfit = sorted.reduce((s, [, m]) => s + m.profit, 0);
  const totalUnpaid = sorted.reduce((s, [, m]) => s + m.unpaid, 0);
  const totalJobs = sorted.reduce((s, [, m]) => s + m.jobs, 0);

  const totals = ['ALL TIME TOTAL', totalJobs, totalRevenue.toFixed(2), totalParts.toFixed(2), totalProfit.toFixed(2), totalUnpaid.toFixed(2), totalJobs > 0 ? (totalProfit / totalJobs).toFixed(2) : '0.00'];
  const totalRange = sheet.getRange(totalRow, 1, 1, headers.length);
  totalRange.setValues([totals]);
  totalRange.setFontWeight('bold');
  totalRange.setBackground('#1a1a2e');
  totalRange.setFontColor('#ffffff');

  // Auto-resize
  for (let i = 1; i <= headers.length; i++) {
    sheet.setColumnWidth(i, 160);
  }
}

// ---------- HTTP HANDLERS ----------

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === 'getAll') {
    const result = {
      jobs: readTableData('jobs'),
      parts: readTableData('parts'),
      pricing: readTableData('pricing'),
      investments: readTableData('investments')
    };
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: 'Tech Revive Wireless API v2 running' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { action, table, data } = body;

    if (action === 'set' && table && data !== undefined) {
      writeTableData(table, data);
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', table, count: data.length }))
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
