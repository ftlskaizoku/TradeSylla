import { useState, useEffect } from "react"
import { Playbook as PlaybookEntity } from "@/api/supabaseStore"
import { toast } from "@/components/ui/toast"
import {
  Plus, Pencil, Trash2, X, ChevronDown, ChevronUp,
  Shield, Target, TrendingUp, Clock, BookOpen,
  CheckCircle, XCircle, AlertCircle, Zap, ImagePlus
} from "lucide-react"

// ─── Constants ────────────────────────────────────────────────────────────────
const SESSIONS   = ["LONDON","NEW_YORK","ASIAN","SYDNEY","ALL"]
const TIMEFRAMES = ["M1","M5","M15","M30","H1","H4","D1"]
const PAIRS      = ["EURUSD","GBPUSD","USDJPY","XAUUSD","AUDUSD","GBPJPY","USDCAD","NZDUSD","USDCHF","US30","NAS100","SPX500","ANY","CUSTOM"]
const CATEGORIES = ["Trend Following","Breakout","Reversal","Scalping","Swing","News","ICT/SMC","Price Action","Other"]

const STATUS_STYLE = {
  active:   { bg:"rgba(46,213,115,0.15)",  color:"var(--accent-success)", label:"Active" },
  testing:  { bg:"rgba(255,165,2,0.15)",   color:"var(--accent-warning)", label:"Testing" },
  retired:  { bg:"rgba(255,71,87,0.15)",   color:"var(--accent-danger)",  label:"Retired" },
}

// ─── Empty Form ───────────────────────────────────────────────────────────────
const EMPTY = {
  name: "", category: "Price Action", status: "active",
  description: "", custom_pairs: "",
  sessions: [], timeframes: [], pairs: [],
  entry_rules: [""],
  exit_rules:  [""],
  risk_rules:  [""],
  buy_rules:   [""],
  sell_rules:  [""],
  buy_images:  [],
  sell_images: [],
  notes: "",
  win_rate: "", profit_factor: "", avg_rr: "",
}

// ─── Multi-toggle helper ──────────────────────────────────────────────────────
function MultiToggle({ label, options, selected, onChange }) {
  const toggle = (val) => {
    if (selected.includes(val)) onChange(selected.filter(v=>v!==val))
    else onChange([...selected, val])
  }
  return (
    <div>
      <label className="text-xs mb-1.5 block" style={{ color:"var(--text-muted)" }}>{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o=>(
          <button key={o} type="button" onClick={()=>toggle(o)}
            className="px-2.5 py-1 rounded-lg text-xs font-medium border transition-all"
            style={{ background: selected.includes(o)?"var(--accent)":"var(--bg-primary)",
              borderColor: selected.includes(o)?"var(--accent)":"var(--border)",
              color: selected.includes(o)?"#fff":"var(--text-secondary)" }}>
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Dynamic Rule List ────────────────────────────────────────────────────────
function RuleList({ label, icon: Icon, color, rules, onChange }) {
  const update = (i, val) => { const r=[...rules]; r[i]=val; onChange(r) }
  const add    = () => onChange([...rules, ""])
  const remove = (i) => onChange(rules.filter((_,idx)=>idx!==i))
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} style={{ color }}/>
        <label className="text-xs font-semibold" style={{ color:"var(--text-muted)" }}>{label}</label>
      </div>
      <div className="space-y-1.5">
        {rules.map((r,i)=>(
          <div key={i} className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background:`${color}20`, color }}>{i+1}</div>
            <input value={r} onChange={e=>update(i,e.target.value)} placeholder={`Rule ${i+1}…`}
              className="flex-1 h-8 rounded-lg px-3 text-xs border" style={{ background:"var(--bg-primary)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
            {rules.length>1 && (
              <button type="button" onClick={()=>remove(i)} className="p-1 rounded hover:opacity-70" style={{ color:"var(--text-muted)" }}><X size={12}/></button>
            )}
          </div>
        ))}
        <button type="button" onClick={add} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border border-dashed transition-all hover:opacity-80"
          style={{ borderColor:"var(--border)", color:"var(--text-muted)" }}>
          <Plus size={11}/> Add rule
        </button>
      </div>
    </div>
  )
}


// ─── Playbook Image Uploader ──────────────────────────────────────────────────
function PlaybookImageUploader({ images, onChange }) {
  const add = (files) => {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith("image/")) return
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = { id: Date.now() + Math.random().toString(36).slice(2), name: file.name, url: e.target.result }
        onChange([...(images || []), img])
      }
      reader.readAsDataURL(file)
    })
  }
  const remove = (id) => onChange((images || []).filter(i => i.id !== id))

  return (
    <div className="space-y-2">
      {(images || []).map(img => (
        <div key={img.id} className="relative rounded-xl overflow-hidden group" style={{ maxHeight: 120 }}>
          <img src={img.url} alt={img.name} className="w-full object-cover rounded-xl" style={{ maxHeight: 120 }}/>
          <button type="button" onClick={() => remove(img.id)}
            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: "rgba(255,71,87,0.9)" }}>
            <X size={12} className="text-white"/>
          </button>
        </div>
      ))}
      <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed cursor-pointer hover:opacity-80 transition-opacity"
        style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        <ImagePlus size={14}/>
        <span className="text-xs">Add screenshot</span>
        <input type="file" accept="image/*" multiple className="hidden"
          onChange={e => { add(e.target.files); e.target.value = "" }}/>
      </label>
    </div>
  )
}

// ─── Playbook Form Modal ──────────────────────────────────────────────────────
function PlaybookModal({ open, onClose, onSaved, editItem }) {
  const [form, setForm]   = useState(EMPTY)
  const [saving, setSaving]= useState(false)
  const isEdit = !!editItem

  useEffect(()=>{
    if (editItem) {
      setForm({
        ...EMPTY, ...editItem,
        entry_rules: editItem.entry_rules?.length ? editItem.entry_rules : [""],
        exit_rules:  editItem.exit_rules?.length  ? editItem.exit_rules  : [""],
        risk_rules:  editItem.risk_rules?.length  ? editItem.risk_rules  : [""],
        buy_rules:   editItem.buy_rules?.length   ? editItem.buy_rules   : [""],
        sell_rules:  editItem.sell_rules?.length  ? editItem.sell_rules  : [""],
        buy_images:  editItem.buy_images  || [],
        sell_images: editItem.sell_images || [],
        sessions:    editItem.sessions    || [],
        timeframes:  editItem.timeframes  || [],
        pairs:       editItem.pairs       || [],
        custom_pairs: editItem.custom_pairs || "",
      })
    } else {
      setForm(EMPTY)
    }
  }, [editItem, open])

  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const save = async () => {
    if (!form.name.trim()) { toast.error("Strategy name is required"); return }
    setSaving(true)
    try {
      // Map "retired" → "inactive" to match DB constraint (active/inactive/testing)
      const dbStatus = form.status === "retired" ? "inactive" : (form.status || "active")
      // Only send fields that exist in the DB schema
      const payload = {
        name:          form.name.trim(),
        category:      form.category      || "Price Action",
        status:        dbStatus,
        description:   form.description   || "",
        custom_pairs:  form.custom_pairs  || "",
        sessions:      Array.isArray(form.sessions)   ? form.sessions   : [],
        timeframes:    Array.isArray(form.timeframes) ? form.timeframes : [],
        pairs:         Array.isArray(form.pairs)      ? form.pairs      : [],
        entry_rules:   (form.entry_rules  || []).filter(r => r && r.trim()),
        exit_rules:    (form.exit_rules   || []).filter(r => r && r.trim()),
        risk_rules:    (form.risk_rules   || []).filter(r => r && r.trim()),
        buy_rules:     (form.buy_rules    || []).filter(r => r && r.trim()),
        sell_rules:    (form.sell_rules   || []).filter(r => r && r.trim()),
        buy_images:    Array.isArray(form.buy_images)  ? form.buy_images  : [],
        sell_images:   Array.isArray(form.sell_images) ? form.sell_images : [],
        notes:         form.notes         || "",
        win_rate:      parseFloat(form.win_rate)      || null,
        profit_factor: parseFloat(form.profit_factor) || null,
        avg_rr:        parseFloat(form.avg_rr)        || null,
      }
      if (isEdit) { await PlaybookEntity.update(editItem.id, payload); toast.success("Strategy updated!") }
      else        { await PlaybookEntity.create(payload);              toast.success("Strategy added!") }
      onSaved(); onClose()
    } catch(err) {
      console.error("Playbook save error:", err)
      toast.error("Failed to save: " + (err?.message || "unknown error"))
    }
    setSaving(false)
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl z-10 max-h-[92vh] flex flex-col" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom:"1px solid var(--border)" }}>
          <h2 className="text-lg font-bold" style={{ color:"var(--text-primary)" }}>{isEdit?"Edit Strategy":"New Strategy"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70" style={{ color:"var(--text-secondary)" }}><X size={16}/></button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Name + Category + Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Strategy Name *</label>
              <input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. London Breakout"
                className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Category</label>
              <select value={form.category} onChange={e=>set("category",e.target.value)} className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
                {CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Status</label>
              <div className="flex gap-1.5">
                {["active","testing","retired"].map(s=>{
                  const st = STATUS_STYLE[s]
                  return (
                    <button key={s} type="button" onClick={()=>set("status",s)}
                      className="flex-1 h-9 rounded-lg text-xs font-semibold border transition-all"
                      style={{ background:form.status===s?st.bg:"var(--bg-elevated)", borderColor:form.status===s?st.color:"var(--border)", color:form.status===s?st.color:"var(--text-secondary)" }}>
                      {st.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Description</label>
            <textarea rows={2} value={form.description} onChange={e=>set("description",e.target.value)} placeholder="Brief overview of this strategy..."
              className="w-full rounded-lg px-3 py-2 text-sm border resize-none" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          </div>

          {/* Sessions, Timeframes, Pairs */}
          <div className="rounded-xl p-4" style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)" }}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <MultiToggle label="Sessions"   options={SESSIONS}   selected={form.sessions}   onChange={v=>set("sessions",v)}/>
              <MultiToggle label="Timeframes" options={TIMEFRAMES} selected={form.timeframes} onChange={v=>set("timeframes",v)}/>
              <MultiToggle label="Pairs"      options={PAIRS}      selected={form.pairs}      onChange={v=>set("pairs",v)}/>
            </div>
            {form.pairs.includes("CUSTOM") && (
              <div className="mt-3">
                <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Custom pairs/assets (comma separated)</label>
                <input value={form.custom_pairs} onChange={e=>set("custom_pairs",e.target.value)} placeholder="e.g. BTCUSD, ETHUSD, TSLA"
                  className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-primary)", borderColor:"var(--accent)", color:"var(--text-primary)" }}/>
              </div>
            )}
          </div>

          {/* General Rules */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <RuleList label="Entry Rules"  icon={TrendingUp}  color="#2ed573" rules={form.entry_rules} onChange={v=>set("entry_rules",v)}/>
            <RuleList label="Exit Rules"   icon={Target}      color="#ff4757" rules={form.exit_rules}  onChange={v=>set("exit_rules",v)}/>
            <RuleList label="Risk Rules"   icon={Shield}      color="#ffa502" rules={form.risk_rules}  onChange={v=>set("risk_rules",v)}/>
          </div>

          {/* Per-direction rules + images */}
          <div>
            <p className="text-xs font-semibold mb-3" style={{ color:"var(--text-muted)" }}>DIRECTION-SPECIFIC CONFLUENCES & SETUPS</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* BUY side */}
              <div className="rounded-xl p-4" style={{ background:"rgba(46,213,115,0.05)", border:"1px solid rgba(46,213,115,0.2)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold" style={{ background:"var(--accent-success)", color:"#fff" }}>▲</div>
                  <span className="text-sm font-bold" style={{ color:"var(--accent-success)" }}>LONG / BUY Confluences</span>
                </div>
                <RuleList label="" icon={TrendingUp} color="#2ed573" rules={form.buy_rules} onChange={v=>set("buy_rules",v)}/>
                <div className="mt-3">
                  <p className="text-xs mb-2" style={{ color:"var(--text-muted)" }}>Setup Screenshots</p>
                  <PlaybookImageUploader images={form.buy_images} onChange={v=>set("buy_images",v)}/>
                </div>
              </div>
              {/* SELL side */}
              <div className="rounded-xl p-4" style={{ background:"rgba(255,71,87,0.05)", border:"1px solid rgba(255,71,87,0.2)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold" style={{ background:"var(--accent-danger)", color:"#fff" }}>▼</div>
                  <span className="text-sm font-bold" style={{ color:"var(--accent-danger)" }}>SHORT / SELL Confluences</span>
                </div>
                <RuleList label="" icon={Target} color="#ff4757" rules={form.sell_rules} onChange={v=>set("sell_rules",v)}/>
                <div className="mt-3">
                  <p className="text-xs mb-2" style={{ color:"var(--text-muted)" }}>Setup Screenshots</p>
                  <PlaybookImageUploader images={form.sell_images} onChange={v=>set("sell_images",v)}/>
                </div>
              </div>
            </div>
          </div>

          {/* Performance targets */}
          <div>
            <label className="text-xs mb-2 block font-semibold" style={{ color:"var(--text-muted)" }}>Performance Targets (optional)</label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Target Win Rate %</label>
                <input type="number" step="0.1" min="0" max="100" value={form.win_rate} onChange={e=>set("win_rate",e.target.value)} placeholder="65"
                  className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Target Profit Factor</label>
                <input type="number" step="0.1" min="0" value={form.profit_factor} onChange={e=>set("profit_factor",e.target.value)} placeholder="1.5"
                  className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Target Avg R:R</label>
                <input type="number" step="0.1" min="0" value={form.avg_rr} onChange={e=>set("avg_rr",e.target.value)} placeholder="1.5"
                  className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Additional Notes</label>
            <textarea rows={3} value={form.notes} onChange={e=>set("notes",e.target.value)} placeholder="Psychology tips, market conditions, edge details..."
              className="w-full rounded-lg px-3 py-2 text-sm border resize-none" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 flex-shrink-0" style={{ borderTop:"1px solid var(--border)" }}>
          <button onClick={onClose} className="flex-1 h-9 rounded-lg text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-secondary)" }}>Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 h-9 rounded-lg text-sm font-semibold text-white"
            style={{ background:"linear-gradient(135deg,#6c63ff,#5a52d5)", opacity:saving?0.7:1 }}>
            {saving?"Saving...": isEdit?"Update Strategy":"Add Strategy"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Playbook Card ────────────────────────────────────────────────────────────
function PlaybookCard({ item, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const st = STATUS_STYLE[item.status] || STATUS_STYLE.active

  return (
    <div className="rounded-xl overflow-hidden card-hover" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
      {/* Card header */}
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:"rgba(108,99,255,0.15)" }}>
              <BookOpen size={18} style={{ color:"var(--accent)" }}/>
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base truncate" style={{ color:"var(--text-primary)" }}>{item.name}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs" style={{ color:"var(--text-muted)" }}>{item.category}</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background:st.bg, color:st.color }}>{st.label}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={()=>onEdit(item)} className="p-2 rounded-lg hover:opacity-70 transition-opacity" style={{ color:"var(--accent)" }}><Pencil size={14}/></button>
            <button onClick={()=>onDelete(item)} className="p-2 rounded-lg hover:opacity-70 transition-opacity" style={{ color:"var(--accent-danger)" }}><Trash2 size={14}/></button>
          </div>
        </div>

        {item.description && (
          <p className="text-sm mb-3 leading-relaxed" style={{ color:"var(--text-secondary)" }}>{item.description}</p>
        )}

        {/* Tags row */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(item.sessions||[]).map(s=>(
            <span key={s} className="px-2 py-0.5 rounded-full text-xs" style={{ background:"rgba(0,212,170,0.1)", color:"var(--accent-secondary)" }}>{s}</span>
          ))}
          {(item.timeframes||[]).map(tf=>(
            <span key={tf} className="px-2 py-0.5 rounded-full text-xs" style={{ background:"rgba(108,99,255,0.1)", color:"var(--accent)" }}>{tf}</span>
          ))}
          {(item.pairs||[]).map(p=>(
            <span key={p} className="px-2 py-0.5 rounded-full text-xs" style={{ background:"rgba(255,165,2,0.1)", color:"var(--accent-warning)" }}>{p}</span>
          ))}
        </div>

        {/* Performance targets */}
        {(item.win_rate || item.profit_factor || item.avg_rr) && (
          <div className="flex gap-4 mb-3">
            {item.win_rate     && <div className="text-center"><p className="text-xs" style={{ color:"var(--text-muted)" }}>Target WR</p><p className="text-sm font-bold" style={{ color:"var(--accent-success)" }}>{item.win_rate}%</p></div>}
            {item.profit_factor&& <div className="text-center"><p className="text-xs" style={{ color:"var(--text-muted)" }}>Target PF</p><p className="text-sm font-bold" style={{ color:"var(--accent)" }}>{item.profit_factor}</p></div>}
            {item.avg_rr       && <div className="text-center"><p className="text-xs" style={{ color:"var(--text-muted)" }}>Target R:R</p><p className="text-sm font-bold" style={{ color:"var(--accent-secondary)" }}>{item.avg_rr}</p></div>}
          </div>
        )}

        {/* Expand toggle */}
        <button onClick={()=>setExpanded(e=>!e)} className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70"
          style={{ color:"var(--accent)" }}>
          {expanded?"Hide rules":"Show rules"}
          {expanded?<ChevronUp size={13}/>:<ChevronDown size={13}/>}
        </button>
      </div>

      {/* Expanded rules */}
      {expanded && (
        <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3" style={{ borderTop:"1px solid var(--border)" }}>
          {/* Entry Rules */}
          {(item.entry_rules||[]).length>0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <CheckCircle size={13} style={{ color:"var(--accent-success)" }}/>
                <span className="text-xs font-semibold" style={{ color:"var(--accent-success)" }}>Entry Rules</span>
              </div>
              <ul className="space-y-1.5">
                {item.entry_rules.map((r,i)=>(
                  <li key={i} className="flex items-start gap-2 text-xs" style={{ color:"var(--text-secondary)" }}>
                    <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5" style={{ background:"rgba(46,213,115,0.15)", color:"var(--accent-success)" }}>{i+1}</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Exit Rules */}
          {(item.exit_rules||[]).length>0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <XCircle size={13} style={{ color:"var(--accent-danger)" }}/>
                <span className="text-xs font-semibold" style={{ color:"var(--accent-danger)" }}>Exit Rules</span>
              </div>
              <ul className="space-y-1.5">
                {item.exit_rules.map((r,i)=>(
                  <li key={i} className="flex items-start gap-2 text-xs" style={{ color:"var(--text-secondary)" }}>
                    <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5" style={{ background:"rgba(255,71,87,0.15)", color:"var(--accent-danger)" }}>{i+1}</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Risk Rules */}
          {(item.risk_rules||[]).length>0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <AlertCircle size={13} style={{ color:"var(--accent-warning)" }}/>
                <span className="text-xs font-semibold" style={{ color:"var(--accent-warning)" }}>Risk Rules</span>
              </div>
              <ul className="space-y-1.5">
                {item.risk_rules.map((r,i)=>(
                  <li key={i} className="flex items-start gap-2 text-xs" style={{ color:"var(--text-secondary)" }}>
                    <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5" style={{ background:"rgba(255,165,2,0.15)", color:"var(--accent-warning)" }}>{i+1}</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Notes */}
          {item.notes && (
            <div className="sm:col-span-3 mt-1">
              <p className="text-xs font-semibold mb-1" style={{ color:"var(--text-muted)" }}>Notes</p>
              <p className="text-xs leading-relaxed" style={{ color:"var(--text-secondary)" }}>{item.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────
function DeleteConfirm({ item, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel}/>
      <div className="relative rounded-2xl shadow-2xl p-6 w-full max-w-sm z-10" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <h3 className="text-base font-bold mb-2" style={{ color:"var(--text-primary)" }}>Delete Strategy?</h3>
        <p className="text-sm mb-5" style={{ color:"var(--text-muted)" }}>
          <strong style={{ color:"var(--text-primary)" }}>{item?.name}</strong> will be permanently removed.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 h-9 rounded-lg text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-secondary)" }}>Cancel</button>
          <button onClick={onConfirm} className="flex-1 h-9 rounded-lg text-sm font-semibold text-white" style={{ background:"var(--accent-danger)" }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Playbook Page ───────────────────────────────────────────────────────
export default function Playbook() {
  const [items,       setItems]       = useState([])
  const [modalOpen,   setModalOpen]   = useState(false)
  const [editItem,    setEditItem]    = useState(null)
  const [deleteItem,  setDeleteItem]  = useState(null)
  const [filterStatus,setFilterStatus]= useState("all")
  const [filterCat,   setFilterCat]   = useState("all")

  const load = async () => {
    try {
      const data = await PlaybookEntity.list()
      setItems((data || []).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)))
    } catch(e) { console.error("Playbook load:", e) }
  }
  useEffect(()=>{ load() }, [])

  const handleEdit   = (item) => { setEditItem(item); setModalOpen(true) }
  const handleDelete = async () => {
    if (!deleteItem) return
    await PlaybookEntity.delete(deleteItem.id)
    toast.success("Strategy deleted")
    setDeleteItem(null)
    load()
  }
  const openNew = () => { setEditItem(null); setModalOpen(true) }

  // Filters
  const categories = ["all", ...Array.from(new Set(items.map(i=>i.category))).filter(Boolean)]
  const filtered   = items.filter(i=>{
    if (filterStatus!=="all" && i.status!==filterStatus) return false
    if (filterCat!=="all"    && i.category!==filterCat)  return false
    return true
  })

  const statusCounts = {
    active:  items.filter(i=>i.status==="active").length,
    testing: items.filter(i=>i.status==="testing").length,
    retired: items.filter(i=>i.status==="retired").length,
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold" style={{ color:"var(--text-primary)" }}>Playbook</h1>
          <p className="text-sm mt-0.5" style={{ color:"var(--text-muted)" }}>
            {items.length} strateg{items.length!==1?"ies":"y"} · {statusCounts.active} active
          </p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white self-start"
          style={{ background:"linear-gradient(135deg,#6c63ff,#5a52d5)" }}>
          <Plus size={14}/> New Strategy
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label:"Active",  count:statusCounts.active,  color:"var(--accent-success)", bg:"rgba(46,213,115,0.1)",  icon:CheckCircle },
          { label:"Testing", count:statusCounts.testing, color:"var(--accent-warning)", bg:"rgba(255,165,2,0.1)",   icon:Zap },
          { label:"Retired", count:statusCounts.retired, color:"var(--accent-danger)",  bg:"rgba(255,71,87,0.1)",   icon:XCircle },
        ].map(s=>(
          <div key={s.label} className="rounded-xl p-4 flex items-center gap-3" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background:s.bg }}>
              <s.icon size={16} style={{ color:s.color }}/>
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color:s.color }}>{s.count}</p>
              <p className="text-xs" style={{ color:"var(--text-muted)" }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <div className="flex gap-1.5">
          {["all","active","testing","retired"].map(s=>{
            const st = STATUS_STYLE[s]
            return (
              <button key={s} onClick={()=>setFilterStatus(s)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize"
                style={{ background:filterStatus===s?(st?"var(--accent)":"var(--accent)"):"var(--bg-elevated)",
                  borderColor:filterStatus===s?(st?st.color:"var(--accent)"):"var(--border)",
                  color:filterStatus===s?"#fff":"var(--text-secondary)" }}>
                {s==="all"?"All Statuses":s.charAt(0).toUpperCase()+s.slice(1)}
              </button>
            )
          })}
        </div>
        {categories.length>1 && (
          <div className="flex flex-wrap gap-1.5">
            {categories.map(c=>(
              <button key={c} onClick={()=>setFilterCat(c)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
                style={{ background:filterCat===c?"rgba(108,99,255,0.2)":"var(--bg-elevated)", borderColor:filterCat===c?"var(--accent)":"var(--border)", color:filterCat===c?"var(--accent)":"var(--text-secondary)" }}>
                {c==="all"?"All Categories":c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cards grid */}
      {filtered.length===0 ? (
        <div className="rounded-2xl py-20 text-center" style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderStyle:"dashed" }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background:"rgba(108,99,255,0.1)" }}>
            <Shield size={26} style={{ color:"var(--accent)" }}/>
          </div>
          <p className="font-bold text-base mb-1" style={{ color:"var(--text-primary)" }}>
            {items.length===0 ? "No strategies yet" : "No strategies match filters"}
          </p>
          <p className="text-sm mb-5" style={{ color:"var(--text-muted)" }}>
            {items.length===0 ? "Document your trading strategies, rules, and edge." : "Try adjusting your filters."}
          </p>
          {items.length===0 && (
            <button onClick={openNew} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background:"linear-gradient(135deg,#6c63ff,#5a52d5)" }}>
              <Plus size={14}/> Add Your First Strategy
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item=>(
            <PlaybookCard key={item.id} item={item} onEdit={handleEdit} onDelete={setDeleteItem}/>
          ))}
        </div>
      )}

      {/* Modals */}
      <PlaybookModal open={modalOpen} onClose={()=>{setModalOpen(false);setEditItem(null)}} onSaved={load} editItem={editItem}/>
      {deleteItem && <DeleteConfirm item={deleteItem} onCancel={()=>setDeleteItem(null)} onConfirm={handleDelete}/>}
    </div>
  )
}
