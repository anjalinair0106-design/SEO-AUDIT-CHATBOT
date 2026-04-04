import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `You are an expert SEO auditor. When given a URL and its page content (HTML/text), you analyze it thoroughly and return a JSON audit report.

You MUST respond with ONLY a valid JSON object in this exact format:
{
  "summary": "2-3 sentence overview of the page's SEO health",
  "score": <number 0-100>,
  "grade": "<A/B/C/D/F>",
  "issues": [
    {
      "category": "<On-Page SEO | Content Quality>",
      "severity": "<critical | warning | info>",
      "title": "<short issue title>",
      "description": "<what the issue is>",
      "fix": "<how to fix it>"
    }
  ],
  "positives": ["<thing done well>"],
  "onPage": {
    "titleTag": "<extracted title or 'Missing'>",
    "titleLength": 0,
    "metaDescription": "<extracted meta or 'Missing'>",
    "metaLength": 0,
    "h1Count": 0,
    "h1Text": "<first H1 text or 'Missing'>",
    "h2Count": 0,
    "h3Count": 0,
    "canonicalTag": "<url or 'Missing'>",
    "robots": "<content or 'Missing'>"
  },
  "content": {
    "wordCount": 0,
    "readabilityScore": "<Easy | Moderate | Difficult>",
    "imagesWithoutAlt": 0,
    "totalImages": 0,
    "keywordDensityNote": "<observation about keyword usage>",
    "contentIssues": ["<issue>"]
  },
  "chatMessage": "<A friendly conversational message summarizing the top 3 issues and what to do first. Use emojis sparingly.>"
}

Be thorough, specific, and actionable. Base everything on the actual page content provided.`;

async function fetchPageContent(url) {
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    const data = await res.json();
    return data.contents || "";
  } catch {
    return "";
  }
}

function extractPageInfo(html) {
  if (!html) return { text: "", html: "" };
  const truncated = html.slice(0, 15000);
  const text = truncated.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000);
  return { text, html: truncated };
}

async function runAudit(url, pageContent) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Please audit this URL: ${url}\n\nPage HTML (truncated):\n${pageContent.html}\n\nExtracted text:\n${pageContent.text}`
        }
      ]
    })
  });

  const data = await response.json();
  const raw = data.content?.[0]?.text || "{}";

  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Invalid response format");
  }
}

async function askFollowUp(url, auditReport, question, history) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: "You are a helpful SEO expert. Answer questions about the audit results concisely and practically. Use plain text, no markdown.",
      messages: [
        {
          role: "user",
          content: `I ran an SEO audit on ${url}. Here are the results:\n${JSON.stringify(auditReport, null, 2)}\n\nUser question: ${question}`
        },
        ...history
          .slice(1)
          .filter(m => m.role !== "system")
          .map(m => ({ role: m.role === "bot" ? "assistant" : "user", content: m.content })),
        { role: "user", content: question }
      ]
    })
  });

  const data = await response.json();
  return data.content?.[0]?.text || "Sorry, I could not process that.";
}

const severityConfig = {
  critical: { color: "#ff5d5d", bg: "#ff5d5d14", icon: "x", label: "Critical" },
  warning: { color: "#f59e0b", bg: "#f59e0b18", icon: "!", label: "Warning" },
  info: { color: "#22d3ee", bg: "#22d3ee16", icon: "i", label: "Info" }
};

const gradeColor = { A: "#16a34a", B: "#65a30d", C: "#f59e0b", D: "#f97316", F: "#ef4444" };

export default function SEOAuditChatbot() {
  const [url, setUrl] = useState("");
  const [activeTab, setActiveTab] = useState("chat");
  const [messages, setMessages] = useState([
    { role: "bot", content: "Hey! I am your SEO Audit assistant. Paste any URL above and I will analyze it for on-page SEO issues, content quality, readability, and more. What would you like to audit today?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [auditReport, setAuditReport] = useState(null);
  const [auditUrl, setAuditUrl] = useState("");
  const [loadingMsg, setLoadingMsg] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const loadingSteps = [
    "Fetching page content...",
    "Analyzing on-page SEO signals...",
    "Evaluating content quality...",
    "Generating prioritized recommendations..."
  ];

  const quickPrompts = [
    "What should I fix first for fastest impact?",
    "Write an improved title tag and meta description.",
    "Give me a 7-day SEO action plan from this audit."
  ];

  async function handleAudit() {
    if (!url.trim()) return;
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith("http")) cleanUrl = "https://" + cleanUrl;

    setLoading(true);
    setAuditReport(null);
    setMessages(prev => [...prev, { role: "user", content: "Audit this URL: " + cleanUrl }]);

    let step = 0;
    setLoadingMsg(loadingSteps[0]);
    const interval = setInterval(() => {
      step = (step + 1) % loadingSteps.length;
      setLoadingMsg(loadingSteps[step]);
    }, 1800);

    try {
      const html = await fetchPageContent(cleanUrl);
      const pageContent = extractPageInfo(html);
      const report = await runAudit(cleanUrl, pageContent);
      setAuditReport(report);
      setAuditUrl(cleanUrl);
      setMessages(prev => [
        ...prev,
        { role: "bot", content: report.chatMessage || "Audit complete. Switch to the Report tab for full details." }
      ]);
      setActiveTab("chat");
    } catch {
      setMessages(prev => [
        ...prev,
        { role: "bot", content: "I had trouble auditing that URL. Make sure it is a valid public URL and try again." }
      ]);
    } finally {
      clearInterval(interval);
      setLoading(false);
      setLoadingMsg("");
    }
  }

  async function handleSend(forcedQuestion) {
    const question = (forcedQuestion ?? input).trim();
    if (!question || loading) return;

    setInput("");
    setMessages(prev => [...prev, { role: "user", content: question }]);
    setLoading(true);
    setLoadingMsg("Thinking...");

    try {
      if (auditReport) {
        const answer = await askFollowUp(auditUrl, auditReport, question, messages);
        setMessages(prev => [...prev, { role: "bot", content: answer }]);
      } else {
        setMessages(prev => [
          ...prev,
          { role: "bot", content: "Please run an audit first by entering a URL above. Then I can answer questions about the results." }
        ]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "bot", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  }

  const criticalCount = auditReport?.issues?.filter(i => i.severity === "critical").length || 0;
  const warningCount = auditReport?.issues?.filter(i => i.severity === "warning").length || 0;

  return (
    <div style={{ minHeight: "100vh", background: "#071019", color: "#dbe7f1", fontFamily: "'DM Sans', 'Segoe UI', sans-serif", display: "flex", flexDirection: "column", position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1d3d53; border-radius: 999px; }
        .url-input::placeholder, .chat-input::placeholder { color: #5f7587; }
        .url-input:focus { outline: none; border-color: #22d3ee; box-shadow: 0 0 0 3px #22d3ee25; }
        .chat-input:focus { outline: none; }
        .tab-btn, .audit-btn, .send-btn, .chip, .issue-card { transition: all .2s ease; }
        .tab-btn:hover { background: #0f2333; color: #dcf2ff; }
        .audit-btn:hover, .send-btn:hover { transform: translateY(-1px); filter: brightness(1.06); }
        .chip:hover { border-color: #2b698a; color: #b7e6ff; }
        .issue-card:hover { transform: translateX(2px); }
        .msg-appear { animation: fadeSlide 0.28s ease; }
        @keyframes fadeSlide { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: translateY(0); } }
        .pulse { animation: pulse 1.4s infinite; }
        @keyframes pulse { 0%,100% { opacity: .45; } 50% { opacity: 1; } }
        .score-ring { transform: rotate(-90deg); transform-origin: center; }
        .surface { background: linear-gradient(180deg, #0c1824 0%, #0a1621 100%); border: 1px solid #15344a; box-shadow: inset 0 1px 0 #ffffff10; }
        .glow::before, .glow::after { content: ""; position: absolute; border-radius: 50%; pointer-events: none; }
        .glow::before { width: 580px; height: 580px; background: radial-gradient(circle, #22d3ee23 0%, #22d3ee00 72%); top: -260px; left: -220px; }
        .glow::after { width: 520px; height: 520px; background: radial-gradient(circle, #f59e0b1c 0%, #f59e0b00 74%); right: -220px; bottom: -240px; }
        @media (max-width: 768px) {
          .stack-mobile { flex-direction: column; align-items: stretch !important; }
          .chat-bubble { max-width: 88% !important; }
          .stats-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div className="glow" style={{ position: "absolute", inset: 0, overflow: "hidden" }} />

      <div style={{ padding: "20px 24px 0", borderBottom: "1px solid #133349", position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div className="stack-mobile" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, #22d3ee, #0ea5e9)", color: "#042436", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>
              SA
            </div>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 21, fontWeight: 800, letterSpacing: "-0.5px" }}>
              SEO<span style={{ color: "#22d3ee" }}>Audit</span>
            </span>
            {auditReport && (
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#95b3c6", background: "#0b1b29", padding: "3px 10px", borderRadius: 20, border: "1px solid #163a51" }}>
                {auditUrl.replace(/^https?:\/\//, "").slice(0, 40)}
              </span>
            )}
          </div>

          <div className="stack-mobile" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input
              className="url-input"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAudit()}
              placeholder="https://example.com"
              style={{ flex: 1, background: "#0a1622", border: "1px solid #1c4259", borderRadius: 12, padding: "12px 14px", color: "#e5f2fb", fontSize: 14, fontFamily: "inherit" }}
            />
            <button
              className="audit-btn"
              onClick={handleAudit}
              disabled={loading}
              style={{ background: loading ? "#284355" : "linear-gradient(135deg, #22d3ee, #0ea5e9)", color: "#032234", border: "none", borderRadius: 12, padding: "10px 20px", fontSize: 14, fontWeight: 700, fontFamily: "inherit", whiteSpace: "nowrap" }}
            >
              {loading ? "Auditing..." : "Run Audit"}
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, paddingBottom: 10 }}>
            {["chat", "report"].map(tab => (
              <button
                key={tab}
                className="tab-btn"
                onClick={() => setActiveTab(tab)}
                style={{
                  background: activeTab === tab ? "#0d2535" : "transparent",
                  border: activeTab === tab ? "1px solid #1a4760" : "1px solid transparent",
                  padding: "8px 14px",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  color: activeTab === tab ? "#84e8fb" : "#718ea2",
                  borderRadius: 999
                }}
              >
                {tab === "chat" ? "Chat" : "Report"}
                {tab === "report" && auditReport && criticalCount > 0 && (
                  <span style={{ marginLeft: 6, background: "#ef4444", color: "#fff", fontSize: 11, padding: "1px 6px", borderRadius: 10 }}>
                    {criticalCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, maxWidth: 860, width: "100%", margin: "0 auto", padding: "0 24px 24px", display: "flex", flexDirection: "column", minHeight: 0, position: "relative", zIndex: 1 }}>
        {activeTab === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingTop: 20, gap: 14 }}>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingRight: 4 }}>
              {messages.map((msg, i) => (
                <div key={i} className="msg-appear" style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  {msg.role === "bot" && (
                    <div style={{ width: 28, height: 28, background: "linear-gradient(135deg, #22d3ee, #0ea5e9)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#042436", flexShrink: 0, marginRight: 8, marginTop: 2 }}>
                      SA
                    </div>
                  )}
                  <div
                    className="chat-bubble surface"
                    style={{
                      maxWidth: "74%",
                      padding: "10px 14px",
                      borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                      background: msg.role === "user" ? "linear-gradient(135deg, #22d3ee, #0ea5e9)" : "linear-gradient(180deg, #0d1a25 0%, #0a1620 100%)",
                      border: msg.role === "user" ? "none" : "1px solid #15344a",
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: msg.role === "user" ? "#05293d" : "#e8f4fc"
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="msg-appear" style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ width: 28, height: 28, background: "linear-gradient(135deg, #22d3ee, #0ea5e9)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#042436", flexShrink: 0 }}>
                    SA
                  </div>
                  <div className="surface" style={{ borderRadius: "14px 14px 14px 4px", padding: "10px 14px" }}>
                    <div style={{ fontSize: 13, color: "#7be4f8", marginBottom: 4 }} className="pulse">
                      {loadingMsg}
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[0, 1, 2].map(idx => (
                        <div
                          key={idx}
                          style={{ width: 6, height: 6, borderRadius: "50%", background: "#22d3ee", animation: `pulse 1.2s ${idx * 0.2}s infinite` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {auditReport && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {quickPrompts.map(prompt => (
                  <button
                    key={prompt}
                    className="chip"
                    onClick={() => handleSend(prompt)}
                    style={{ background: "#0d2535", border: "1px solid #1a4760", color: "#95cbe6", borderRadius: 999, padding: "6px 11px", fontSize: 12, cursor: "pointer" }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            <div className="surface" style={{ display: "flex", gap: 8, borderRadius: 14, padding: "8px 8px 8px 14px", alignItems: "center" }}>
              <input
                className="chat-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSend()}
                placeholder={auditReport ? "Ask about the audit results..." : "Run an audit first, then ask me anything..."}
                style={{ flex: 1, background: "none", border: "none", color: "#e5f2fb", fontSize: 14, fontFamily: "inherit" }}
              />
              <button
                className="send-btn"
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                style={{
                  background: input.trim() && !loading ? "linear-gradient(135deg, #22d3ee, #0ea5e9)" : "#1b384a",
                  color: input.trim() && !loading ? "#042436" : "#6a879a",
                  border: "none",
                  borderRadius: 10,
                  width: 38,
                  height: 38,
                  fontSize: 18,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                {"->"}
              </button>
            </div>
          </div>
        )}

        {activeTab === "report" && (
          <div style={{ paddingTop: 20, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
            {!auditReport ? (
              <div className="surface" style={{ textAlign: "center", padding: "60px 20px", color: "#6f8fa4", borderRadius: 16 }}>
                <div style={{ fontSize: 28, marginBottom: 12, color: "#22d3ee", fontFamily: "'Syne', sans-serif" }}>REPORT</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: "#d7eaf8" }}>No audit yet</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>Enter a URL and run an audit to see the full report here.</div>
              </div>
            ) : (
              <>
                <div className="surface" style={{ borderRadius: 16, padding: 24, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ position: "relative", width: 90, height: 90, flexShrink: 0 }}>
                    <svg width="90" height="90" viewBox="0 0 90 90">
                      <circle cx="45" cy="45" r="38" fill="none" stroke="#1a3448" strokeWidth="7" />
                      <circle
                        cx="45"
                        cy="45"
                        r="38"
                        fill="none"
                        stroke={gradeColor[auditReport.grade] || "#22d3ee"}
                        strokeWidth="7"
                        strokeLinecap="round"
                        strokeDasharray={`${(auditReport.score / 100) * 238.76} 238.76`}
                        className="score-ring"
                      />
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Syne', sans-serif", color: gradeColor[auditReport.grade] }}>
                        {auditReport.score}
                      </span>
                      <span style={{ fontSize: 11, color: "#7390a3" }}>/ 100</span>
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, color: gradeColor[auditReport.grade] }}>
                        Grade {auditReport.grade}
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        {criticalCount > 0 && (
                          <span style={{ background: "#ef44441f", color: "#ef4444", fontSize: 12, padding: "2px 8px", borderRadius: 6 }}>
                            {criticalCount} critical
                          </span>
                        )}
                        {warningCount > 0 && (
                          <span style={{ background: "#f59e0b22", color: "#f59e0b", fontSize: 12, padding: "2px 8px", borderRadius: 6 }}>
                            {warningCount} warnings
                          </span>
                        )}
                      </div>
                    </div>
                    <p style={{ fontSize: 14, color: "#9cb8ca", lineHeight: 1.6 }}>{auditReport.summary}</p>
                  </div>
                </div>

                <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div className="surface" style={{ borderRadius: 14, padding: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#22d3ee", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>On-Page SEO</div>
                    {auditReport.onPage &&
                      Object.entries({
                        "Title Tag": `${(auditReport.onPage.titleTag || "Missing").slice(0, 35)}${(auditReport.onPage.titleTag || "").length > 35 ? "..." : ""} (${auditReport.onPage.titleLength || 0} chars)`,
                        "Meta Desc": auditReport.onPage.metaDescription === "Missing" ? "Missing" : `${auditReport.onPage.metaLength || 0} chars`,
                        "H1 Tag": (auditReport.onPage.h1Text || "Missing").slice(0, 30),
                        "H2 Count": auditReport.onPage.h2Count || 0,
                        Canonical: auditReport.onPage.canonicalTag === "Missing" ? "Missing" : "Present",
                        Robots: auditReport.onPage.robots || "Missing"
                      }).map(([k, v]) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #163348", gap: 8 }}>
                          <span style={{ fontSize: 13, color: "#6f8ea3" }}>{k}</span>
                          <span style={{ fontSize: 13, color: "#d0e7f6", textAlign: "right", maxWidth: "55%" }}>{String(v)}</span>
                        </div>
                      ))}
                  </div>

                  <div className="surface" style={{ borderRadius: 14, padding: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#f59e0b", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>Content Quality</div>
                    {auditReport.content &&
                      Object.entries({
                        "Word Count": auditReport.content.wordCount || 0,
                        Readability: auditReport.content.readabilityScore || "N/A",
                        Images: auditReport.content.totalImages || 0,
                        "Missing Alt": auditReport.content.imagesWithoutAlt || 0,
                        Keywords: auditReport.content.keywordDensityNote || "N/A"
                      }).map(([k, v]) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #163348", gap: 8 }}>
                          <span style={{ fontSize: 13, color: "#6f8ea3" }}>{k}</span>
                          <span style={{ fontSize: 13, color: "#d0e7f6", textAlign: "right", maxWidth: "55%" }}>{String(v)}</span>
                        </div>
                      ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#89a8bc", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>
                    Issues Found
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {auditReport.issues
                      ?.sort((a, b) => ({ critical: 0, warning: 1, info: 2 }[a.severity] - { critical: 0, warning: 1, info: 2 }[b.severity]))
                      .map((issue, i) => {
                        const cfg = severityConfig[issue.severity] || severityConfig.info;
                        return (
                          <div key={i} className="issue-card surface" style={{ background: cfg.bg, border: `1px solid ${cfg.color}45`, borderLeft: `3px solid ${cfg.color}`, borderRadius: 10, padding: "12px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{ color: cfg.color, fontSize: 13, fontWeight: 700 }}>{cfg.icon}</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: "#e8f4fc" }}>{issue.title}</span>
                              <span style={{ marginLeft: "auto", fontSize: 11, color: cfg.color, background: `${cfg.color}20`, padding: "2px 7px", borderRadius: 5 }}>
                                {issue.category}
                              </span>
                            </div>
                            <p style={{ fontSize: 13, color: "#98b6c8", marginBottom: 6, lineHeight: 1.5 }}>{issue.description}</p>
                            <p style={{ fontSize: 12, color: "#67e8f9", lineHeight: 1.5 }}>Fix: {issue.fix}</p>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {auditReport.positives?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#89a8bc", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>
                      What is Working Well
                    </div>
                    <div className="surface" style={{ background: "#0d1f1a", border: "1px solid #2ed57335", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                      {auditReport.positives.map((p, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: "#a6d5bf", lineHeight: 1.5 }}>
                          <span style={{ color: "#2ed573" }}>+</span> {p}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
