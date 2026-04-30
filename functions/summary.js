const AIRTABLE_BASE_ID = 'appdAkhQz46xwsS8Y';
const AIRTABLE_TABLE_ID = 'tblHtd7s9wDTRcfxf';
const FLAG_THRESHOLD = 1500;
const EMAILJS_SERVICE_ID = 'service_e1lex4v';
const EMAILJS_TEMPLATE_ID = 'template_gf34sm8';
const EMAILJS_PUBLIC_KEY = 'fBr3U4xpS_U3gH4og';
const LOGO_URL = 'https://raw.githubusercontent.com/SLLServices/sll-expenses/main/sll-logo.png';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const type = url.searchParams.get('type') || 'weekly';
  const debug = url.searchParams.get('debug') === 'true';

  try {
    const { startDate, endDate, periodLabel } = getDateRange(type);
    const apiKey = context.env.AIRTABLE_API_KEY;
    const privateKey = context.env.EMAILJS_PRIVATE_KEY;

    const fetchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?maxRecords=1000`;
    const response = await fetch(fetchUrl, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (debug) {
      return new Response(JSON.stringify({
        apiKeyPresent: !!apiKey,
        airtableStatus: response.status,
        recordCount: (data.records || []).length,
        firstRecord: data.records?.[0]?.fields || null,
        error: data.error || null
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const records = (data.records || []).map(r => r.fields);

    if (records.length === 0) {
      return new Response(`No records found for ${periodLabel}`, { status: 200 });
    }

    const summary = buildSummary(records);
    const html = buildEmailHTML(summary, periodLabel, type);
    const emailResult = await sendEmail(html, type, periodLabel, privateKey);

    return new Response(`Records: ${records.length}. Email status: ${emailResult.status}. Result: ${emailResult.result}`, { status: 200 });
  } catch (err) {
    return new Response(`Error: ${err.message}\n${err.stack}`, { status: 500 });
  }
}

function getDateRange(type) {
  const now = new Date();
  let startDate, endDate, periodLabel;

  if (type === 'weekly') {
    const dayOfWeek = now.getDay();
    const lastSaturday = new Date(now);
    lastSaturday.setDate(now.getDate() - dayOfWeek - 1);
    const lastSunday = new Date(lastSaturday);
    lastSunday.setDate(lastSaturday.getDate() - 6);
    startDate = formatDate(lastSunday);
    endDate = formatDate(lastSaturday);
    periodLabel = `Week of ${formatDateDisplay(lastSunday)} - ${formatDateDisplay(lastSaturday)}`;
  } else {
    const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastOfPrevMonth = new Date(firstOfThisMonth);
    lastOfPrevMonth.setDate(0);
    const firstOfPrevMonth = new Date(lastOfPrevMonth.getFullYear(), lastOfPrevMonth.getMonth(), 1);
    startDate = formatDate(firstOfPrevMonth);
    endDate = formatDate(lastOfPrevMonth);
    const monthName = firstOfPrevMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    periodLabel = monthName;
  }

  return { startDate, endDate, periodLabel };
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function formatDateDisplay(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildSummary(records) {
  let totalAmount = 0;
  const byCategory = {};
  const byEmployee = {};
  const flagged = [];

  records.forEach(record => {
    const amount = parseFloat(record['Amount']) || 0;
    const category = record['Category'] || 'Uncategorized';
    const employee = record['Employee Name'] || 'Unknown';
    const vendor = record['Vendor'] || '-';
    const purpose = record['Purpose'] || '-';
    const jobCode = record['WO# / Project'] || '-';

    totalAmount += amount;

    if (!byCategory[category]) byCategory[category] = 0;
    byCategory[category] += amount;

    if (!byEmployee[employee]) byEmployee[employee] = 0;
    byEmployee[employee] += amount;

    if (amount >= FLAG_THRESHOLD) {
      flagged.push({ employee, vendor, amount, category, purpose, jobCode });
    }
  });

  const sortedCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const sortedEmployees = Object.entries(byEmployee).sort((a, b) => b[1] - a[1]);

  return {
    totalAmount,
    totalCount: records.length,
    byCategory: sortedCategories,
    byEmployee: sortedEmployees,
    flagged,
    topCategory: sortedCategories[0] || null,
    topEmployee: sortedEmployees[0] || null
  };
}

function formatMoney(amount) {
  return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function buildEmailHTML(summary, periodLabel, type) {
  const reportType = type === 'weekly' ? 'Weekly' : 'Monthly';

  const categoryRows = summary.byCategory.map(([cat, amt], index) => {
    const pct = ((amt / summary.totalAmount) * 100).toFixed(1);
    const isTop = index === 0;
    return `<tr>
      <td style="padding:10px;border-bottom:1px solid #eee;${isTop ? 'font-weight:bold;color:#c0231e;' : ''}">${isTop ? '&#9650; ' : ''}${cat}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;${isTop ? 'font-weight:bold;' : ''}">${formatMoney(amt)}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">${pct}%</td>
    </tr>`;
  }).join('');

  const employeeRows = summary.byEmployee.map(([emp, amt], index) => {
    const pct = ((amt / summary.totalAmount) * 100).toFixed(1);
    const isTop = index === 0;
    return `<tr>
      <td style="padding:10px;border-bottom:1px solid #eee;${isTop ? 'font-weight:bold;color:#c0231e;' : ''}">${isTop ? '&#9650; ' : ''}${emp}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;${isTop ? 'font-weight:bold;' : ''}">${formatMoney(amt)}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">${pct}%</td>
    </tr>`;
  }).join('');

  const flaggedSection = summary.flagged.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:30px;">
      <tr><td style="padding-bottom:8px;border-bottom:2px solid #c0231e;">
        <strong style="color:#c0231e;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Expenses Over ${formatMoney(FLAG_THRESHOLD)}</strong>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;border-collapse:collapse;">
      <tr style="background:#111;color:white;">
        <td style="padding:10px;font-size:12px;"><strong>Employee</strong></td>
        <td style="padding:10px;font-size:12px;"><strong>Vendor</strong></td>
        <td style="padding:10px;font-size:12px;"><strong>Category</strong></td>
        <td style="padding:10px;font-size:12px;"><strong>WO#</strong></td>
        <td style="padding:10px;font-size:12px;text-align:right;"><strong>Amount</strong></td>
      </tr>
      ${summary.flagged.map(f => `
      <tr style="background:#fff5f5;">
        <td style="padding:10px;border-bottom:1px solid #eee;">${f.employee}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;">${f.vendor}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;">${f.category}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;">${f.jobCode}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;color:#c0231e;font-weight:bold;">${formatMoney(f.amount)}</td>
      </tr>`).join('')}
    </table>` : '';

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f5;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
<tr><td align="center" style="padding:20px 0;">
<table width="800" cellpadding="0" cellspacing="0" style="background:#ffffff;max-width:800px;">

  <!-- Header -->
  <tr>
    <td style="background:#c0231e;padding:20px 24px;border-bottom:3px solid #111;">
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding-right:14px;vertical-align:middle;">
            <img src="${LOGO_URL}" width="60" height="40" alt="SLL" style="display:block;">
          </td>
          <td style="border-left:1px solid rgba(255,255,255,0.35);padding-left:14px;vertical-align:middle;">
            <div style="color:white;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;letter-spacing:1px;">${reportType.toUpperCase()} EXPENSE SUMMARY</div>
            <div style="color:rgba(255,255,255,0.75);font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;margin-top:3px;">SLL SERVICES | ${periodLabel}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Total Banner -->
  <tr>
    <td style="background:#111111;padding:24px;text-align:center;">
      <div style="color:rgba(255,255,255,0.6);font-family:Arial,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:3px;">Total Spent</div>
      <div style="color:white;font-family:Arial,sans-serif;font-size:40px;font-weight:bold;margin:8px 0;">${formatMoney(summary.totalAmount)}</div>
      <div style="color:rgba(255,255,255,0.6);font-family:Arial,sans-serif;font-size:12px;">${summary.totalCount} expense${summary.totalCount !== 1 ? 's' : ''} submitted</div>
    </td>
  </tr>

  <!-- Quick Stats -->
  <tr>
    <td style="border-bottom:1px solid #eeeeee;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="50%" style="padding:16px 20px;border-right:1px solid #eeeeee;text-align:center;">
            <div style="font-family:Arial,sans-serif;font-size:10px;color:#888888;text-transform:uppercase;letter-spacing:1px;">Top Category</div>
            <div style="font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#c0231e;margin-top:6px;">${summary.topCategory ? summary.topCategory[0] : '-'}</div>
            <div style="font-family:Arial,sans-serif;font-size:13px;color:#444444;margin-top:3px;">${summary.topCategory ? formatMoney(summary.topCategory[1]) : '-'}</div>
          </td>
          <td width="50%" style="padding:16px 20px;text-align:center;">
            <div style="font-family:Arial,sans-serif;font-size:10px;color:#888888;text-transform:uppercase;letter-spacing:1px;">Top Spender</div>
            <div style="font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#c0231e;margin-top:6px;">${summary.topEmployee ? summary.topEmployee[0] : '-'}</div>
            <div style="font-family:Arial,sans-serif;font-size:13px;color:#444444;margin-top:3px;">${summary.topEmployee ? formatMoney(summary.topEmployee[1]) : '-'}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:30px;">

      <!-- Category Breakdown -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
        <tr><td style="padding-bottom:8px;border-bottom:2px solid #c0231e;">
          <strong style="font-family:Arial,sans-serif;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#111111;">Breakdown by Category</strong>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;border-collapse:collapse;">
        <tr style="background:#111111;">
          <td style="padding:10px;color:white;font-family:Arial,sans-serif;font-size:12px;"><strong>Category</strong></td>
          <td style="padding:10px;color:white;font-family:Arial,sans-serif;font-size:12px;text-align:right;"><strong>Amount</strong></td>
          <td style="padding:10px;color:white;font-family:Arial,sans-serif;font-size:12px;text-align:right;"><strong>% of Total</strong></td>
        </tr>
        ${categoryRows}
        <tr style="background:#f5f5f5;">
          <td style="padding:10px;font-family:Arial,sans-serif;font-weight:bold;">TOTAL</td>
          <td style="padding:10px;font-family:Arial,sans-serif;font-weight:bold;text-align:right;">${formatMoney(summary.totalAmount)}</td>
          <td style="padding:10px;font-family:Arial,sans-serif;font-weight:bold;text-align:right;">100%</td>
        </tr>
      </table>

      <!-- Employee Breakdown -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:30px;margin-bottom:8px;">
        <tr><td style="padding-bottom:8px;border-bottom:2px solid #c0231e;">
          <strong style="font-family:Arial,sans-serif;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#111111;">Breakdown by Employee</strong>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;border-collapse:collapse;">
        <tr style="background:#111111;">
          <td style="padding:10px;color:white;font-family:Arial,sans-serif;font-size:12px;"><strong>Employee</strong></td>
          <td style="padding:10px;color:white;font-family:Arial,sans-serif;font-size:12px;text-align:right;"><strong>Amount</strong></td>
          <td style="padding:10px;color:white;font-family:Arial,sans-serif;font-size:12px;text-align:right;"><strong>% of Total</strong></td>
        </tr>
        ${employeeRows}
        <tr style="background:#f5f5f5;">
          <td style="padding:10px;font-family:Arial,sans-serif;font-weight:bold;">TOTAL</td>
          <td style="padding:10px;font-family:Arial,sans-serif;font-weight:bold;text-align:right;">${formatMoney(summary.totalAmount)}</td>
          <td style="padding:10px;font-family:Arial,sans-serif;font-weight:bold;text-align:right;">100%</td>
        </tr>
      </table>

      ${flaggedSection}

    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#f5f5f5;padding:20px 30px;border-top:1px solid #eeeeee;text-align:center;">
      <div style="font-family:Arial,sans-serif;font-size:11px;color:#888888;">
        Generated by SLL Services Expense Portal &nbsp;|&nbsp; ${new Date().toLocaleDateString('en-US', {weekday:'long',year:'numeric',month:'long',day:'numeric'})}
      </div>
    </td>
  </tr>

  <!-- Signature Spacer -->
  <tr><td style="padding:40px;">&nbsp;</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

async function sendEmail(html, type, periodLabel, privateKey) {
  const reportType = type === 'weekly' ? 'Weekly' : 'Monthly';
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: privateKey,
      template_params: {
        from_name: 'SLL Expense Portal',
        subject: `${reportType} Expense Summary - SLL Services - ${periodLabel}`,
        message: html
      }
    })
  });
  const result = await response.text();
  return { status: response.status, result };
}
