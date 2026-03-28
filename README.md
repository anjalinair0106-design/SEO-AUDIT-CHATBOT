# 🔍 SEOAudit — AI-Powered SEO Audit Chatbot

> Paste any URL. Get a prioritized SEO audit powered by Claude AI — in seconds.

![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)
![Claude AI](https://img.shields.io/badge/Claude-Sonnet%204-6C63FF?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)
![Status](https://img.shields.io/badge/Status-Active-brightgreen?style=flat-square)

---

## 📸 Overview

SEOAudit is a React-based web application that lets you input any public URL and receive an AI-generated, prioritized SEO audit — no browser extensions, no paid subscriptions, no complex dashboards.

Results appear in two views:
- 💬 **Chat tab** — conversational summary of top issues with follow-up Q&A
- 📋 **Report tab** — structured breakdown with score, stats, issues, and positives

---

## ✨ Features

- **On-Page SEO Analysis** — title tag length, meta description, H1/H2/H3 structure, canonical tag, robots meta
- **Content Quality Evaluation** — word count, readability score, image alt-text coverage, keyword density observation
- **AI-Prioritized Issues** — Critical / Warning / Info severity with specific fix suggestions for each issue
- **SEO Score (0–100)** — animated ring chart with A–F letter grade
- **Conversational Chat** — ask follow-up questions like *"How do I fix the canonical issue?"*
- **Dual View** — Chat for conversation, Report for full structured analysis
- **Graceful Error Handling** — friendly messages for failed fetches and unreachable URLs

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 (JSX), CSS-in-JS |
| Fonts | DM Sans, Syne (Google Fonts) |
| AI Engine | Claude Sonnet 4 via Anthropic API |
| Page Fetching | allorigins.win CORS proxy |
| State Management | React `useState` / `useRef` |
| Deployment | Vercel, Netlify, or any static host |

---

## 🚀 Getting Started

### Prerequisites

- Node.js v18+
- An [Anthropic API key](https://console.anthropic.com/)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-username/seo-audit-chatbot.git
cd seo-audit-chatbot

# 2. Install dependencies
npm install

# 3. Add your Anthropic API key
cp .env.example .env
# Then edit .env and add your key:
# VITE_ANTHROPIC_API_KEY=your_api_key_here

# 4. Start the development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
npm run preview
```

---

## 🗂️ Project Structure

```
seo-audit-chatbot/
├── src/
│   ├── App.jsx                    # Root component
│   ├── seo-audit-chatbot.jsx      # Main chatbot component
│   └── index.css                  # Global styles
├── public/
├── .env.example                   # Environment variable template
├── package.json
├── vite.config.js
└── README.md
```

---

## 📖 How to Use

1. **Enter a URL** — paste any public URL into the input bar at the top
2. **Click Run Audit** — or press `Enter` to start the analysis
3. **Read the Chat** — the bot posts a conversational summary of the top SEO issues
4. **Switch to Report** — see the full structured breakdown: score ring, on-page stats, content stats, prioritized issues, and what's working well
5. **Ask Questions** — type follow-up questions in the chat, e.g.:
   - *"What should I fix first?"*
   - *"How do I add a canonical tag?"*
   - *"Is my word count too low?"*

---

## 🔬 What It Audits

### On-Page SEO
| Signal | What Is Checked |
|---|---|
| Title Tag | Presence and character length (optimal: 50–60 chars) |
| Meta Description | Presence and character length (optimal: 150–160 chars) |
| Heading Structure | H1 count, H1 text, H2 and H3 counts |
| Canonical Tag | Present or missing |
| Robots Meta | Index/noindex, follow/nofollow directives |

### Content Quality
| Signal | What Is Checked |
|---|---|
| Word Count | Total words on page |
| Readability | Easy / Moderate / Difficult classification |
| Image Alt Text | Total images vs. images missing alt attributes |
| Keyword Density | AI observation on keyword usage patterns |

---

## ⚙️ Environment Variables

Create a `.env` file in the project root:

```env
VITE_ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

> ⚠️ **Never commit your `.env` file.** It is already listed in `.gitignore`.

---

## 🤖 How the AI Works

Two types of Anthropic API calls are made:

**1. Audit Call**
- Sends page HTML (truncated to 15,000 chars) + extracted text (5,000 chars) to Claude
- A structured system prompt instructs Claude to return a strict JSON schema
- JSON includes: `score`, `grade`, `summary`, `issues[]`, `positives[]`, `onPage{}`, `content{}`, `chatMessage`

**2. Follow-up Call**
- Sends the full audit JSON report + conversation history back to Claude
- Claude responds with a contextual plain-text answer grounded in the audit data

---

## ⚠️ Known Limitations

| Limitation | Reason |
|---|---|
| No Core Web Vitals / page speed | Requires Google PageSpeed Insights API |
| No backlink analysis | Requires third-party SEO API (Ahrefs, Moz) |
| Single-page audits only | Multi-page crawling not implemented in v1.0 |
| No authenticated pages | CORS proxy cannot access login-protected pages |
| No audit history | No database or user accounts in v1.0 |

---

## 🗺️ Roadmap

- [ ] Google PageSpeed API — Core Web Vitals integration
- [ ] Competitor comparison — audit two URLs side by side
- [ ] PDF / CSV export of the full report
- [ ] Saved audit history with trend tracking
- [ ] Chrome Extension for one-click in-browser audits
- [ ] Bulk URL auditing via CSV upload
- [ ] Schema markup validator
- [ ] Slack / Email alerts for scheduled re-audits

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

```bash
# 1. Fork the repository
# 2. Create your feature branch
git checkout -b feature/your-feature-name

# 3. Commit your changes
git commit -m "feat: add your feature description"

# 4. Push to your branch
git push origin feature/your-feature-name

# 5. Open a Pull Request
```

Please follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgements

- [Anthropic](https://anthropic.com) — Claude AI API
- [allorigins.win](https://allorigins.win) — open CORS proxy
- [Google Fonts](https://fonts.google.com) — DM Sans & Syne typefaces

---

<p align="center">Built with React + Claude AI &nbsp;•&nbsp; <a href="https://github.com/your-username/seo-audit-chatbot/issues">Report a Bug</a> &nbsp;•&nbsp; <a href="https://github.com/your-username/seo-audit-chatbot/issues">Request a Feature</a></p>
