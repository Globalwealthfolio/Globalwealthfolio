
# 🌐 GlobalWealthFolio

GlobalWealthFolio is a personal portfolio management website designed to help individuals track investments, monitor asset allocation, and visualize financial growth in a simple, user‑friendly way.

---

## ✨ Features

- 📊 **Dashboard**: Visualize portfolio allocation with interactive Chart.js charts.
- 🎯 **Goal Tracking**: Set financial goals and monitor progress over time.
- 📥 **Data Import/Export**: Manage portfolio data with CSV, Excel, and PDF files.
- 🔐 **Secure Admin Section**: OTP‑based access for sensitive operations.
- 🌍 **Responsive Design**: Works seamlessly across desktop and mobile devices.
- 🔍 **Smart Search**: Fuse.js-powered fuzzy search for transactions and holdings.
- 🧠 **AI-Assisted Insights**: Browser-side LLM for intelligent portfolio analysis.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 22.12.0
- **npm**

### 1. Clone the Repository
```bash
git clone https://github.com/Globalwealthfolio/Globalwealthfolio.git
cd globalwealthfolio
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Admin authentication
ADMIN_TOKEN=your-admin-token-here

# Email provider (choose one)
RESEND_API_KEY=re_xxxxxxxxxxxx
SENDGRID_API_KEY=SG.xxxxxxxxxxxx

# Email sender
EMAIL_FROM=noreply@globalwealthfolio.com
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:4321](http://localhost:4321) in your browser.

### Available commands

| Command                | Action                                         |
| ---------------------- | ---------------------------------------------- |
| `npm install`          | Install dependencies                           |
| `npm run dev`          | Start local dev server at `localhost:4321`     |
| `npm run build`        | Build production site to `./dist/`             |
| `npm run preview`      | Preview production build locally               |
| `npm run deploy`       | Build + deploy to Cloudflare Pages             |

---

## 🔒 Security & Secrets

Sensitive files are **never committed** to the repository:

- `.env`, `.env.production`, `.env.local` — environment variables
- `wrangler.toml` — Cloudflare binding IDs and configuration
- `dev-error*.txt`, `dev-output*.txt`, `ngrok_*.txt` — local development artifacts
- `*.key`, `*.pem`, `*.cer`, `*.crt` — cryptographic material
- `service-account*.json`, `credentials*`, `secrets*` — credential files

All secrets are **injected at runtime** via environment variables (locally) or Cloudflare Pages Secrets (production). The `.env.example` file serves as a safe template with placeholder values.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

In plain language: You are free to **use, modify, distribute, and sell** this software for any purpose. The software is provided **"as is"**, without warranty of any kind. The authors are not liable for any claims or damages arising from its use.

---

## 💡 Monetization Ideas

- **Freemium Model** — Free tier with basic tracking; premium tier for advanced analytics, reports, and AI insights.
- **SaaS Hosting** — Offer a hosted version at [globalwealthfolio.com](https://globalwealthfolio.com) with managed backups and support.
- **Consulting & Customization** — Provide tailored portfolio solutions for financial advisors or wealth management firms.

---

## 🤝 Contributing

Contributions are welcome!

1. **Fork** the repository.
2. **Create a feature branch** — `git checkout -b feat/amazing-feature`.
3. **Commit your changes** — `git commit -m 'Add amazing feature'`.
4. **Push to your branch** — `git push origin feat/amazing-feature`.
5. **Open a Pull Request**.

Please ensure your code follows the existing style and includes relevant updates where appropriate.

---

## 📬 Contact

🌐 Website: [https://globalwealthfolio.com](https://globalwealthfolio.com)

---

<p align="center">
  <sub>Built with ❤️ using <a href="https://astro.build">Astro</a> + <a href="https://tailwindcss.com">TailwindCSS</a>, deployed on <a href="https://pages.cloudflare.com">Cloudflare Pages</a>.</sub>
</p>
