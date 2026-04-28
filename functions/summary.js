// SLL Services - Expense Summary Function
// Deploy as functions/summary.js in Cloudflare Pages

const AIRTABLE_BASE_ID = 'appdAkhQz46xwsS8Y';
const AIRTABLE_TABLE_ID = 'tblHtd7s9wDTRcfxf';
const RECIPIENT_EMAIL = 'jflorentine@sllservicesllc.com';
const FLAG_THRESHOLD = 1500;
const EMAILJS_SERVICE_ID = 'service_e1lex4v';
const EMAILJS_TEMPLATE_ID = 'template_plzb7ak';
const EMAILJS_PUBLIC_KEY = 'fBr3U4xpS_U3gH4og';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const type = url.searchParams.get('type') || 'weekly';

  try {
    const { startDate, endDate, periodLabel } = getDateRange(type);
    const records = await fetchAirtableRecords(context.env.AIRTABLE_API_KEY, startDate, endDate);

    if (records.length === 0) {
      return new Response(`No records found for ${periodLabel}`, { status: 200 });
    }

    const summary = buildSummary(records);
    const html = buildEmailHTML(summary, periodLabel, type);
    await sendEmail(html, type, periodLabel);

    return new Response(`Summary email sent successfully for ${periodLabel}`, { status: 200 });
  } catch (err) {
    return new Response(`Error: ${err.message}`, { status: 500 });
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

async function fetchAirtableRecords(apiKey, startDate, endDate) {
  const formula = encodeURIComponent(
    `AND({Date} >= '${startDate}', {Date} <= '${endDate}')`
  );
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?maxRecords=1000`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await response.json();
  return (data.records || []).map(r => r.fields);
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

  return { totalAmount, totalCount: records.length, byCategory: sortedCategories, byEmployee: sortedEmployees, flagged };
}

function formatMoney(amount) {
  return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function buildEmailHTML(summary, periodLabel, type) {
  const reportType = type === 'weekly' ? 'Weekly' : 'Monthly';

  const categoryRows = summary.byCategory.map(([cat, amt]) => {
    const pct = ((amt / summary.totalAmount) * 100).toFixed(1);
    return `<tr>
      <td style="padding:10px;border-bottom:1px solid #eee;">${cat}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">${formatMoney(amt)}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">${pct}%</td>
    </tr>`;
  }).join('');

  const employeeRows = summary.byEmployee.map(([emp, amt]) => {
    const pct = ((amt / summary.totalAmount) * 100).toFixed(1);
    return `<tr>
      <td style="padding:10px;border-bottom:1px solid #eee;">${emp}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">${formatMoney(amt)}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">${pct}%</td>
    </tr>`;
  }).join('');

  const flaggedSection = summary.flagged.length > 0 ? `
    <div style="margin-top:30px;">
      <h3 style="font-family:Arial,sans-serif;color:#c0231e;border-bottom:2px solid #c0231e;padding-bottom:8px;">
        ⚠️ Expenses Over ${formatMoney(FLAG_THRESHOLD)}
      </h3>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:#111;color:white;">
          <th style="padding:10px;text-align:left;">Employee</th>
          <th style="padding:10px;text-align:left;">Vendor</th>
          <th style="padding:10px;text-align:left;">Category</th>
          <th style="padding:10px;text-align:left;">Purpose</th>
          <th style="padding:10px;text-align:left;">WO#</th>
          <th style="padding:10px;text-align:right;">Amount</th>
        </tr>
        ${summary.flagged.map(f => `
        <tr style="background:#fff5f5;">
          <td style="padding:10px;border-bottom:1px solid #eee;">${f.employee}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;">${f.vendor}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;">${f.category}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;">${f.purpose}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;">${f.jobCode}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;color:#c0231e;font-weight:bold;">${formatMoney(f.amount)}</td>
        </tr>`).join('')}
      </table>
    </div>` : '';

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f5;">
<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;background:white;">
  <div style="background:#c0231e;padding:30px;color:white;">
    <h1 style="margin:0;font-size:24px;">${reportType} Expense Summary</h1>
    <p style="margin:8px 0 0;font-size:14px;opacity:0.9;">SLL Services &nbsp;|&nbsp; ${periodLabel}</p>
  </div>
  <div style="background:#111;padding:20px;text-align:center;color:white;">
    <p style="margin:0;font-size:14px;opacity:0.7;text-transform:uppercase;letter-spacing:2px;">Total Spent</p>
    <p style="margin:8px 0 0;font-size:36px;font-weight:bold;">${formatMoney(summary.totalAmount)}</p>
    <p style="margin:8px 0 0;font-size:13px;opacity:0.7;">${summary.totalCount} expense${summary.totalCount !== 1 ? 's' : ''} submitted</p>
  </div>
  <div style="padding:30px;">
    <h3 style="color:#111;border-bottom:2px solid #c0231e;padding-bottom:8px;">Breakdown by Category</h3>
    <table style="width:100%;border-collapse:collapse;">
      <tr style="background:#111;color:white;">
        <th style="padding:10px;text-align:left;">Category</th>
        <th style="padding:10px;text-align:right;">Amount</th>
        <th style="padding:10px;text-align:right;">% of Total</th>
      </tr>
      ${categoryRows}
      <tr style="background:#f5f5f5;font-weight:bold;">
        <td style="padding:10px;">TOTAL</td>
        <td style="padding:10px;text-align:right;">${formatMoney(summary.totalAmount)}</td>
        <td style="padding:10px;text-align:right;">100%</td>
      </tr>
    </table>
    <h3 style="color:#111;border-bottom:2px solid #c0231e;padding-bottom:8px;margin-top:30px;">Breakdown by Employee</h3>
    <table style="width:100%;border-collapse:collapse;">
      <tr style="background:#111;color:white;">
        <th style="padding:10px;text-align:left;">Employee</th>
        <th style="padding:10px;text-align:right;">Amount</th>
        <th style="padding:10px;text-align:right;">% of Total</th>
      </tr>
      ${employeeRows}
      <tr style="background:#f5f5f5;font-weight:bold;">
        <td style="padding:10px;">TOTAL</td>
        <td style="padding:10px;text-align:right;">${formatMoney(summary.totalAmount)}</td>
        <td style="padding:10px;text-align:right;">100%</td>
      </tr>
    </table>
    ${flaggedSection}
  </div>
  <div style="background:#f5f5f5;padding:15px;text-align:center;font-size:11px;color:#888;">
    Generated by SLL Services Expense Portal &nbsp;|&nbsp; ${new Date().toLocaleDateString('en-US', {weekday:'long',year:'numeric',month:'long',day:'numeric'})}
  </div>
</div>
</body>
</html>`;
}

async function sendEmail(html, type, periodLabel) {
  const reportType = type === 'weekly' ? 'Weekly' : 'Monthly';
  await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      template_params: {
        from_name: 'SLL Expense Portal',
        subject: `${reportType} Expense Summary - SLL Services - ${periodLabel}`,
        message: html
      }
    })
  });
}
