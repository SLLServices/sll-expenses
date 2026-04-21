const https = require("https");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { employeeName, jobCode, purpose, vendor, date, amount, category, notes } = JSON.parse(event.body);

    const payload = JSON.stringify({
      records: [
        {
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
        }
      ]
    });

    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: "api.airtable.com",
        path: "/v0/appdAkhQz46xwsS8Y/tblHtd7s9wDTRcfxf",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + process.env.AIRTABLE_API_KEY,
          "Content-Length": Buffer.byteLength(payload)
        }
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => resolve(data));
      });

      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: result
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message })
    };
  }
};
