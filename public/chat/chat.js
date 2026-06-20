/* ── WebLLM Financial Chatbot ──────────────────────────────── */

/* ── State ─────────────────────────────────────────────────── */
let engine = null
let modelLoaded = false
let modelCancelled = false
let currentChart = null

/* ── DOM refs ──────────────────────────────────────────────── */
const $ = (s) => document.querySelector(s)
const $$ = (s) => document.querySelectorAll(s)

const messagesEl = document.getElementById('messages')
const inputEl = document.getElementById('chat-input')
const sendBtn = document.getElementById('send-btn')
const statusDot = document.getElementById('status-dot')
const statusLabel = document.getElementById('status-label')
const statusCount = document.getElementById('status-count')
const modelOverlay = document.getElementById('model-overlay')
const modelProgressBar = document.getElementById('model-progress-bar')
const modelStatus = document.getElementById('model-status')
const modelCancelBtn = document.getElementById('model-cancel-btn')
const modelInfoEl = document.getElementById('model-info')

/* ── Data Layer ──────────────────────────────────────────────── */
function loadPortfolioData() {
  try {
    const raw = localStorage.getItem('gwp:data:v1')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed
  } catch { return null }
}

function hasData(data) {
  if (!data) return false
  return (
    (data.investments && data.investments.length > 0) ||
    (data.expenses && data.expenses.length > 0) ||
    (data.goals && data.goals.length > 0) ||
    (data.emis && data.emis.length > 0)
  )
}

function totalCount(data) {
  let n = 0
  if (data.investments) n += data.investments.length
  if (data.expenses) n += data.expenses.length
  if (data.goals) n += data.goals.length
  if (data.emis) n += data.emis.length
  return n
}

function formatDataSummary(data) {
  if (!hasData(data)) return null

  const invs = data.investments || []
  const exps = data.expenses || []
  const goals = data.goals || []
  const emis = data.emis || []

  const totalInv = invs.reduce((s, i) => s + (i.amount || 0), 0)
  const totalCur = invs.reduce((s, i) => s + (i.currentValue || 0), 0)
  const totalGain = totalCur - totalInv
  const gainPct = totalInv > 0 ? ((totalGain / totalInv) * 100).toFixed(1) : '0.0'

  const byType = {}
  invs.forEach(i => { byType[i.type] = (byType[i.type] || 0) + (i.currentValue || 0) })

  const income = exps.filter(e => e.type === 'income').reduce((s, e) => s + (e.amount || 0), 0)
  const expense = exps.filter(e => e.type !== 'income').reduce((s, e) => s + (e.amount || 0), 0)
  const totalGoals = goals.reduce((s, g) => s + (g.target || 0), 0)
  const totalGoalCur = goals.reduce((s, g) => s + (g.current || 0), 0)
  const totalEMI = emis.reduce((s, e) => s + (e.emi || 0), 0)
  const totalOut = emis.reduce((s, e) => s + (e.outstanding || 0), 0)

  return {
    summary: {
      totalInvested: totalInv,
      totalCurrent: totalCur,
      totalGain, gainPct: Number(gainPct),
      totalMonthlyIncome: income,
      totalMonthlyExpense: expense,
      totalEMI, totalOutstanding: totalOut,
      totalGoals, totalGoalCurrent: totalGoalCur,
    },
    investments: invs.map(i => ({
      name: i.name, type: i.type, amount: i.amount, currentValue: i.currentValue,
      currency: i.currency || 'INR', risk: i.risk, date: i.date,
      gain: (i.currentValue || 0) - (i.amount || 0),
    })),
    allocation: Object.entries(byType).map(([type, value]) => ({ type, value })),
    goals: goals.map(g => ({ name: g.name, target: g.target, current: g.current, deadline: g.deadline })),
    expenses: exps.slice(-30).map(e => ({ description: e.description, amount: e.amount, category: e.category, date: e.date, type: e.type })),
    emis: emis.map(e => ({ name: e.name, emi: e.emi, outstanding: e.outstanding, rate: e.rate })),
  }
}

/* ── Status UI ──────────────────────────────────────────────── */
function updateStatus() {
  const data = loadPortfolioData()
  if (!data || !hasData(data)) {
    statusDot.className = 'status-dot empty'
    statusLabel.textContent = 'No data loaded'
    statusCount.textContent = '0 records'
    return { hasData: false, data: null }
  }
  const count = totalCount(data)
  statusDot.className = 'status-dot loaded'
  statusLabel.textContent = 'Portfolio data loaded'
  statusCount.textContent = `${count} records`
  return { hasData: true, data: formatDataSummary(data) }
}

/* ── Chat UI ────────────────────────────────────────────────── */
let msgId = 0

function addMessage(role, html, extra = '') {
  const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const div = document.createElement('div')
  div.className = `message ${role}`
  div.dataset.msgId = ++msgId
  div.innerHTML = `<div class="msg-content">${html}</div><div class="timestamp">${ts}${extra}</div>`
  messagesEl.appendChild(div)
  messagesEl.scrollTop = messagesEl.scrollHeight
  return div
}

function showTyping() {
  const div = document.createElement('div')
  div.className = 'typing'
  div.id = 'typing-indicator'
  div.innerHTML = '<span></span><span></span><span></span>'
  messagesEl.appendChild(div)
  messagesEl.scrollTop = messagesEl.scrollHeight
}

function hideTyping() {
  const el = document.getElementById('typing-indicator')
  if (el) el.remove()
}

function streamBotMessage(text) {
  let el = messagesEl.querySelector('.message.bot:last-child')
  if (!el || el.dataset.streaming !== 'true') {
    const div = document.createElement('div')
    div.className = 'message bot'
    div.dataset.msgId = ++msgId
    div.dataset.streaming = 'true'
    div.innerHTML = `<div class="msg-content"></div><div class="timestamp">streaming…</div>`
    messagesEl.appendChild(div)
    el = div
  }
  const content = el.querySelector('.msg-content')
  if (content) content.innerHTML = marked(text)
  messagesEl.scrollTop = messagesEl.scrollHeight
  return el
}

function finalizeBotMessage(el) {
  if (!el) return
  const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const t = el.querySelector('.timestamp')
  if (t) t.textContent = ts
  el.dataset.streaming = 'false'
}

function addWelcome() {
  const data = loadPortfolioData()
  if (!hasData(data)) {
    addMessage('bot',
      `<div class="welcome-message">
        <div class="icon">📊</div>
        <h2>Financial Assistant</h2>
        <p>No data available. Please upload a file using the <a href="/import" style="color:var(--accent)">Import</a> option first, then come back to ask questions about your portfolio.</p>
      </div>`
    )
    return
  }
  addMessage('bot',
    `👋 Hi! I can answer questions about your portfolio. Try asking:
    <div class="suggestions">
      <button data-suggest="What's my total portfolio value?">Total portfolio value</button>
      <button data-suggest="Show my asset allocation chart">Asset allocation chart</button>
      <button data-suggest="What are my top holdings?">Top holdings</button>
      <button data-suggest="How are my investments performing?">Performance</button>
      <button data-suggest="Show my expenses by category">Expenses by category</button>
    </div>`
  )
  // Wire suggestion buttons
  messagesEl.querySelectorAll('[data-suggest]').forEach(btn => {
    btn.addEventListener('click', () => {
      inputEl.value = btn.dataset.suggest
      handleSend()
    })
  })
}

function setInputEnabled(enabled) {
  inputEl.disabled = !enabled
  sendBtn.disabled = !enabled
  if (enabled) inputEl.focus()
}

/* ── Markdown (minimal) ────────────────────────────────────── */
function marked(text) {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/- (.+)/g, '• $1')
}

/* ── WebLLM ──────────────────────────────────────────────────── */
async function loadModel(progressCb) {
  if (modelLoaded && engine) return true
  if (modelCancelled) return false

  try {
    const { CreateMLCEngine } = await import(
      'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.46/+esm'
    )

    const modelId = 'Qwen2-0.5B-Instruct-q4f16_1-MLC'

    engine = await CreateMLCEngine(modelId, {
      initProgressCallback: (p) => {
        const pct = Math.round((p.progress || 0) * 100)
        if (progressCb) progressCb(pct, p.text || 'Loading…')
      },
    })

    modelLoaded = true
    modelInfoEl.textContent = modelId
    return true
  } catch (err) {
    console.error('WebLLM load failed:', err)
    return false
  }
}

async function askLLM(question, dataSummary) {
  if (!engine || !modelLoaded) {
    addMessage('bot', '⚠️ AI model not loaded. Please wait or refresh the page.')
    return
  }

  const dataJSON = JSON.stringify(dataSummary, null, 2)

  const systemMsg = `You are a financial portfolio assistant analyzing the user's personal finance data.
The data is provided as JSON. Answer questions conversationally based ONLY on the data provided.
Do not make up numbers. If the data doesn't contain what they ask, say so politely.

When the user asks for a chart or visualization, include a JSON block like:
CHART: {"type":"doughnut|bar|line|polarArea","title":"Chart Title","labels":["A","B"],"data":[10,20],"colors":["#c9a961","#0070f3"]}

For doughnut: use for allocation/percentages
For bar: use for comparisons
For line: use for trends over time
For polarArea: use for multi-category comparison

Keep answers concise (2-4 sentences). Use simple language.`

  const messages = [
    { role: 'system', content: systemMsg },
    { role: 'user', content: `Here is the user's financial data:\n\`\`\`json\n${dataJSON}\n\`\`\`\n\nUser question: ${question}` },
  ]

  try {
    const reply = await engine.chat.completions.create({ messages, stream: true })
    let full = ''
    let botEl = null
    for await (const chunk of reply) {
      const delta = chunk.choices[0]?.delta?.content || ''
      full += delta
      botEl = streamBotMessage(full)
    }
    if (botEl) finalizeBotMessage(botEl)
    parseAndRenderChart(full)
  } catch (err) {
    console.error('LLM error:', err)
    addMessage('bot', '⚠️ Sorry, something went wrong. Please try again.')
  }
}

/* ── Chart rendering ──────────────────────────────────────────── */
function parseAndRenderChart(text) {
  const match = text.match(/CHART:\s*(\{[\s\S]*?\})/)
  if (!match) return

  try {
    const config = JSON.parse(match[1])
    renderChart(config)
  } catch { /* invalid JSON, skip */ }
}

function renderChart(config) {
  if (typeof Chart === 'undefined') {
    addMessage('bot', '⚠️ Chart library not available.')
    return
  }

  if (currentChart) { currentChart.destroy(); currentChart = null }

  const lastMsg = messagesEl.querySelector('.message.bot:last-child .msg-content')
  if (!lastMsg) return

  const wrapper = document.createElement('div')
  wrapper.className = 'chart-area'
  wrapper.innerHTML = `<div class="chart-title">${marked(config.title || '')}</div><canvas></canvas>`

  // Remove any existing chart area from this message
  const existing = lastMsg.querySelector('.chart-area')
  if (existing) existing.remove()
  lastMsg.appendChild(wrapper)

  const canvas = wrapper.querySelector('canvas')
  const ctx = canvas.getContext('2d')

  const colors = config.colors || ['#c9a961','#0070f3','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4']

  const chartConfig = {
    type: config.type || 'doughnut',
    data: {
      labels: config.labels || [],
      datasets: [{
        data: config.data || [],
        backgroundColor: colors.slice(0, (config.data || []).length),
        borderWidth: 2,
        borderColor: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#fff',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: config.type !== 'bar', position: 'bottom', labels: { boxWidth: 10, padding: 8, font: { size: 11 } } },
        tooltip: { enabled: true, backgroundColor: 'rgba(0,0,0,0.85)', titleColor: '#fff', bodyColor: '#fff', cornerRadius: 6, padding: 8 },
      },
    },
  }

  if (config.type === 'bar') {
    chartConfig.options.scales = {
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { size: 10 } } },
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
    }
  }
  if (config.type === 'line') {
    chartConfig.options.scales = {
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { size: 10 } } },
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
    }
    chartConfig.data.datasets[0].borderColor = colors[0]
    chartConfig.data.datasets[0].backgroundColor = colors[0] + '22'
    chartConfig.data.datasets[0].fill = true
    chartConfig.data.datasets[0].tension = 0.3
    chartConfig.data.datasets[0].pointRadius = 3
  }

  try {
    currentChart = new Chart(ctx, chartConfig)
  } catch (err) {
    console.error('Chart error:', err)
  }

  messagesEl.scrollTop = messagesEl.scrollHeight
}

/* ── Send handler ─────────────────────────────────────────────── */
async function handleSend() {
  const text = inputEl.value.trim()
  if (!text) return

  addMessage('user', marked(text))
  inputEl.value = ''
  setInputEnabled(false)

  const { hasData: loaded, data } = updateStatus()
  if (!loaded) {
    addMessage('bot',
      '📂 No data available. Please use the <a href="/import" style="color:var(--accent)">Import</a> page to upload your portfolio data (Excel, CSV, or JSON), then come back to ask questions.'
    )
    setInputEnabled(true)
    return
  }

  if (!modelLoaded && !modelCancelled) {
    modelOverlay.classList.add('active')
    const ok = await loadModel((pct, status) => {
      modelProgressBar.style.width = `${pct}%`
      modelStatus.textContent = status || `${pct}%`
    })
    modelOverlay.classList.remove('active')
    if (!ok) {
      addMessage('bot',
        '⚠️ Could not load the AI model. This may be because:<br>' +
        '• WebGPU is not supported in your browser (try Chrome/Edge)<br>' +
        '• The model download failed<br><br>' +
        'The chat still works with portfolio data, but AI responses are unavailable.'
      )
      setInputEnabled(true)
      return
    }
    addMessage('bot', '✅ AI model loaded! Ask me anything about your portfolio.')
    setInputEnabled(true)
    return
  }

  showTyping()
  await askLLM(text, data)
  hideTyping()
  setInputEnabled(true)
}

/* ── Init ─────────────────────────────────────────────────────── */
function init() {
  // Load Chart.js dynamically
  const script = document.createElement('script')
  script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js'
  script.onload = () => {
    const { hasData } = updateStatus()
    addWelcome()
    if (hasData) setInputEnabled(true)
  }
  script.onerror = () => {
    updateStatus()
    addMessage('bot', '⚠️ Chart library failed to load. Text responses will still work.')
    setInputEnabled(true)
  }
  document.head.appendChild(script)

  // Load theme
  applyTheme()

  // Events
  sendBtn.addEventListener('click', handleSend)
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  })
  modelCancelBtn.addEventListener('click', () => {
    modelCancelled = true
    modelOverlay.classList.remove('active')
    setInputEnabled(true)
  })

  // Watch localStorage changes
  window.addEventListener('storage', (e) => {
    if (e.key === 'gwp:data:v1') updateStatus()
  })
}

function applyTheme() {
  try {
    const raw = localStorage.getItem('gwp:data:v1')
    if (!raw) return
    const data = JSON.parse(raw)
    const theme = data.preferences?.theme
    if (theme === 'dark') document.documentElement.classList.add('dark')
    else if (theme === 'light') document.documentElement.classList.remove('dark')
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.classList.add('dark')
  } catch {}
}

document.addEventListener('DOMContentLoaded', init)
