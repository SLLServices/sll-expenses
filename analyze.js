exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { imageData, mediaType } = JSON.parse(event.body);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: imageData },
              },
              {
                type: "text",
                text: `Analyze this receipt or purchase screenshot. Return ONLY a raw JSON object — no markdown, no backticks, no explanation.

Fields:
{
  "vendor": "store or vendor name",
  "date": "YYYY-MM-DD if possible, else empty string",
  "total": "total amount with $ sign, e.g. $47.83",
  "category": "pick the single best match from this exact list: Job Supplies, Fuel, Repairs & Maintenance (Truck), Hotels, Travel, Meals & Entertainment, Tools & Equipment, Safety & PPE, Parking & Tolls, Shipping & Freight, Phone / Data, Other"
}

If a field cannot be determined, use an empty string.`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
