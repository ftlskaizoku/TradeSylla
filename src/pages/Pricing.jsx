import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useUser } from "@/lib/UserContext"
import {
  Check, X, Zap, Shield, Brain, BarChart3, TrendingUp,
  Users, Star, ArrowRight, Sparkles, Crown
} from "lucide-react"

// ─── Plan data ────────────────────────────────────────────────────────────────
const PLANS = [
  {
    id: "free",
    name: "Free",
    price: { monthly: 0, yearly: 0 },
    description: "Perfect to get started",
    color: "#6c63ff",
    icon: TrendingUp,
    badge: null,
    features: [
      { text: "Up to 50 trades/month",        ok: true  },
      { text: "Journal & calendar view",       ok: true  },
      { text: "Basic analytics",               ok: true  },
      { text: "1 playbook strategy",           ok: true  },
      { text: "CSV import (up to 100 rows)",   ok: true  },
      { text: "Community support",             ok: true  },
      { text: "SYLLEDGE AI coaching",          ok: false },
      { text: "Per-trade AI feedback",         ok: false },
      { text: "Unlimited trades",              ok: false },
      { text: "Advanced analytics",            ok: false },
      { text: "Backtesting engine",            ok: false },
      { text: "MT5 / Meta API sync",           ok: false },
      { text: "Multi-device real-time sync",   ok: false },
    ],
    cta: "Get Started Free",
    ctaStyle: "border",
  },
  {
    id: "pro",
    name: "Pro",
    price: { monthly: 19, yearly: 14 },
    description: "For serious traders",
    color: "#6c63ff",
    icon: Brain,
    badge: "Most Popular",
    features: [
      { text: "Unlimited trades",              ok: true  },
      { text: "Full journal & calendar",       ok: true  },
      { text: "Advanced analytics & charts",   ok: true  },
      { text: "Unlimited playbook strategies", ok: true  },
      { text: "Unlimited CSV import",          ok: true  },
      { text: "SYLLEDGE AI coaching",          ok: true  },
      { text: "Per-trade AI feedback",         ok: true  },
      { text: "Backtesting engine",            ok: true  },
      { text: "MT5 / Meta API auto-sync",      ok: true  },
      { text: "Real-time multi-device sync",   ok: true  },
      { text: "Custom color themes",           ok: true  },
      { text: "Priority email support",        ok: true  },
      { text: "White-label export (PDF)",      ok: false },
    ],
    cta: "Start 7-Day Free Trial",
    ctaStyle: "gradient",
  },
  {
    id: "elite",
    name: "Elite",
    price: { monthly: 49, yearly: 39 },
    description: "For prop firms & professionals",
    color: "#ffa502",
    icon: Crown,
    badge: "Best Value",
    features: [
      { text: "Everything in Pro",             ok: true  },
      { text: "White-label PDF exports",       ok: true  },
      { text: "Team accounts (up to 5)",       ok: true  },
      { text: "Dedicated account manager",     ok: true  },
      { text: "Custom AI persona",             ok: true  },
      { text: "Prop firm performance reports", ok: true  },
      { text: "Priority 24/7 support",         ok: true  },
      { text: "Early access to new features",  ok: true  },
      { text: "API access (coming soon)",       ok: true  },
      { text: "Custom integrations",           ok: true  },
      { text: "SLA guarantee",                 ok: true  },
      { text: "Custom onboarding session",     ok: true  },
      { text: "Unlimited everything",          ok: true  },
    ],
    cta: "Contact Sales",
    ctaStyle: "gold",
  },
]

const FAQS = [
  { q: "Can I switch plans anytime?", a: "Yes — upgrade or downgrade instantly. Downgrades take effect at the end of your billing cycle." },
  { q: "Do I need a credit card for the free plan?", a: "No. The free plan never requires a credit card. You only need one when upgrading to Pro or Elite." },
  { q: "What happens to my data if I downgrade?", a: "Your data is always safe. If you exceed the free plan limits, older trades will be read-only until you upgrade again." },
  { q: "Does the AI feedback use my own API key?", a: "Currently yes — SYLLEDGE AI uses your Anthropic API key added in Settings. A built-in key (no setup required) is coming in a future Pro update." },
  { q: "Is there a refund policy?", a: "Yes — if you're not satisfied within 14 days of your first paid payment, we'll refund you in full, no questions asked." },
]

// ─── Feature compare table ────────────────────────────────────────────────────
const COMPARE_ROWS = [
  { label: "Trades per month",  free: "50",         pro: "Unlimited",  elite: "Unlimited"  },
  { label: "Playbook strategies",free:"1",           pro: "Unlimited",  elite: "Unlimited"  },
  { label: "CSV import rows",   free: "100",         pro: "Unlimited",  elite: "Unlimited"  },
  { label: "Analytics",         free: "Basic",       pro: "Advanced",   elite: "Advanced"   },
  { label: "SYLLEDGE AI",       free: false,         pro: true,         elite: true         },
  { label: "Per-trade AI feedback",free:false,       pro: true,         elite: true         },
  { label: "Backtesting",       free: false,         pro: true,         elite: true         },
  { label: "MT5/Meta API sync", free: false,         pro: true,         elite: true         },
  { label: "Real-time sync",    free: false,         pro: true,         elite: true         },
  { label: "Team accounts",     free: false,         pro: false,        elite: "Up to 5"    },
  { label: "PDF exports",       free: false,         pro: false,        elite: true         },
  { label: "Support",           free: "Community",   pro: "Priority",   elite: "24/7 dedicated"},
]

function Cell({ val }) {
  if (val === true)  return <Check size={16} style={{ color:"var(--accent-success)" }} className="mx-auto"/>
  if (val === false) return <X    size={16} style={{ color:"var(--border-light)" }}   className="mx-auto"/>
  return <span className="text-xs font-medium" style={{ color:"var(--text-primary)" }}>{val}</span>
}

// ─── Main Pricing Page ────────────────────────────────────────────────────────
export default function Pricing() {
  const [billing, setBilling] = useState("monthly")
  const navigate = useNavigate()
  const { user } = useUser()

  const handleCTA = (plan) => {
    if (plan.id === "free") {
      navigate(user ? "/Dashboard" : "/auth")
    } else if (plan.id === "elite") {
      window.open("mailto:hello@tradesylla.com?subject=Elite Plan Inquiry", "_blank")
    } else {
      // Pro — coming soon toast / redirect to checkout
      navigate(user ? "/Settings" : "/auth")
    }
  }

  return (
    <div className="min-h-screen" style={{ background:"var(--bg-primary)" }}>
      {/* Nav bar */}
      <div className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background:"linear-gradient(135deg,#6c63ff,#00d4aa)" }}>
            <TrendingUp size={15} className="text-white"/>
          </div>
          <span className="font-bold" style={{ color:"var(--text-primary)" }}>TRADE<span style={{ color:"var(--accent)" }}>SYLLA</span></span>
        </div>
        <button onClick={()=>navigate(user?"/Dashboard":"/auth")}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border"
          style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
          {user ? "Go to Dashboard" : "Sign In"} <ArrowRight size={13}/>
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-24">
        {/* Hero */}
        <div className="text-center pt-12 pb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold mb-5"
            style={{ background:"rgba(108,99,255,0.1)", color:"var(--accent)", border:"1px solid rgba(108,99,255,0.2)" }}>
            <Sparkles size={12}/> Simple, transparent pricing
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-4" style={{ color:"var(--text-primary)" }}>
            Invest in your
            <span style={{ background:"linear-gradient(135deg,#6c63ff,#00d4aa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}> trading edge</span>
          </h1>
          <p className="text-lg max-w-xl mx-auto" style={{ color:"var(--text-muted)" }}>
            Start free. Upgrade when your trading demands more.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-3 mt-8 p-1 rounded-xl" style={{ background:"var(--bg-elevated)" }}>
            {["monthly","yearly"].map(b => (
              <button key={b} onClick={()=>setBilling(b)}
                className="px-5 py-2 rounded-lg text-sm font-semibold transition-all capitalize"
                style={{ background:billing===b?"var(--accent)":"transparent", color:billing===b?"#fff":"var(--text-muted)" }}>
                {b}
                {b==="yearly" && <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-md font-bold"
                  style={{ background:"rgba(46,213,115,0.2)", color:"var(--accent-success)" }}>-25%</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-16">
          {PLANS.map(plan => {
            const price = billing==="yearly" ? plan.price.yearly : plan.price.monthly
            const isPro = plan.id === "pro"
            return (
              <div key={plan.id} className="rounded-2xl flex flex-col relative"
                style={{ background:"var(--bg-card)", border:`2px solid ${isPro?"var(--accent)":"var(--border)"}`,
                  transform: isPro?"scale(1.02)":"scale(1)", boxShadow: isPro?"0 0 40px rgba(108,99,255,0.15)":"none" }}>

                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold text-white"
                    style={{ background: isPro?"var(--accent)":"linear-gradient(135deg,#ffa502,#ff6b35)" }}>
                    {plan.badge}
                  </div>
                )}

                <div className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ background:`${plan.color}18` }}>
                      <plan.icon size={17} style={{ color:plan.color }}/>
                    </div>
                    <h3 className="font-bold text-lg" style={{ color:"var(--text-primary)" }}>{plan.name}</h3>
                  </div>
                  <p className="text-sm mb-5" style={{ color:"var(--text-muted)" }}>{plan.description}</p>

                  <div className="mb-5">
                    <span className="text-4xl font-black" style={{ color:"var(--text-primary)" }}>
                      {price === 0 ? "Free" : `$${price}`}
                    </span>
                    {price > 0 && <span className="text-sm ml-1" style={{ color:"var(--text-muted)" }}>/mo</span>}
                    {billing==="yearly" && price > 0 && (
                      <p className="text-xs mt-0.5" style={{ color:"var(--accent-success)" }}>Billed yearly · save ${(plan.price.monthly - plan.price.yearly)*12}/yr</p>
                    )}
                  </div>

                  <button onClick={()=>handleCTA(plan)}
                    className="w-full h-11 rounded-xl text-sm font-bold mb-6 transition-all"
                    style={
                      plan.ctaStyle==="gradient" ? { background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))", color:"#fff" } :
                      plan.ctaStyle==="gold"     ? { background:"linear-gradient(135deg,#ffa502,#ff6b35)", color:"#fff" } :
                      { background:"var(--bg-elevated)", border:"1px solid var(--border)", color:"var(--text-primary)" }
                    }>
                    {plan.cta}
                  </button>

                  <div className="space-y-2.5">
                    {plan.features.map((f,i)=>(
                      <div key={i} className="flex items-start gap-2.5">
                        <div className="flex-shrink-0 mt-0.5">
                          {f.ok
                            ? <Check size={14} style={{ color:"var(--accent-success)" }}/>
                            : <X    size={14} style={{ color:"var(--border-light)" }}/>}
                        </div>
                        <span className="text-xs" style={{ color:f.ok?"var(--text-secondary)":"var(--text-muted)" }}>{f.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Compare table */}
        <div className="rounded-2xl overflow-hidden mb-16" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <div className="px-6 py-5" style={{ borderBottom:"1px solid var(--border)" }}>
            <h2 className="font-bold text-xl" style={{ color:"var(--text-primary)" }}>Full feature comparison</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background:"var(--bg-elevated)", borderBottom:"1px solid var(--border)" }}>
                  <th className="px-6 py-3 text-left text-xs font-semibold" style={{ color:"var(--text-muted)", width:"40%" }}>Feature</th>
                  {["Free","Pro","Elite"].map(h=>(
                    <th key={h} className="px-4 py-3 text-center text-xs font-bold" style={{ color:h==="Pro"?"var(--accent)":"var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row,i)=>(
                  <tr key={i} style={{ borderBottom:"1px solid var(--border)", background:i%2===0?"transparent":"rgba(255,255,255,0.01)" }}>
                    <td className="px-6 py-3 text-xs font-medium" style={{ color:"var(--text-secondary)" }}>{row.label}</td>
                    <td className="px-4 py-3 text-center"><Cell val={row.free}/></td>
                    <td className="px-4 py-3 text-center"><Cell val={row.pro}/></td>
                    <td className="px-4 py-3 text-center"><Cell val={row.elite}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Social proof */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
          {[
            { n:"2,400+", label:"Traders signed up" },
            { n:"180K+",  label:"Trades logged" },
            { n:"4.9/5",  label:"Average rating" },
            { n:"94%",    label:"Would recommend" },
          ].map(s=>(
            <div key={s.label} className="rounded-2xl p-5 text-center" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
              <p className="text-2xl font-black" style={{ background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>{s.n}</p>
              <p className="text-xs mt-1" style={{ color:"var(--text-muted)" }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8" style={{ color:"var(--text-primary)" }}>Frequently asked questions</h2>
          <div className="space-y-3">
            {FAQS.map((f,i)=>(
              <div key={i} className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
                <p className="font-semibold text-sm mb-2" style={{ color:"var(--text-primary)" }}>{f.q}</p>
                <p className="text-sm" style={{ color:"var(--text-muted)" }}>{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
