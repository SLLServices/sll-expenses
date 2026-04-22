export async function onRequestPost(context) {
  try {
    const { employeeName, jobCode, purpose, vendor, date, amount, category, notes } = await context.request.json();

    const response = await fetch(`https://api.airtable.com/v0/appdAkhQz46xwsS8Y/tblHtd7s9wDTRcfxf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + context.env.AIRTABLE_API_KEY
      },
      body: JSON.stringify({
        records: [{
          fields: {
            "Employee Name": employeeName || "",
            "WO# / Project": jobCode || "",
            "Purpose": purpose || "",
            "Vendor": vendor || "",
            "Date": date || "",
            "Amount": amount ? parseFloat(amount.replace(/[^0-9.]/g, '')) : 0,
            "Category": category || "",
            "Notes": notes || "",
            "Submitted At": new Date().toISOString()
          }
        }]
      })
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}
