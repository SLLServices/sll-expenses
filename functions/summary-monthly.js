const AIRTABLE_BASE_ID = 'appdAkhQz46xwsS8Y';
const AIRTABLE_TABLE_ID = 'tblHtd7s9wDTRcfxf';
const EMAILJS_SERVICE_ID = 'service_e1lex4v';
const EMAILJS_TEMPLATE_ID = 'template_gf34sm8';
const EMAILJS_PUBLIC_KEY = 'fBr3U4xpS_U3gH4og';
const LOGO_URL = 'https://raw.githubusercontent.com/SLLServices/sll-expenses/main/sll-logo.png';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const debug = url.searchParams.get('debug') === 'true';

  try {
    const { periodLabel } = getMonthDateRange();
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
    const html = buildEmailHTML(summary, periodLabel);
    const emailResult = await sendEmail(html, periodLabel, privateKey);

    return new Response(`Records: ${records.length}. Email status: ${emailResult.status}. Result: ${emailResult.result}`, { status: 200 });
  } catch (err) {
    return new Response(`Error: ${err.message}\n${err.stack}`, { status: 500 });
  }
}

function getMonthDateRange() {
  const now = new Date();
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastOfPrevMonth = new Date(firstOfThisMonth);
  lastOfPrevMonth.setDate(0);
  const firstOfPrevMonth = new Date(lastOfPrevMonth.getFullYear(), lastOfPrevMonth.getMonth(), 1);
  const startDate = firstOfPrevMonth.toISOString().split('T')[0];
  const endDate = lastOfPrevMonth.toISOString().split('T')[0];
  const monthName = firstOfPrevMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  return { startDate, endDate, periodLabel: monthName };
}

function buildSummary(records) {
  let totalAmount = 0;
  const byCategory = {};
  const byEmployee = {};
  const byPurpose = {};

  records.forEach(record => {
    const amount = parseFloat(record['Amount']) || 0;
    const category = record['Category'] || 'Uncategorized';
    const employee = record['Employee Name'] || 'Unknown';
    const purpose = record['Purpose'] || 'Uncategorized';

    totalAmount += amount;

    if (!byCategory[category]) byCategory[category] = { total: 0, count: 0 };
    byCategory[category].total += amount;
    byCategory[category].count += 1;

    if (!byEmployee[employee]) byEmployee[employee] = { total: 0, count: 0 };
    byEmployee[employee].total += amount;
    byEmployee[employee].count += 1;

    if (!byPurpose[purpose]) byPurpose[purpose] = { total: 0, count: 0 };
    byPurpose[purpose].total += amount;
    byPurpose[purpose].count += 1;
  });

  const sortedCategories = Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
  const sortedEmployees = Object.entries(byEmployee).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
  const sortedPurposes = Object.entries(byPurpose).sort((a, b) => b[1].total - a[1].total).slice(0, 5);

  return {
    totalAmount,
    totalCount: records.length,
    topCategories: sortedCategories,
    topEmployees: sortedEmployees,
    topPurposes: sortedPurposes,
    topCategory: sortedCategories[0] || null,
    topEmployee: sortedEmployees[0] || null
  };
}

function formatMoney(amount) {
  return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function buildSection(title, rows) {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      <tr><td style="padding-bottom:8px;border-bottom:2px solid #c0231e;">
        <strong style="font-family:Arial,sans-serif;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#111111;">${title}</strong>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;border-collapse:collapse;">
      <tr style="background:#111111;">
        <td style="padding:10px;color:white;font-family:Arial,sans-serif;font-size:12px;"><strong>Name</strong></td>
        <td style="padding:10px;color:white;font-family:Arial,sans-serif;font-size:12px;text-align:center;"><strong>Submissions</strong></td>
        <td style="padding:10px;color:white;font-family:Arial,sans-serif;font-size:12px;text-align:right;"><strong>Amount</strong></td>
        <td style="padding:10px;color:white;font-family:Arial,sans-serif;font-size:12px;text-align:right;"><strong>% of Total</strong></td>
      </tr>
      ${rows}
    </table>`;
}

function buildEmailHTML(summary, periodLabel) {

  const categoryRows = summary.topCategories.map(([name, data], index) => {
    const pct = ((data.total / summary.totalAmount) * 100).toFixed(1);
    const isTop = index === 0;
    return `<tr>
      <td style="padding:10px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;${isTop ? 'font-weight:bold;color:#c0231e;' : ''}">${isTop ? '&#9650; ' : ''}${name}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;text-align:center;">${data.count}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;text-align:right;${isTop ? 'font-weight:bold;' : ''}">${formatMoney(data.total)}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;text-align:right;">${pct}%</td>
    </tr>`;
  }).join('');

  const purposeRows = summary.topPurposes.map(([name, data], index) => {
    const pct = ((data.total / summary.totalAmount) * 100).toFixed(1);
    const isTop = index === 0;
    return `<tr>
      <td style="padding:10px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;${isTop ? 'font-weight:bold;color:#c0231e;' : ''}">${isTop ? '&#9650; ' : ''}${name}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;text-align:center;">${data.count}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;text-align:right;${isTop ? 'font-weight:bold;' : ''}">${formatMoney(data.total)}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;text-align:right;">${pct}%</td>
    </tr>`;
  }).join('');

  const employeeRows = summary.topEmployees.map(([name, data], index) => {
    const pct = ((data.total / summary.totalAmount) * 100).toFixed(1);
    const isTop = index === 0;
    return `<tr>
      <td style="padding:10px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;${isTop ? 'font-weight:bold;color:#c0231e;' : ''}">${isTop ? '&#9650; ' : ''}${name}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;text-align:center;">${data.count}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;text-align:right;${isTop ? 'font-weight:bold;' : ''}">${formatMoney(data.total)}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;text-align:right;">${pct}%</td>
    </tr>`;
  }).join('');

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
            <div style="color:white;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;letter-spacing:1px;">MONTHLY EXPENSE SUMMARY</div>
            <div style="color:white;font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;margin-top:3px;">SLL SERVICES | ${periodLabel}</div>
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
            <div style="font-family:Arial,sans-serif;font-size:13px;color:#444444;margin-top:3px;">${summary.topCategory ? formatMoney(summary.topCategory[1].total) : '-'}</div>
          </td>
          <td width="50%" style="padding:16px 20px;text-align:center;">
            <div style="font-family:Arial,sans-serif;font-size:10px;color:#888888;text-transform:uppercase;letter-spacing:1px;">Top Spender</div>
            <div style="font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#c0231e;margin-top:6px;">${summary.topEmployee ? summary.topEmployee[0] : '-'}</div>
            <div style="font-family:Arial,sans-serif;font-size:13px;color:#444444;margin-top:3px;">${summary.topEmployee ? formatMoney(summary.topEmployee[1].total) : '-'}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:30px;">

      <!-- Top 5 Categories -->
      ${buildSection('Top 5 Categories', categoryRows)}

      <!-- Top 5 Purpose -->
      <div style="margin-top:30px;">
        ${buildSection('Top 5 Purpose', purposeRows)}
      </div>

      <!-- Top 5 Spenders -->
      <div style="margin-top:30px;">
        ${buildSection('Top 5 Spenders', employeeRows)}
      </div>

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

async function sendEmail(html, periodLabel, privateKey) {
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
        subject: `Monthly Expense Summary - SLL Services - ${periodLabel}`,
        message: html
      }
    })
  });
  const result = await response.text();
  return { status: response.status, result };
}
