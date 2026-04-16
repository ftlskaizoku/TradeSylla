// src/pages/Notebook.jsx — Daily Trading Journal
// Per-day pre-market plan, post-market review, mindset, discipline, trade summary
// Requires: daily_notes table (run daily_notes.sql migration)

import { useState, useEffect, useCallback, useRef } from "react"
import { Link, useSearchParams, useNavigate } from "react-router-dom"
import { createPageUrl } from "@/utils"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import { useLanguage } from "@/lib/LanguageContext"
import { Trade } from "@/api/supabaseStore"
import {
  ChevronLeft, ChevronRight, Calendar, BookOpen,
  TrendingUp, TrendingDown, Target, Brain, Zap,
  Save, CheckCircle, BarChart2, Sun, Sunset, Moon
} from "lucide-react"

// ─── Constants ────────────────────────────────────────────────────────────────
const MINDSET_OPTS = [
  { value:1, emoji:"😤", label:"Frustrated" },
  { value:2, emoji:"😟", label:"Anxious" },
  { value:3, emoji:"😐", label:"Neutral" },
  { value:4, emoji:"😊", label:"Focused" },
  { value:5, emoji:"🔥", label:"In the Zone" },
]

const BIAS_OPTS = [
  { value:"bullish",  label:"Bullish",  color:"var(--accent-success)" },
  { value:"bearish",  label:"Bearish",  color:"var(--accent-danger)" },
  { value:"neutral",  label:"Neutral",  color:"var(--text-muted)" },
  { value:"ranging",  label:"Ranging",  color:"var(--accent-warning)" },
]

const DISCIPLINE_LABELS = ["", "Poor", "Below Avg", "Average", "Good", "Excellent"]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toDateKey(date) {
  return date.toISOString().slice(0, 10)
}

function fmtDateLong(dateStr) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday:"long", year:"numeric", month:"long", day:"numeric"
  })
}

function fmtTime(iso) {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", hour12:false })
}

// ─── Auto-save hook ───────────────────────────────────────────────────────────
function useAutoSave(fn, delay = 1200) {
  const timerRef = useRef(null)
  return useCallback((...args) => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ icon: Icon, title, color, children }) {
  return (
    <div className="rounded-2xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background:`${color}18` }}>
          <Icon size={14} style={{ color }}/>
        </div>
        <h3 className="font-semibold text-sm" style={{ color:"var(--text-primary)" }}>{title}</h3>
      </div>
      {children}
    </div>
  )
}

// ─── Textarea with auto-resize ────────────────────────────────────────────────
function NoteArea({ value, onChange, placeholder, minRows = 4 }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto"
      ref.current.style.height = ref.current.scrollHeight + "px"
    }
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={minRows}
      className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none transition-colors"
      style={{
        background:"var(--bg-elevated)", border:"1px solid var(--border)",
        color:"var(--text-primary)", lineHeight:1.7, minHeight: minRows * 28,
        fontFamily:"var(--font-body)",
      }}
      onFocus={e => e.target.style.borderColor = "var(--accent)"}
      onBlur={e  => e.target.style.borderColor = "var(--border)"}
    />
  )
}

// ─── Trade mini row ───────────────────────────────────────────────────────────
function TradeMiniRow({ trade }) {
  const pnl = parseFloat(trade.pnl) || 0
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-xl"
      style={{ background:"var(--bg-elevated)" }}>
      <span className="font-bold text-xs" style={{ color:"var(--accent)", fontFamily:"var(--font-mono)", minWidth:56 }}>
        {trade.symbol}
      </span>
      <span className="px-1.5 py-0.5 rounded text-xs font-semibold"
        style={{ background:trade.direction==="BUY"?"rgba(46,213,115,0.12)":"rgba(255,71,87,0.12)",
          color:trade.direction==="BUY"?"var(--accent-success)":"var(--accent-danger)" }}>
        {trade.direction==="BUY"?"▲":"▼"} {trade.direction}
      </span>
      <span className="text-xs" style={{ color:"var(--text-muted)", fontFamily:"var(--font-mono)" }}>
        {fmtTime(trade.entry_time)}
      </span>
      <span className="ml-auto font-bold text-xs"
        style={{ color:pnl>=0?"var(--accent-success)":"var(--accent-danger)", fontFamily:"var(--font-mono)" }}>
        {pnl>=0?"+":""}${pnl.toFixed(2)}
      </span>
      <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold"
        style={{ background:trade.outcome==="WIN"?"rgba(46,213,115,0.12)":"rgba(255,71,87,0.12)",
          color:trade.outcome==="WIN"?"var(--accent-success)":"var(--accent-danger)" }}>
        {trade.outcome}
      </span>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
// ─── Month Mini Calendar (shows which days have notes/trades) ────────────────
function MonthMiniCal({ dateStr, onSelectDate, monthNoteDates, dayTradesMap }) {
  const [d] = dateStr.split("-")
  const date   = new Date(dateStr + "T12:00:00")
  const year   = date.getFullYear()
  const month  = date.getMonth()
  const today  = new Date().toISOString().slice(0, 10)
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"]
  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const prevMonth = () => {
    const d = new Date(year, month - 1, 1)
    onSelectDate(d.toISOString().slice(0, 10))
  }
  const nextMonth = () => {
    const d = new Date(year, month + 1, 1)
    const today = new Date()
    if (d <= today) onSelectDate(d.toISOString().slice(0, 10))
  }
  const isCurrentMonth = year === new Date().getFullYear() && month === new Date().getMonth()

  return (
    <div className="rounded-2xl p-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
      {/* Month header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1 rounded-lg hover:opacity-70" style={{ color:"var(--text-secondary)" }}>
          <ChevronLeft size={14}/>
        </button>
        <p className="text-xs font-bold" style={{ color:"var(--text-primary)" }}>
          {MONTHS[month]} {year}
        </p>
        <button onClick={nextMonth} disabled={isCurrentMonth} className="p-1 rounded-lg hover:opacity-70 disabled:opacity-30" style={{ color:"var(--text-secondary)" }}>
          <ChevronRight size={14}/>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs font-semibold" style={{ color:"var(--text-muted)", fontSize:9 }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDay }, (_, i) => (
          <div key={`empty-${i}`}/>
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day   = i + 1
          const key   = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`
          const isToday    = key === today
          const isSelected = key === dateStr
          const hasNote    = monthNoteDates.has(key)
          const hasTrades  = dayTradesMap && (dayTradesMap[key]?.length || 0) > 0
          const isFuture   = key > today

          return (
            <button key={key}
              onClick={() => !isFuture && onSelectDate(key)}
              disabled={isFuture}
              className="relative flex flex-col items-center justify-center rounded-lg transition-all"
              style={{
                height: 28,
                background: isSelected ? "var(--accent)" : isToday ? "rgba(108,99,255,0.15)" : "transparent",
                color: isSelected ? "#fff" : isFuture ? "var(--text-muted)" : "var(--text-primary)",
                fontSize: 10, fontWeight: isSelected || isToday ? 700 : 400,
                opacity: isFuture ? 0.3 : 1,
                cursor: isFuture ? "default" : "pointer",
              }}>
              {day}
              {/* Dots for note / trades */}
              <div className="flex gap-0.5 absolute bottom-0.5">
                {hasNote    && <div className="w-1 h-1 rounded-full" style={{ background: isSelected ? "rgba(255,255,255,0.8)" : "var(--accent)" }}/>}
                {hasTrades  && <div className="w-1 h-1 rounded-full" style={{ background: isSelected ? "rgba(255,255,255,0.8)" : "var(--accent-success)" }}/>}
              </div>
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 pt-2" style={{ borderTop:"1px solid var(--border)" }}>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background:"var(--accent)" }}/>
          <span className="text-xs" style={{ color:"var(--text-muted)", fontSize:9 }}>Note</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background:"var(--accent-success)" }}/>
          <span className="text-xs" style={{ color:"var(--text-muted)", fontSize:9 }}>Trades</span>
        </div>
      </div>
    </div>
  )
}

export default function Notebook() {
  const { user } = useUser()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // If navigated from Journal calendar with ?date=YYYY-MM-DD, open that date
  const initialDate = searchParams.get("date") || toDateKey(new Date())
  const [dateStr,   setDateStr]  = useState(initialDate)
  const [monthNoteDates, setMonthNoteDates] = useState(new Set())  // dates with notes
  const [showMiniCal, setShowMiniCal] = useState(false)

  // Build a map of date -> trades for the mini calendar
  const [allTrades, setAllTrades] = useState([])
  useEffect(() => {
    Trade.list().then(d => setAllTrades(d||[]))
  }, [])

  // Load recent notes for the history panel
  const [recentNotes, setRecentNotes] = useState([])
  const [notesLoading, setNotesLoading] = useState(false)
  useEffect(() => {
    if (!user?.id) return
    setNotesLoading(true)
    supabase.from("daily_notes")
      .select("date,pre_market,post_market,discipline,mindset,lessons")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        setRecentNotes((data||[]).filter(n =>
          n.pre_market || n.post_market || n.lessons
        ))
        setNotesLoading(false)
      })
  }, [user?.id, saved])  // refresh when saved
  const [dayTrades, setDayTrades]= useState([])
  const [saving,    setSaving]   = useState(false)
  const [saved,     setSaved]    = useState(false)
  const [loading,   setLoading]  = useState(true)

  // Note fields
  const [preMarket,   setPreMarket]   = useState("")
  const [bias,        setBias]        = useState("")
  const [watchlist,   setWatchlist]   = useState("")
  const [postMarket,  setPostMarket]  = useState("")
  const [lessons,     setLessons]     = useState("")
  const [mindset,     setMindset]     = useState(3)
  const [discipline,  setDiscipline]  = useState(3)
  const [goals,       setGoals]       = useState("")
  const [mistakes,    setMistakes]    = useState("")

  // ── Derived day stats ───────────────────────────────────────────────────────
  const dayPnl   = dayTrades.reduce((s,t) => s + (parseFloat(t.pnl)||0), 0)
  const dayWins  = dayTrades.filter(t => t.outcome==="WIN").length
  const dayWR    = dayTrades.length ? (dayWins/dayTrades.length*100).toFixed(0) : 0
  const isToday  = dateStr === toDateKey(new Date())
  const dayTradesMap = allTrades.reduce((acc, t) => {
    if (!t.entry_time) return acc
    const key = t.entry_time.slice(0, 10)
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})

  // ── Load note for date ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    setLoading(true)
    setPreMarket(""); setBias(""); setWatchlist("")
    setPostMarket(""); setLessons(""); setGoals(""); setMistakes("")
    setMindset(3); setDiscipline(3); setSaved(false)

    const loadNote = async () => {
      // Always reset fields first — prevents previous day bleeding into new day
      setPreMarket(""); setBias(""); setWatchlist("")
      setPostMarket(""); setLessons(""); setMindset(3)
      setDiscipline(3); setGoals(""); setMistakes("")

      // Load journal entry
      const { data, error } = await supabase
        .from("daily_notes")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", dateStr)
        .maybeSingle()  // Use maybeSingle() — returns null instead of error when no row

      if (data) {
        setPreMarket(data.pre_market  || "")
        setBias(data.bias             || "")
        setWatchlist(data.watchlist   || "")
        setPostMarket(data.post_market|| "")
        setLessons(data.lessons       || "")
        setMindset(data.mindset       || 3)
        setDiscipline(data.discipline || 3)
        setGoals(data.goals           || "")
        setMistakes(data.mistakes     || "")
      }
      // else: no note for this day — fields already reset above

      // Load trades for this day
      const all = await Trade.list()
      const forDay = (all || []).filter(t => {
        if (!t.entry_time) return false
        return t.entry_time.slice(0, 10) === dateStr
      })
      setDayTrades(forDay)
      setLoading(false)
    }
    loadNote()
  }, [dateStr, user?.id])

  // Load which days this month have notes (for the date nav badge indicator)
  useEffect(() => {
    if (!user?.id || !dateStr) return
    const [year, month] = dateStr.split("-")
    const from = `${year}-${month}-01`
    const to   = `${year}-${month}-31`
    supabase.from("daily_notes").select("date")
      .eq("user_id", user.id).gte("date", from).lte("date", to)
      .then(({ data }) => {
        setMonthNoteDates(new Set((data||[]).map(r => r.date)))
      })
  }, [dateStr.slice(0,7), user?.id])

  // ── Save note ───────────────────────────────────────────────────────────────
  const saveNote = useCallback(async (fields) => {
    if (!user?.id) return
    setSaving(true)
    const { error } = await supabase.from("daily_notes").upsert({
      user_id:     user.id,
      date:        dateStr,
      pre_market:  fields.preMarket  ?? preMarket,
      bias:        fields.bias       ?? bias,
      watchlist:   fields.watchlist  ?? watchlist,
      post_market: fields.postMarket ?? postMarket,
      lessons:     fields.lessons    ?? lessons,
      mindset:     fields.mindset    ?? mindset,
      discipline:  fields.discipline ?? discipline,
      goals:       fields.goals      ?? goals,
      mistakes:    fields.mistakes   ?? mistakes,
    }, { onConflict: "user_id,date" })
    setSaving(false)
    if (error) {
      console.error("Notebook save error:", error.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }, [user?.id, dateStr, preMarket, bias, watchlist, postMarket, lessons, mindset, discipline, goals, mistakes])

  const autoSave = useAutoSave(saveNote, 1000)

  const handleField = (setter, fieldKey) => (val) => {
    setter(val)
    autoSave({ [fieldKey]: val })
  }

  // ── Navigation ──────────────────────────────────────────────────────────────
  const goDay = (delta) => {
    const d = new Date(dateStr + "T12:00:00")
    d.setDate(d.getDate() + delta)
    setDateStr(toDateKey(d))
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor:"var(--accent)" }}/>
    </div>
  )

  return (
    <div style={{ maxWidth:1100, margin:"0 auto" }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color:"var(--text-primary)", fontFamily:"var(--font-display)" }}>
            {t("notebook_title")}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-sm" style={{ color:"var(--text-muted)" }}>{fmtDateLong(dateStr)}</p>
            {monthNoteDates.size > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ background:"rgba(108,99,255,0.1)", color:"var(--accent)" }}>
                {monthNoteDates.size} note{monthNoteDates.size!==1?"s":""} this month
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Save status */}
          {saved && (
            <span className="flex items-center gap-1.5 text-xs" style={{ color:"var(--accent-success)" }}>
              <CheckCircle size={12}/> Saved
            </span>
          )}
          {saving && (
            <span className="text-xs" style={{ color:"var(--text-muted)" }}>Saving…</span>
          )}

          {/* Date nav */}
          <div className="flex items-center gap-1 rounded-xl p-1" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            <button onClick={() => goDay(-1)}
              className="p-2 rounded-lg hover:opacity-70 transition-opacity"
              style={{ color:"var(--text-secondary)" }}>
              <ChevronLeft size={15}/>
            </button>
            <button onClick={() => setDateStr(toDateKey(new Date()))}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background:isToday?"var(--accent)":"transparent", color:isToday?"#fff":"var(--text-secondary)" }}>
              Today
            </button>
            <button onClick={() => setShowMiniCal(c => !c)}
              className="p-2 rounded-lg hover:opacity-70 transition-opacity"
              title="Month calendar"
              style={{ color: showMiniCal ? "var(--accent)" : "var(--text-secondary)" }}>
              <Calendar size={15}/>
            </button>
            <button
              onClick={() => {
                // Show a small popover with the month's noted days
                const d = new Date(dateStr + "T12:00:00")
                d.setDate(d.getDate() + 1)
                if (d <= new Date()) setDateStr(toDateKey(d))
              }}
              disabled={isToday}
              className="p-2 rounded-lg hover:opacity-70 transition-opacity disabled:opacity-30"
              style={{ color:"var(--text-secondary)" }}>
              <ChevronRight size={15}/>
            </button>
          </div>

          {/* Manual save */}
          <button onClick={() => saveNote({})}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))" }}>
            <Save size={13}/> {t("save")}
          </button>
        </div>
      </div>

      {/* ── Month mini calendar (toggled by calendar button) ─────────────── */}
      {showMiniCal && (
        <div className="mb-4 max-w-xs">
          <MonthMiniCal
            dateStr={dateStr}
            onSelectDate={(d) => { setDateStr(d); setShowMiniCal(false) }}
            monthNoteDates={monthNoteDates}
            dayTradesMap={dayTradesMap}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Left: Journal content (2/3) ──────────────────────────────────── */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          {/* Pre-market plan */}
          <Section icon={Sun} title={t("notebook_premarket")} color="var(--accent-warning)">
            <div className="flex flex-col gap-4">
              {/* Market bias */}
              <div>
                <p className="text-xs font-medium mb-2" style={{ color:"var(--text-muted)" }}>Market Bias</p>
                <div className="flex gap-2 flex-wrap">
                  {BIAS_OPTS.map(b => (
                    <button key={b.value} onClick={() => { setBias(b.value); autoSave({ bias: b.value }) }}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                      style={{
                        background: bias===b.value ? `${b.color}20` : "var(--bg-elevated)",
                        color:      bias===b.value ? b.color : "var(--text-muted)",
                        border:     `1px solid ${bias===b.value ? b.color + "60" : "var(--border)"}`,
                      }}>
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Watchlist */}
              <div>
                <p className="text-xs font-medium mb-2" style={{ color:"var(--text-muted)" }}>Symbols to Watch</p>
                <input value={watchlist}
                  onChange={e => handleField(setWatchlist, "watchlist")(e.target.value)}
                  placeholder="XAUUSD, UK100, EURUSD…"
                  className="w-full h-9 rounded-xl px-4 text-sm border outline-none"
                  style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}
                  onFocus={e => e.target.style.borderColor="var(--accent)"}
                  onBlur={e  => e.target.style.borderColor="var(--border)"}/>
              </div>

              {/* Plan */}
              <div>
                <p className="text-xs font-medium mb-2" style={{ color:"var(--text-muted)" }}>Trading Plan & Key Levels</p>
                <NoteArea value={preMarket} onChange={handleField(setPreMarket, "preMarket")}
                  placeholder="What setups am I looking for today? Key levels, news events, session focus…" minRows={5}/>
              </div>

              {/* Daily goals */}
              <div>
                <p className="text-xs font-medium mb-2" style={{ color:"var(--text-muted)" }}>Goals for Today</p>
                <NoteArea value={goals} onChange={handleField(setGoals, "goals")}
                  placeholder="Max loss limit, target setups, habits to maintain…" minRows={3}/>
              </div>
            </div>
          </Section>

          {/* Post-market review */}
          <Section icon={Sunset} title={t("notebook_postmarket")} color="var(--accent-secondary)">
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-xs font-medium mb-2" style={{ color:"var(--text-muted)" }}>How did the day go?</p>
                <NoteArea value={postMarket} onChange={handleField(setPostMarket, "postMarket")}
                  placeholder="What happened today? Did the market respect key levels? Any surprises?" minRows={5}/>
              </div>
              <div>
                <p className="text-xs font-medium mb-2" style={{ color:"var(--text-muted)" }}>Lessons Learned</p>
                <NoteArea value={lessons} onChange={handleField(setLessons, "lessons")}
                  placeholder="What would I do differently? What confirmed my edge today?" minRows={3}/>
              </div>
              <div>
                <p className="text-xs font-medium mb-2" style={{ color:"var(--text-muted)" }}>Mistakes to Fix</p>
                <NoteArea value={mistakes} onChange={handleField(setMistakes, "mistakes")}
                  placeholder="Any rule breaks, emotional decisions, or execution errors…" minRows={3}/>
              </div>
            </div>
          </Section>

          {/* Mindset & Discipline */}
          <Section icon={Brain} title={t("notebook_mindset")} color="var(--accent)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Mindset */}
              <div>
                <p className="text-xs font-medium mb-3" style={{ color:"var(--text-muted)" }}>
                  Mental State — <span style={{ color:"var(--text-primary)" }}>{MINDSET_OPTS.find(m=>m.value===mindset)?.label}</span>
                </p>
                <div className="flex gap-2">
                  {MINDSET_OPTS.map(m => (
                    <button key={m.value} onClick={() => { setMindset(m.value); autoSave({ mindset: m.value }) }}
                      className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-all"
                      style={{
                        background: mindset===m.value ? "rgba(108,99,255,0.15)" : "var(--bg-elevated)",
                        border:     `1px solid ${mindset===m.value ? "rgba(108,99,255,0.4)" : "var(--border)"}`,
                        transform:  mindset===m.value ? "scale(1.08)" : "scale(1)",
                      }}>
                      <span style={{ fontSize:20 }}>{m.emoji}</span>
                      <span className="text-xs" style={{ color: mindset===m.value ? "var(--accent)" : "var(--text-muted)", fontSize:9 }}>
                        {m.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Discipline */}
              <div>
                <p className="text-xs font-medium mb-3" style={{ color:"var(--text-muted)" }}>
                  Rule Discipline — <span style={{ color:"var(--text-primary)" }}>{DISCIPLINE_LABELS[discipline]}</span>
                </p>
                <div className="flex gap-1.5">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => { setDiscipline(n); autoSave({ discipline: n }) }}
                      className="flex-1 h-10 rounded-xl text-sm font-bold transition-all"
                      style={{
                        background: n<=discipline
                          ? n<=2 ? "rgba(255,71,87,0.2)"
                          : n===3 ? "rgba(255,165,2,0.2)"
                          : "rgba(46,213,115,0.2)"
                          : "var(--bg-elevated)",
                        color: n<=discipline
                          ? n<=2 ? "var(--accent-danger)"
                          : n===3 ? "var(--accent-warning)"
                          : "var(--accent-success)"
                          : "var(--text-muted)",
                        border: `1px solid ${n<=discipline ? "transparent" : "var(--border)"}`,
                      }}>
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs" style={{ color:"var(--accent-danger)", fontSize:9 }}>Poor</span>
                  <span className="text-xs" style={{ color:"var(--accent-success)", fontSize:9 }}>Excellent</span>
                </div>
              </div>
            </div>
          </Section>
        </div>

        {/* ── Right: Day summary (1/3) ──────────────────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Day P&L stats */}
          <div className="rounded-2xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 size={14} style={{ color:"var(--accent)" }}/>
              <h3 className="font-semibold text-sm" style={{ color:"var(--text-primary)" }}>Day Summary</h3>
            </div>

            {dayTrades.length === 0 ? (
              <div className="text-center py-6">
                <Calendar size={28} className="mx-auto mb-2" style={{ color:"var(--text-muted)" }}/>
                <p className="text-sm" style={{ color:"var(--text-muted)" }}>No trades this day</p>
              </div>
            ) : (
              <>
                {/* P&L big display */}
                <div className="text-center py-4 rounded-xl mb-4"
                  style={{ background: dayPnl>=0 ? "rgba(46,213,115,0.08)" : "rgba(255,71,87,0.08)",
                    border:`1px solid ${dayPnl>=0?"rgba(46,213,115,0.2)":"rgba(255,71,87,0.2)"}` }}>
                  <p className="text-3xl font-black" style={{
                    color: dayPnl>=0 ? "var(--accent-success)" : "var(--accent-danger)",
                    fontFamily:"var(--font-mono)"
                  }}>
                    {dayPnl>=0?"+":""}${dayPnl.toFixed(2)}
                  </p>
                  <p className="text-xs mt-1" style={{ color:"var(--text-muted)" }}>Day P&L</p>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[
                    { label:"Trades",  value: dayTrades.length, color:"var(--accent)" },
                    { label:"Win Rate", value:`${dayWR}%`, color:parseInt(dayWR)>=50?"var(--accent-success)":"var(--accent-danger)" },
                    { label:"Wins",    value:`${dayWins}W/${dayTrades.length-dayWins}L`, color:"var(--text-secondary)" },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl p-2.5 text-center"
                      style={{ background:"var(--bg-elevated)" }}>
                      <p className="font-bold text-sm" style={{ color:s.color, fontFamily:"var(--font-mono)" }}>{s.value}</p>
                      <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Trade list */}
                <div className="flex flex-col gap-1.5">
                  {dayTrades.map(t => <TradeMiniRow key={t.id} trade={t}/>)}
                </div>
              </>
            )}
          </div>

          {/* Streak / mood history — last 7 days */}
          <div className="rounded-2xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            <div className="flex items-center gap-2 mb-3">
              <Zap size={14} style={{ color:"var(--accent-warning)" }}/>
              <h3 className="font-semibold text-sm" style={{ color:"var(--text-primary)" }}>
                Discipline — {DISCIPLINE_LABELS[discipline]}
              </h3>
            </div>
            <div className="flex gap-1.5 mt-2">
              {[1,2,3,4,5].map(n => (
                <div key={n} className="flex-1 rounded-lg"
                  style={{
                    height: 8,
                    background: n <= discipline
                      ? n<=2 ? "var(--accent-danger)"
                      : n===3 ? "var(--accent-warning)"
                      : "var(--accent-success)"
                      : "var(--bg-elevated)"
                  }}/>
              ))}
            </div>

            <div className="mt-4 pt-4" style={{ borderTop:"1px solid var(--border)" }}>
              <p className="text-xs font-medium mb-2" style={{ color:"var(--text-muted)" }}>Today's Mindset</p>
              <div className="flex items-center gap-3">
                <span style={{ fontSize:32 }}>{MINDSET_OPTS.find(m=>m.value===mindset)?.emoji}</span>
                <div>
                  <p className="font-semibold text-sm" style={{ color:"var(--text-primary)" }}>
                    {MINDSET_OPTS.find(m=>m.value===mindset)?.label}
                  </p>
                  <p className="text-xs" style={{ color:"var(--text-muted)" }}>Score {mindset}/5</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Notes History ──────────────────────────────────────────── */}
          <div className="rounded-2xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom:"1px solid var(--border)", background:"var(--bg-elevated)" }}>
              <div className="flex items-center gap-2">
                <BookOpen size={13} style={{ color:"var(--accent)" }}/>
                <p className="text-xs font-bold" style={{ color:"var(--text-primary)" }}>Recent Notes</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background:"rgba(108,99,255,0.1)", color:"var(--accent)" }}>
                {recentNotes.length}
              </span>
            </div>

            {notesLoading ? (
              <div className="p-4 flex items-center justify-center">
                <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor:"var(--accent)" }}/>
              </div>
            ) : recentNotes.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs" style={{ color:"var(--text-muted)" }}>No notes yet — write your first entry above</p>
              </div>
            ) : (
              <div className="divide-y" style={{ maxHeight:320, overflowY:"auto" }}>
                {recentNotes.map(note => {
                  const isActive = note.date === dateStr
                  const d = new Date(note.date + "T12:00:00")
                  const label = d.toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" })
                  const preview = note.post_market || note.pre_market || note.lessons || ""
                  return (
                    <button key={note.date}
                      onClick={() => setDateStr(note.date)}
                      className="w-full text-left px-4 py-3 transition-all hover:opacity-80"
                      style={{
                        background: isActive ? "rgba(108,99,255,0.08)" : "transparent",
                        borderBottom: "1px solid var(--border)"
                      }}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-bold" style={{ color: isActive ? "var(--accent)" : "var(--text-primary)" }}>
                          {label}
                        </p>
                        <div className="flex items-center gap-1.5">
                          {note.discipline > 0 && (
                            <span className="text-xs px-1.5 py-0.5 rounded"
                              style={{ background: note.discipline >= 7 ? "rgba(46,213,115,0.1)" : note.discipline >= 4 ? "rgba(255,165,2,0.1)" : "rgba(255,71,87,0.1)",
                                color: note.discipline >= 7 ? "var(--accent-success)" : note.discipline >= 4 ? "var(--accent-warning)" : "var(--accent-danger)",
                                fontSize: 9 }}>
                              D:{note.discipline}
                            </span>
                          )}
                          {isActive && (
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background:"var(--accent)" }}/>
                          )}
                        </div>
                      </div>
                      {preview && (
                        <p className="text-xs truncate" style={{ color:"var(--text-muted)" }}>
                          {preview.slice(0, 60)}{preview.length > 60 ? "…" : ""}
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Quick nav to Journal calendar for this day */}
          <Link to={`/Journal?view=calendar`}
            className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
            style={{ background:"rgba(108,99,255,0.08)", color:"var(--accent)", border:"1px solid rgba(108,99,255,0.2)" }}>
            <BookOpen size={14}/> View Full Journal
          </Link>
        </div>
      </div>
    </div>
  )
}
