export async function onRequestPost(context) {
  try {
    const { imageData, mediaType } = await context.request.json();

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": context.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageData }
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

If a field cannot be determined, use an empty string.`
            }
          ]
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
