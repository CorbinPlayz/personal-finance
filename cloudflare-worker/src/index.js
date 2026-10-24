const ALLOWED_ORIGIN = "https://corbinplayz.github.io";
const MODEL = "@cf/zai-org/glm-4.7-flash";
const MAX_MESSAGE_CHARS = 2000;
const MAX_CONTEXT_CHARS = 6000;

function json(data, status = 200, origin = ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Authorization, Content-Type",
      "vary": "Origin"
    }
  });
}

async function verifyFirebaseToken(token, apiKey) {
  if (!token || !apiKey) return null;
  const response = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(apiKey),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: token })
    }
  );
  if (!response.ok) return null;
  const data = await response.json();
  const user = data.users && data.users[0];
  if (!user || !user.localId || user.disabled) return null;
  return { uid: user.localId, emailVerified: Boolean(user.emailVerified) };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (origin !== ALLOWED_ORIGIN) {
      return json({ error: "Origin not allowed." }, 403, ALLOWED_ORIGIN);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": ALLOWED_ORIGIN,
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "Authorization, Content-Type",
          "access-control-max-age": "86400",
          "vary": "Origin"
        }
      });
    }
    if (request.method !== "POST") {
      return json({ error: "Use POST for AI requests." }, 405);
    }

    const auth = request.headers.get("Authorization") || "";
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (!match) return json({ error: "Please sign in to use Northstar AI." }, 401);

    let user;
    try {
      user = await verifyFirebaseToken(match[1], env.FIREBASE_API_KEY);
    } catch {
      return json({ error: "Could not verify your sign-in. Please try again." }, 401);
    }
    if (!user) return json({ error: "Your sign-in expired. Please sign in again." }, 401);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Request body must be valid JSON." }, 400);
    }
    const question = typeof body.message === "string" ? body.message.trim() : "";
    const context = typeof body.context === "string" ? body.context.slice(0, MAX_CONTEXT_CHARS) : "";
    if (!question || question.length > MAX_MESSAGE_CHARS) {
      return json({ error: "Enter a question up to 2,000 characters." }, 400);
    }

    const system = [
      "You are Northstar Guide, a helpful assistant inside a personal finance planner.",
      "Use only the financial context supplied in this request. It may be incomplete or user-entered, not verified bank data.",
      "Never claim you accessed a bank, retailer, or live price feed.",
      "Do not invent balances, income, expenses, prices, or calculations. If a number is missing, ask or explain the limitation.",
      "Offer clear, practical budgeting and savings guidance, not guaranteed investment, tax, or legal advice.",
      "Never ask for passwords, full card numbers, bank login credentials, or other secrets.",
      "Do not make changes to accounts, transactions, goals, budgets, or purchases. You may suggest changes, but the user must perform and approve them.",
      "Keep answers concise, friendly, and easy to understand."
    ].join(" ");

    const messages = [
      { role: "system", content: system + (context ? "\n\nCurrent Northstar context (user-provided app data):\n" + context : "") },
      { role: "user", content: question }
    ];

    try {
      const result = await env.AI.run(MODEL, {
        messages,
        max_tokens: 500,
        temperature: 0.4
      });
      const answer = result && (result.response || result.result && result.result.response);
      if (typeof answer !== "string" || !answer.trim()) {
        return json({ error: "The AI returned an empty response. Please try again." }, 502);
      }
      return json({ answer: answer.trim(), model: MODEL });
    } catch (error) {
      const message = String(error && error.message || "");
      if (/neuron|quota|limit|billing|paid plan|4035/i.test(message)) {
        return json({ error: "Northstar AI has reached its free daily limit or the model is unavailable. Try again later." }, 429);
      }
      return json({ error: "Northstar AI is temporarily unavailable. Please try again in a moment." }, 502);
    }
  }
};
