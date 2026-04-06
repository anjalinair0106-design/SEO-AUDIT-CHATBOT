import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.env.PORT || 8787);
const ENV_PATH = join(process.cwd(), ".env");
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

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

function loadEnvFile() {
  if (!existsSync(ENV_PATH)) return;
  const lines = readFileSync(ENV_PATH, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

function isMockModeEnabled() {
  return String(process.env.MOCK_AUDITS || "").toLowerCase() === "true";
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(body));
}

function getApiKey() {
  return process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY || "";
}

function getErrorMessage(data, fallback) {
  return data?.error?.message || data?.message || fallback;
}

function shouldUseMockFallback(error) {
  const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
  return (
    isMockModeEnabled() ||
    message.includes("credit balance is too low") ||
    message.includes("missing anthropic_api_key") ||
    message.includes("invalid x-api-key") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("enotfound") ||
    message.includes("econnrefused")
  );
}

function stripProtocol(url) {
  return String(url || "").replace(/^https?:\/\//, "");
}

function estimateReadability(wordCount) {
  if (wordCount > 900) return "Moderate";
  if (wordCount > 350) return "Easy";
  return "Difficult";
}

function generateMockAudit(url, pageContent) {
  const html = String(pageContent?.html || "");
  const text = String(pageContent?.text || "");
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
  const h1Matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)];
  const h2Matches = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
  const h3Matches = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)];
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i);
  const robotsMatch = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i);
  const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)];
  const imagesWithoutAlt = imgTags.filter(match => !/\balt\s*=/.test(match[0])).length;
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const titleTag = titleMatch?.[1]?.replace(/\s+/g, " ").trim() || "Missing";
  const metaDescription = metaMatch?.[1]?.trim() || "Missing";
  const h1Text = h1Matches[0]?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "Missing";

  const issues = [];
  if (titleTag === "Missing") {
    issues.push({
      category: "On-Page SEO",
      severity: "critical",
      title: "Missing title tag",
      description: "The page does not expose a clear HTML title tag, which weakens search relevance and click-through potential.",
      fix: "Add a unique title tag around 50-60 characters that includes the main keyword and page intent."
    });
  } else if (titleTag.length < 30 || titleTag.length > 60) {
    issues.push({
      category: "On-Page SEO",
      severity: "warning",
      title: "Title tag length needs tuning",
      description: `The current title is ${titleTag.length} characters, which may be too short or too long for strong SERP presentation.`,
      fix: "Rewrite the title tag to target 50-60 characters with the primary keyword near the front."
    });
  }

  if (metaDescription === "Missing") {
    issues.push({
      category: "On-Page SEO",
      severity: "warning",
      title: "Missing meta description",
      description: "The page is missing a meta description, so search engines may generate an unoptimized snippet.",
      fix: "Write a compelling 140-160 character meta description that summarizes the page and includes a value-driven CTA."
    });
  }

  if (h1Matches.length === 0) {
    issues.push({
      category: "On-Page SEO",
      severity: "critical",
      title: "Missing H1 heading",
      description: "No H1 heading was detected, which makes the page structure less clear to both users and search engines.",
      fix: "Add one descriptive H1 that aligns with the primary topic of the page."
    });
  } else if (h1Matches.length > 1) {
    issues.push({
      category: "On-Page SEO",
      severity: "warning",
      title: "Multiple H1 headings",
      description: `The page contains ${h1Matches.length} H1 headings, which can dilute content hierarchy.`,
      fix: "Keep one clear H1 and move secondary headings to H2 or H3."
    });
  }

  if (wordCount < 250) {
    issues.push({
      category: "Content Quality",
      severity: "warning",
      title: "Thin content",
      description: `The extracted page copy is only about ${wordCount} words, which may not be enough to rank well for competitive queries.`,
      fix: "Expand the page with useful, intent-matched content that answers likely user questions."
    });
  }

  if (imagesWithoutAlt > 0) {
    issues.push({
      category: "Content Quality",
      severity: "info",
      title: "Images missing alt text",
      description: `${imagesWithoutAlt} image${imagesWithoutAlt === 1 ? "" : "s"} appear to be missing alt text.`,
      fix: "Add concise descriptive alt text to meaningful images and keep decorative images empty with alt=\"\"."
    });
  }

  if (!canonicalMatch) {
    issues.push({
      category: "On-Page SEO",
      severity: "info",
      title: "Canonical tag not found",
      description: "A canonical tag was not detected, which can make duplicate URL handling less explicit.",
      fix: "Add a self-referencing canonical tag for the preferred URL."
    });
  }

  const score = Math.max(
    42,
    Math.min(
      92,
      84 -
        issues.filter(issue => issue.severity === "critical").length * 14 -
        issues.filter(issue => issue.severity === "warning").length * 7 -
        issues.filter(issue => issue.severity === "info").length * 3
    )
  );

  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  const topIssues = issues.slice(0, 3).map(issue => issue.title.toLowerCase());

  return {
    summary: `This is a mock audit for ${stripProtocol(url)} generated by the local fallback mode. It gives you realistic structure, priorities, and copy suggestions so you can keep testing the product even when the live SEO model is unavailable.`,
    score,
    grade,
    issues,
    positives: [
      titleTag !== "Missing" ? "A title tag is present." : "The page loaded enough content to build a structural mock audit.",
      h1Matches.length === 1 ? "A single H1 heading is present." : "The audit pipeline completed and returned a usable report shape.",
      wordCount >= 250 ? "The page contains enough visible text to support richer SEO targeting." : "The report includes clear next steps for improvement."
    ],
    onPage: {
      titleTag,
      titleLength: titleTag === "Missing" ? 0 : titleTag.length,
      metaDescription,
      metaLength: metaDescription === "Missing" ? 0 : metaDescription.length,
      h1Count: h1Matches.length,
      h1Text,
      h2Count: h2Matches.length,
      h3Count: h3Matches.length,
      canonicalTag: canonicalMatch?.[1] || "Missing",
      robots: robotsMatch?.[1] || "Missing"
    },
    content: {
      wordCount,
      readabilityScore: estimateReadability(wordCount),
      imagesWithoutAlt,
      totalImages: imgTags.length,
      keywordDensityNote: wordCount < 250 ? "Content is too limited to assess keyword targeting confidently." : "Keyword targeting appears moderate in this mock analysis.",
      contentIssues: issues.filter(issue => issue.category === "Content Quality").map(issue => issue.title)
    },
    chatMessage: `Mock audit complete for ${stripProtocol(url)}. Start with ${topIssues.join(", ") || "basic on-page cleanup"} first, then refine titles, meta data, and supporting content.`,
    _meta: {
      mock: true,
      source: "fallback",
      reason: "Live Anthropic request was unavailable."
    }
  };
}

function generateMockFollowUp(url, auditReport, question) {
  const normalizedQuestion = String(question || "").toLowerCase();
  const issues = Array.isArray(auditReport?.issues) ? auditReport.issues : [];
  const topIssue = issues[0];
  const titleTag = auditReport?.onPage?.titleTag;
  const metaDescription = auditReport?.onPage?.metaDescription;

  if (normalizedQuestion.includes("fix first") || normalizedQuestion.includes("fastest impact")) {
    if (topIssue) {
      return `This is a mock follow-up answer. Fix ${topIssue.title.toLowerCase()} first because it has the biggest likely SEO impact in this report. Then address ${issues.slice(1, 3).map(issue => issue.title.toLowerCase()).join(" and ") || "the remaining on-page issues"}.`;
    }
  }

  if (normalizedQuestion.includes("title tag") || normalizedQuestion.includes("meta description")) {
    const baseName = stripProtocol(url).split("/")[0] || "your page";
    const improvedTitle = titleTag && titleTag !== "Missing"
      ? `${titleTag.slice(0, 42)} | SEO-Friendly Update`
      : `Visit ${baseName} | SEO-Friendly Page Title`;
    const improvedMeta = metaDescription && metaDescription !== "Missing"
      ? `${metaDescription.slice(0, 135)} Learn more and explore the page.`
      : `Explore ${baseName} with a clearer value proposition, stronger search snippet copy, and a better reason to click.`;

    return `This is a mock follow-up answer. Suggested title tag: ${improvedTitle}. Suggested meta description: ${improvedMeta}`;
  }

  if (normalizedQuestion.includes("7-day") || normalizedQuestion.includes("action plan")) {
    return `This is a mock follow-up answer. Day 1: fix critical on-page elements. Day 2: rewrite title and meta description. Day 3: improve H1-H3 structure. Day 4: expand thin sections with search-focused copy. Day 5: add alt text and image context. Day 6: review internal links and canonical handling. Day 7: re-audit and compare score changes.`;
  }

  return `This is a mock follow-up answer for ${stripProtocol(url)}. Based on the current report, focus first on the highest-severity issues, then improve page copy, metadata, and structure before running another audit.`;
}

function parseAuditJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Invalid response format");
  }
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function callAnthropic(payload) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY in the server environment");
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(getErrorMessage(data, "Anthropic request failed"));
  }

  return data;
}

async function handleAudit(req, res) {
  const { url, pageContent } = await readRequestBody(req);
  try {
    const data = await callAnthropic({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Please audit this URL: ${url}\n\nPage HTML (truncated):\n${pageContent?.html || ""}\n\nExtracted text:\n${pageContent?.text || ""}`
        }
      ]
    });

    const raw = data.content?.[0]?.text || "{}";
    sendJson(res, 200, parseAuditJson(raw));
  } catch (error) {
    if (!shouldUseMockFallback(error)) throw error;
    console.warn("Using mock audit fallback:", error instanceof Error ? error.message : error);
    sendJson(res, 200, generateMockAudit(url, pageContent));
  }
}

async function handleFollowUp(req, res) {
  const { url, auditReport, question, history } = await readRequestBody(req);
  try {
    const data = await callAnthropic({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: `You are a helpful SEO expert. Answer questions about the audit results concisely and practically. Use plain text, no markdown.

Audit URL: ${url}
Audit report JSON:
${JSON.stringify(auditReport, null, 2)}`,
      messages: [
        ...(Array.isArray(history) ? history : []),
        { role: "user", content: question || "" }
      ]
    });

    sendJson(res, 200, { answer: data.content?.[0]?.text || "Sorry, I could not process that." });
  } catch (error) {
    if (!shouldUseMockFallback(error)) throw error;
    console.warn("Using mock follow-up fallback:", error instanceof Error ? error.message : error);
    sendJson(res, 200, { answer: generateMockFollowUp(url, auditReport, question) });
  }
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  try {
    if (req.method === "POST" && req.url === "/api/audit") {
      await handleAudit(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/follow-up") {
      await handleFollowUp(req, res);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Server error"
    });
  }
});

server.listen(PORT, () => {
  console.log(`SEO Audit API server running on http://localhost:${PORT}`);
});
