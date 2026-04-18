import { useState, useRef, useEffect } from "react";

function getApiErrorMessage(data, fallback) {
  return (
    (typeof data?.error === "string" ? data.error : null) ||
    data?.error?.message ||
    data?.message ||
    fallback
  );
}

async function parseJsonResponse(response, fallbackMessage) {
  const raw = await response.text();

  if (!raw.trim()) {
    throw new Error(fallbackMessage);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(fallbackMessage);
  }
}

async function runAudit(url) {
  const response = await fetch("/api/audit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      url
    })
  });

  const data = await parseJsonResponse(response, "The audit service returned an empty or invalid response.");
  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, "Audit request failed"));
  }
  return data;
}

async function askFollowUp(url, auditReport, question, history, auditId) {
  const conversationHistory = history
    .slice(1)
    .filter(m => m.role === "user" || m.role === "bot")
    .map(m => ({
      role: m.role === "bot" ? "assistant" : "user",
      content: m.content
    }));

  const response = await fetch("/api/follow-up", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      auditId,
      url,
      auditReport,
      question,
      history: conversationHistory
    })
  });

  const data = await parseJsonResponse(response, "The follow-up service returned an empty or invalid response.");
  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, "Follow-up request failed"));
  }

  return data.answer || "Sorry, I could not process that.";
}

const severityConfig = {
  critical: { color: "#ff5d5d", bg: "#ff5d5d14", icon: "x", label: "Critical" },
  warning: { color: "#f59e0b", bg: "#f59e0b18", icon: "!", label: "Warning" },
  info: { color: "#22d3ee", bg: "#22d3ee16", icon: "i", label: "Info" }
};

const gradeColor = { A: "#16a34a", B: "#65a30d", C: "#f59e0b", D: "#f97316", F: "#ef4444" };
async function fetchAuditHistory() {
  const response = await fetch("/api/audits");
  const data = await parseJsonResponse(response, "The history service returned an empty or invalid response.");
  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, "Could not load audit history"));
  }

  return Array.isArray(data?.audits) ? data.audits : [];
}

async function clearAuditHistory() {
  const response = await fetch("/api/audits", { method: "DELETE" });
  const data = await parseJsonResponse(response, "The history service returned an empty or invalid response.");
  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, "Could not clear audit history"));
  }

  return Boolean(data?.success);
}

function SkeletonLoader({ width = "100%", height = "20px", borderRadius = "4px", className = "" }) {
  return (
    <div
      className={className}
      style={{
        width,
        height,
        background: "linear-gradient(90deg, #1a3448 25%, #2a4159 50%, #1a3448 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite",
        borderRadius
      }}
    />
  );
}

function formatAuditDate(dateString) {
  const dt = new Date(dateString);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getDisplayUrl(url) {
  return String(url || "").replace(/^https?:\/\//, "");
}

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
  const [currentAuditId, setCurrentAuditId] = useState("");
  const [auditHistory, setAuditHistory] = useState([]);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingPhase, setLoadingPhase] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    let cancelled = false;

    fetchAuditHistory()
      .then(history => {
        if (!cancelled) {
          setAuditHistory(history);
        }
      })
      .catch(error => {
        if (!cancelled) {
          setMessages(prev => [
            ...prev,
            {
              role: "bot",
              content: `I could not load saved audits from the database. ${error instanceof Error ? error.message : "Please try again."}`
            }
          ]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const loadingSteps = [
    { message: "Fetching page content...", progress: 10, phase: "fetching" },
    { message: "Analyzing on-page SEO signals...", progress: 30, phase: "analyzing" },
    { message: "Evaluating content quality...", progress: 60, phase: "content" },
    { message: "Generating prioritized recommendations...", progress: 90, phase: "recommendations" }
  ];

  const quickPrompts = [
    "What should I fix first for fastest impact?",
    "Write an improved title tag and meta description.",
    "Give me a 7-day SEO action plan from this audit."
  ];
  const isMockAudit = Boolean(auditReport?._meta?.mock);
  const sortedIssues = [...(auditReport?.issues || [])].sort(
    (a, b) => ({ critical: 0, warning: 1, info: 2 }[a.severity] - { critical: 0, warning: 1, info: 2 }[b.severity])
  );

  function hydrateAuditFromHistory(entry, announce = true) {
    setAuditReport(entry.report);
    setAuditUrl(entry.url);
    setCurrentAuditId(entry.id);
    setUrl(entry.url);
    setActiveTab("report");
    if (announce) {
      const note = entry.report?._meta?.mock ? " This saved audit used fallback mock data." : "";
      setMessages(prev => [...prev, { role: "bot", content: `Loaded audit from ${formatAuditDate(entry.createdAt)} for ${getDisplayUrl(entry.url)}.${note}` }]);
    }
  }

  async function handleAudit() {
    if (!url.trim()) return;
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith("http")) cleanUrl = "https://" + cleanUrl;

    setLoading(true);
    setAuditReport(null);
    setMessages(prev => [...prev, { role: "user", content: "Audit this URL: " + cleanUrl }]);

    let step = 0;
    setLoadingMsg(loadingSteps[0].message);
    setLoadingProgress(loadingSteps[0].progress);
    setLoadingPhase(loadingSteps[0].phase);

    const interval = setInterval(() => {
      step = (step + 1) % loadingSteps.length;
      setLoadingMsg(loadingSteps[step].message);
      setLoadingProgress(loadingSteps[step].progress);
      setLoadingPhase(loadingSteps[step].phase);
    }, 1800);

    try {
      const report = await runAudit(cleanUrl);
      setLoadingProgress(100);
      setLoadingPhase("complete");

      const entry = {
        id: report.auditId,
        createdAt: report.createdAt || new Date().toISOString(),
        url: cleanUrl,
        score: Number(report?.score || 0),
        grade: report?.grade || "N/A",
        criticalCount: Array.isArray(report?.issues) ? report.issues.filter(i => i.severity === "critical").length : 0,
        warningCount: Array.isArray(report?.issues) ? report.issues.filter(i => i.severity === "warning").length : 0,
        report
      };
      setAuditReport(report);
      setAuditUrl(cleanUrl);
      setCurrentAuditId(entry.id);
      setAuditHistory(prev => [entry, ...prev.filter(item => item.id !== entry.id)].slice(0, 25));
      setMessages(prev => [
        ...prev,
        {
          role: "bot",
          content: `${report.chatMessage || "Audit complete. Switch to the Report tab for full details."}${report?._meta?.mock ? " This result is using fallback mock data because the live audit service was unavailable." : ""}`
        }
      ]);
      setActiveTab("chat");
    } catch (error) {
      setMessages(prev => [
        ...prev,
        {
          role: "bot",
          content: `I had trouble auditing that URL. ${error instanceof Error ? error.message : "Make sure it is a valid public URL and try again."}`
        }
      ]);
    } finally {
      clearInterval(interval);
      setLoading(false);
      setLoadingMsg("");
      setLoadingProgress(0);
      setLoadingPhase("");
    }
  }

  async function handleSend(forcedQuestion) {
    const question = (forcedQuestion ?? input).trim();
    if (!question || loading) return;

    setInput("");
    setMessages(prev => [...prev, { role: "user", content: question }]);
    setLoading(true);
    setLoadingMsg("Thinking...");
    setLoadingProgress(50);
    setLoadingPhase("thinking");

    try {
      if (auditReport) {
        const answer = await askFollowUp(auditUrl, auditReport, question, messages, currentAuditId);
        setLoadingProgress(100);
        setLoadingPhase("complete");
        setMessages(prev => [...prev, { role: "bot", content: answer }]);
      } else {
        setMessages(prev => [
          ...prev,
          { role: "bot", content: "Please run an audit first by entering a URL above. Then I can answer questions about the results." }
        ]);
      }
    } catch (error) {
      setMessages(prev => [
        ...prev,
        { role: "bot", content: `Sorry, something went wrong. ${error instanceof Error ? error.message : "Please try again."}` }
      ]);
    } finally {
      setLoading(false);
      setLoadingMsg("");
      setLoadingProgress(0);
      setLoadingPhase("");
    }
  }

  const criticalCount = auditReport?.issues?.filter(i => i.severity === "critical").length || 0;
  const warningCount = auditReport?.issues?.filter(i => i.severity === "warning").length || 0;
  const historyForCurrentUrl = auditHistory.filter(item => item.url === auditUrl);
  const previousAudit = historyForCurrentUrl.find(item => item.id !== currentAuditId) || null;
  const previousCriticalCount = previousAudit?.criticalCount || 0;
  const previousWarningCount = previousAudit?.warningCount || 0;
  const scoreDelta = previousAudit ? (Number(auditReport?.score || 0) - Number(previousAudit.score || 0)) : null;
  const criticalDelta = previousAudit ? (criticalCount - previousCriticalCount) : null;
  const warningDelta = previousAudit ? (warningCount - previousWarningCount) : null;

  const currentIssueTitles = new Set((auditReport?.issues || []).map(issue => issue.title));
  const previousIssueTitles = new Set((previousAudit?.report?.issues || []).map(issue => issue.title));
  const introducedIssues = [...currentIssueTitles].filter(title => !previousIssueTitles.has(title));
  const resolvedIssues = [...previousIssueTitles].filter(title => !currentIssueTitles.has(title));

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
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
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
                {getDisplayUrl(auditUrl).slice(0, 40)}
              </span>
            )}
          </div>

          <div className="stack-mobile" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input
              className="url-input"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAudit()}
              aria-label="URL to audit"
              placeholder="https://example.com"
              style={{ flex: 1, background: "#0a1622", border: "1px solid #1c4259", borderRadius: 12, padding: "12px 14px", color: "#e5f2fb", fontSize: 14, fontFamily: "inherit" }}
            />
            <button
              className="audit-btn"
              onClick={handleAudit}
              disabled={loading}
              aria-label="Run SEO audit"
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

          {loading && (
            <div className="surface" style={{ borderRadius: 12, padding: "16px 20px", marginBottom: 16, background: "linear-gradient(135deg, #0d1a25 0%, #0a1620 100%)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #22d3ee, #0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#042436" }}>
                  SA
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#22d3ee", marginBottom: 2 }}>
                    {loadingMsg}
                  </div>
                  <div style={{ fontSize: 12, color: "#7be4f8" }}>
                    {loadingPhase === "fetching" && "Connecting to the target website..."}
                    {loadingPhase === "analyzing" && "Examining HTML structure and metadata..."}
                    {loadingPhase === "content" && "Evaluating readability and keyword usage..."}
                    {loadingPhase === "recommendations" && "Compiling actionable insights..."}
                    {loadingPhase === "thinking" && "Analyzing your question..."}
                    {loadingPhase === "complete" && "Finalizing results..."}
                  </div>
                </div>
              </div>

              <div style={{ position: "relative", height: 6, background: "#1a3448", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    height: "100%",
                    background: "linear-gradient(90deg, #22d3ee, #0ea5e9)",
                    borderRadius: 3,
                    width: `${loadingProgress}%`,
                    transition: "width 0.3s ease",
                    boxShadow: "0 0 10px rgba(34, 211, 238, 0.3)"
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: 11, color: "#6f8fa4" }}>
                  {loadingProgress}% complete
                </span>
                <div style={{ display: "flex", gap: 2 }}>
                  {[0, 1, 2].map(idx => (
                    <div
                      key={idx}
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: "50%",
                        background: "#22d3ee",
                        animation: `pulse 1.2s ${idx * 0.2}s infinite`
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
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
                  <div className="surface" style={{ borderRadius: "14px 14px 14px 4px", padding: "12px 16px", minWidth: 200 }}>
                    <div style={{ fontSize: 13, color: "#7be4f8", marginBottom: 8 }}>
                      {loadingMsg}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 4, background: "#1a3448", borderRadius: 2, overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            background: "linear-gradient(90deg, #22d3ee, #0ea5e9)",
                            width: `${loadingProgress}%`,
                            transition: "width 0.3s ease"
                          }}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 2 }}>
                        {[0, 1, 2].map(idx => (
                          <div
                            key={idx}
                            style={{ width: 4, height: 4, borderRadius: "50%", background: "#22d3ee", animation: `pulse 1.2s ${idx * 0.2}s infinite` }}
                          />
                        ))}
                      </div>
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
                aria-label="Ask a follow-up question"
                placeholder={auditReport ? "Ask about the audit results..." : "Run an audit first, then ask me anything..."}
                style={{ flex: 1, background: "none", border: "none", color: "#e5f2fb", fontSize: 14, fontFamily: "inherit" }}
              />
              <button
                className="send-btn"
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                aria-label="Send follow-up question"
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
                Send
              </button>
            </div>
          </div>
        )}

        {activeTab === "report" && (
          <div style={{ paddingTop: 20, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
            {!auditReport && !loading ? (
              <div className="surface" style={{ textAlign: "center", padding: "60px 20px", color: "#6f8fa4", borderRadius: 16 }}>
                <div style={{ fontSize: 28, marginBottom: 12, color: "#22d3ee", fontFamily: "'Syne', sans-serif" }}>REPORT</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: "#d7eaf8" }}>No audit yet</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>Enter a URL and run an audit to see the full report here.</div>
              </div>
            ) : loading ? (
              <>
                <div className="surface" style={{ borderRadius: 16, padding: 24, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ position: "relative", width: 90, height: 90, flexShrink: 0 }}>
                    <SkeletonLoader width="90px" height="90px" borderRadius="50%" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <SkeletonLoader width="120px" height="24px" className="msg-appear" style={{ marginBottom: 12 }} />
                    <SkeletonLoader width="100%" height="16px" className="msg-appear" style={{ marginBottom: 8, animationDelay: "0.1s" }} />
                    <SkeletonLoader width="80%" height="16px" className="msg-appear" style={{ animationDelay: "0.2s" }} />
                  </div>
                </div>

                <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div className="surface" style={{ borderRadius: 14, padding: 20 }}>
                    <SkeletonLoader width="140px" height="16px" className="msg-appear" style={{ marginBottom: 14 }} />
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #163348", gap: 8 }}>
                        <SkeletonLoader width="80px" height="13px" className="msg-appear" style={{ animationDelay: `${0.1 + i * 0.05}s` }} />
                        <SkeletonLoader width="60px" height="13px" className="msg-appear" style={{ animationDelay: `${0.15 + i * 0.05}s` }} />
                      </div>
                    ))}
                  </div>

                  <div className="surface" style={{ borderRadius: 14, padding: 20 }}>
                    <SkeletonLoader width="140px" height="16px" className="msg-appear" style={{ marginBottom: 14 }} />
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #163348", gap: 8 }}>
                        <SkeletonLoader width="80px" height="13px" className="msg-appear" style={{ animationDelay: `${0.1 + i * 0.05}s` }} />
                        <SkeletonLoader width="60px" height="13px" className="msg-appear" style={{ animationDelay: `${0.15 + i * 0.05}s` }} />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <SkeletonLoader width="120px" height="16px" className="msg-appear" style={{ marginBottom: 12 }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="surface issue-card" style={{ background: "#0f1f2b", border: "1px solid #1a3448", borderLeft: "3px solid #22d3ee", borderRadius: 10, padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <SkeletonLoader width="16px" height="16px" borderRadius="50%" className="msg-appear" style={{ animationDelay: `${0.1 + i * 0.1}s` }} />
                          <SkeletonLoader width="150px" height="13px" className="msg-appear" style={{ animationDelay: `${0.15 + i * 0.1}s` }} />
                        </div>
                        <SkeletonLoader width="100%" height="13px" className="msg-appear" style={{ marginBottom: 6, animationDelay: `${0.2 + i * 0.1}s` }} />
                        <SkeletonLoader width="90%" height="12px" className="msg-appear" style={{ animationDelay: `${0.25 + i * 0.1}s` }} />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                {isMockAudit && (
                  <div className="surface" style={{ borderRadius: 14, padding: 16, background: "#2b1d09", border: "1px solid #8a641d", color: "#f8ddb0" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                      Mock Audit Result
                    </div>
                    <p style={{ fontSize: 13, lineHeight: 1.6 }}>
                      This report is fallback data generated because the live Anthropic audit request was unavailable. Use it for UI testing and flow validation, not final SEO decisions.
                    </p>
                  </div>
                )}

                <div className="surface" style={{ borderRadius: 14, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#8ab0c6", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      Audit History
                    </div>
                    {auditHistory.length > 0 && (
                      <button
                        onClick={async () => {
                          try {
                            await clearAuditHistory();
                            setAuditHistory([]);
                            setCurrentAuditId("");
                            setAuditReport(null);
                            setAuditUrl("");
                            setMessages(prev => [
                              ...prev,
                              { role: "bot", content: "Saved audit history was cleared from the database." }
                            ]);
                          } catch (error) {
                            setMessages(prev => [
                              ...prev,
                              {
                                role: "bot",
                                content: `I could not clear saved audits. ${error instanceof Error ? error.message : "Please try again."}`
                              }
                            ]);
                          }
                        }}
                        style={{ background: "#2a1111", border: "1px solid #5a2323", color: "#fca5a5", borderRadius: 8, fontSize: 12, padding: "5px 9px", cursor: "pointer" }}
                      >
                        Clear History
                      </button>
                    )}
                  </div>

                  {auditHistory.length === 0 ? (
                    <p style={{ fontSize: 13, color: "#7796aa" }}>No saved audits yet. Run an audit to start building history.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {auditHistory.slice(0, 8).map(item => (
                        <button
                          key={item.id}
                          onClick={() => hydrateAuditFromHistory(item, false)}
                          style={{
                            textAlign: "left",
                            background: item.id === currentAuditId ? "#103049" : "#0b1d2b",
                            border: item.id === currentAuditId ? "1px solid #23668a" : "1px solid #164059",
                            borderRadius: 10,
                            color: "#d4e9f7",
                            padding: "10px 12px",
                            cursor: "pointer",
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            flexWrap: "wrap"
                          }}
                        >
                          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{getDisplayUrl(item.url).slice(0, 55)}</span>
                            <span style={{ fontSize: 11, color: "#86a6bb" }}>{formatAuditDate(item.createdAt)}</span>
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#9ec7de" }}>
                            <span>Score {item.score}</span>
                            <span style={{ color: gradeColor[item.grade] || "#9ec7de", fontWeight: 700 }}>{item.grade}</span>
                            <span style={{ color: "#fca5a5" }}>C {item.criticalCount}</span>
                            <span style={{ color: "#fcd34d" }}>W {item.warningCount}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {previousAudit && (
                  <div className="surface" style={{ borderRadius: 14, padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#8ab0c6", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
                      Compare With Previous ({formatAuditDate(previousAudit.createdAt)})
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
                      <div style={{ background: "#0b1d2b", border: "1px solid #164059", borderRadius: 10, padding: 10 }}>
                        <div style={{ fontSize: 11, color: "#84a6ba", marginBottom: 5 }}>Score Delta</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: (scoreDelta || 0) >= 0 ? "#86efac" : "#fca5a5" }}>
                          {(scoreDelta || 0) >= 0 ? "+" : ""}{scoreDelta}
                        </div>
                      </div>
                      <div style={{ background: "#0b1d2b", border: "1px solid #164059", borderRadius: 10, padding: 10 }}>
                        <div style={{ fontSize: 11, color: "#84a6ba", marginBottom: 5 }}>Critical Delta</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: (criticalDelta || 0) <= 0 ? "#86efac" : "#fca5a5" }}>
                          {(criticalDelta || 0) > 0 ? "+" : ""}{criticalDelta}
                        </div>
                      </div>
                      <div style={{ background: "#0b1d2b", border: "1px solid #164059", borderRadius: 10, padding: 10 }}>
                        <div style={{ fontSize: 11, color: "#84a6ba", marginBottom: 5 }}>Warning Delta</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: (warningDelta || 0) <= 0 ? "#86efac" : "#fca5a5" }}>
                          {(warningDelta || 0) > 0 ? "+" : ""}{warningDelta}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                      <div style={{ background: "#0b1d2b", border: "1px solid #164059", borderRadius: 10, padding: 10 }}>
                        <div style={{ fontSize: 11, color: "#84a6ba", marginBottom: 6 }}>Introduced Issues ({introducedIssues.length})</div>
                        <div style={{ fontSize: 12, color: "#d4e9f7", lineHeight: 1.5 }}>
                          {introducedIssues.length ? introducedIssues.slice(0, 3).join(", ") : "None"}
                        </div>
                      </div>
                      <div style={{ background: "#0b1d2b", border: "1px solid #164059", borderRadius: 10, padding: 10 }}>
                        <div style={{ fontSize: 11, color: "#84a6ba", marginBottom: 6 }}>Resolved Issues ({resolvedIssues.length})</div>
                        <div style={{ fontSize: 12, color: "#d4e9f7", lineHeight: 1.5 }}>
                          {resolvedIssues.length ? resolvedIssues.slice(0, 3).join(", ") : "None"}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

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
                    {sortedIssues.map((issue, i) => {
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
