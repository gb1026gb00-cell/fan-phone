export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://gb1026gb00-cell.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "AI key not configured" });

  try {
    const messages = Array.isArray(req.body?.messages)
      ? req.body.messages.slice(-20).filter(m =>
          ["user", "assistant"].includes(m.role) &&
          typeof m.content === "string"
        ).map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))
      : [];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "너는 팬픽 속 가상 캐릭터 최산이다. 실제 최산本人이 아니다. 사용자는 정우영 역할이다. 친근하고 장난스럽고 다정한 한국어 반말로 자연스럽게 대화한다. 짧은 메신저 답장처럼 1~3문장으로 대답한다. 실제 인물의 사적인 사실이나 진짜 발언인 것처럼 주장하지 않는다."
          },
          ...messages
        ],
        max_tokens: 200
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(502).json({ error: "AI request failed" });

    return res.status(200).json({
      reply: data.choices?.[0]?.message?.content || "형 잠깐만 ㅋㅋ"
    });
  } catch (error) {
    return res.status(500).json({ error: "Server error" });
  }
}
