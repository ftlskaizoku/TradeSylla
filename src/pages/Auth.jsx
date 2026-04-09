import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authHelpers } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import { toast } from '@/components/ui/toast'
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, TrendingUp } from 'lucide-react'

// ── Google icon ───────────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

// ── Microsoft icon ────────────────────────────────────────────────────────────
function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 21 21" width="18" height="18">
      <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
    </svg>
  )
}

// ── Input field ───────────────────────────────────────────────────────────────
function Field({ label, type = 'text', value, onChange, placeholder, icon: Icon, suffix }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            <Icon size={15} style={{ color: 'var(--text-muted)' }} />
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-11 rounded-xl text-sm border transition-colors outline-none"
          style={{
            background: 'var(--bg-elevated)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
            paddingLeft: Icon ? '2.5rem' : '0.875rem',
            paddingRight: suffix ? '2.5rem' : '0.875rem',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--accent)'}
          onBlur={e  => e.target.style.borderColor = 'var(--border)'}
        />
        {suffix && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{suffix}</div>
        )}
      </div>
    </div>
  )
}

// ── OAuth button ──────────────────────────────────────────────────────────────
function OAuthBtn({ icon, label, onClick, loading }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex-1 flex items-center justify-center gap-2.5 h-11 rounded-xl text-sm font-medium border transition-all hover:opacity-80"
      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)', opacity: loading ? 0.6 : 1 }}
    >
      {icon}
      {label}
    </button>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SIGN IN
// ══════════════════════════════════════════════════════════════════════════════
function SignIn({ switchTo }) {
  const navigate   = useNavigate()
  const { user }   = useUser()
  const [email,    setEmail]    = useState(() => localStorage.getItem('ts_saved_email') || '')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [rememberMe,  setRememberMe]  = useState(() => localStorage.getItem('ts_remember') === '1')
  const [oauthLoading, setOauthLoading] = useState('')

  // Navigate as soon as auth state confirms user is logged in
  useEffect(() => {
    if (user) navigate('/Dashboard', { replace: true })
  }, [user])

  const handleSignIn = async () => {
    if (!email || !password) { toast.error('Please fill in all fields'); return }
    setLoading(true)
    const { error } = await authHelpers.signIn(email, password, rememberMe)
    setLoading(false)
    if (error) { toast.error(error.message); return }
    // Save remember-me preference and email
    if (rememberMe) {
      localStorage.setItem('ts_remember', '1')
      localStorage.setItem('ts_saved_email', email)
    } else {
      localStorage.removeItem('ts_remember')
      localStorage.removeItem('ts_saved_email')
    }
    toast.success('Welcome back!')
    // Navigation handled by useEffect watching user state above
  }

  const handleGoogle = async () => {
    setOauthLoading('google')
    const { error } = await authHelpers.signInGoogle()
    if (error) { toast.error(error.message); setOauthLoading('') }
  }

  const handleMicrosoft = async () => {
    setOauthLoading('microsoft')
    const { error } = await authHelpers.signInMicrosoft()
    if (error) { toast.error(error.message); setOauthLoading('') }
  }

  return (
    <div className="space-y-5">
      {/* OAuth first — biggest conversion */}
      <div className="space-y-3">
        <div className="flex gap-3">
          <OAuthBtn icon={<GoogleIcon/>} label="Continue with Google"
            onClick={handleGoogle} loading={oauthLoading === 'google'} />
        </div>
        <div className="flex gap-3">
          <OAuthBtn icon={<MicrosoftIcon/>} label="Continue with Microsoft"
            onClick={handleMicrosoft} loading={oauthLoading === 'microsoft'} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: 'var(--border)' }}/>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>or sign in with email</span>
        <div className="flex-1 h-px" style={{ background: 'var(--border)' }}/>
      </div>

      <div className="space-y-4">
        <Field label="Email" type="email" value={email} onChange={setEmail}
          placeholder="you@example.com" icon={Mail} />
        <Field label="Password" type={showPass ? 'text' : 'password'}
          value={password} onChange={setPassword} placeholder="••••••••" icon={Lock}
          suffix={
            <button onClick={() => setShowPass(s => !s)} style={{ color: 'var(--text-muted)' }}>
              {showPass ? <EyeOff size={15}/> : <Eye size={15}/>}
            </button>
          }
        />
      </div>

      <div className="flex items-center justify-between">
        {/* Remember me */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            onClick={() => setRememberMe(v => !v)}
            className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all"
            style={{
              background:   rememberMe ? 'var(--accent)' : 'transparent',
              border:       `2px solid ${rememberMe ? 'var(--accent)' : 'var(--border-light)'}`,
              cursor:       'pointer',
            }}>
            {rememberMe && (
              <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Remember me</span>
        </label>
        <button onClick={() => switchTo('forgot')} className="text-xs hover:opacity-70"
          style={{ color: 'var(--accent)' }}>
          Forgot password?
        </button>
      </div>

      <button onClick={handleSignIn} disabled={loading}
        className="w-full h-11 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all"
        style={{ background: 'linear-gradient(135deg,var(--accent),var(--accent-secondary))', opacity: loading ? 0.7 : 1 }}>
        {loading ? 'Signing in...' : <><span>Sign In</span><ArrowRight size={15}/></>}
      </button>

      <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
        No account?{' '}
        <button onClick={() => switchTo('signup')} className="font-semibold hover:opacity-70"
          style={{ color: 'var(--accent)' }}>
          Create one free
        </button>
        {' · '}
        <a href="/pricing" className="font-semibold hover:opacity-70"
          style={{ color: 'var(--text-muted)' }}>
          See plans
        </a>
      </p>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SIGN UP
// ══════════════════════════════════════════════════════════════════════════════
function SignUp({ switchTo }) {
  const navigate    = useNavigate()
  const [name,      setName]      = useState('')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [password2, setPassword2] = useState('')
  const [showPass,  setShowPass]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [oauthLoading, setOauthLoading] = useState('')

  const handleSignUp = async () => {
    if (!name || !email || !password) { toast.error('Please fill in all fields'); return }
    if (password !== password2) { toast.error('Passwords do not match'); return }
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setLoading(true)
    const { error } = await authHelpers.signUp(email, password, name)
    setLoading(false)
    if (error) { toast.error(error.message); return }
    toast.success('Account created! Check your email to confirm.')
    switchTo('signin')
  }

  const handleGoogle = async () => {
    setOauthLoading('google')
    const { error } = await authHelpers.signInGoogle()
    if (error) { toast.error(error.message); setOauthLoading('') }
  }

  const handleMicrosoft = async () => {
    setOauthLoading('microsoft')
    const { error } = await authHelpers.signInMicrosoft()
    if (error) { toast.error(error.message); setOauthLoading('') }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3.5">
        <Field label="Full Name" value={name} onChange={setName}
          placeholder="Your name" icon={User} />
        <Field label="Email" type="email" value={email} onChange={setEmail}
          placeholder="you@example.com" icon={Mail} />
        <Field label="Password" type={showPass ? 'text' : 'password'}
          value={password} onChange={setPassword} placeholder="Min. 8 characters" icon={Lock}
          suffix={
            <button onClick={() => setShowPass(s => !s)} style={{ color: 'var(--text-muted)' }}>
              {showPass ? <EyeOff size={15}/> : <Eye size={15}/>}
            </button>
          }
        />
        <Field label="Confirm Password" type={showPass ? 'text' : 'password'}
          value={password2} onChange={setPassword2} placeholder="Repeat password" icon={Lock} />
      </div>

      {/* Password strength */}
      {password.length > 0 && (
        <div className="space-y-1">
          <div className="flex gap-1">
            {[8,12,16].map(n => (
              <div key={n} className="flex-1 h-1 rounded-full transition-colors"
                style={{ background: password.length >= n ? 'var(--accent-success)' : 'var(--bg-elevated)' }}/>
            ))}
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {password.length < 8 ? 'Too short' : password.length < 12 ? 'Good' : 'Strong'}
          </p>
        </div>
      )}

      <button onClick={handleSignUp} disabled={loading}
        className="w-full h-11 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2"
        style={{ background: 'linear-gradient(135deg,var(--accent),var(--accent-secondary))', opacity: loading ? 0.7 : 1 }}>
        {loading ? 'Creating account...' : <><span>Create Account</span><ArrowRight size={15}/></>}
      </button>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: 'var(--border)' }}/>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>or continue with</span>
        <div className="flex-1 h-px" style={{ background: 'var(--border)' }}/>
      </div>

      <div className="flex gap-3">
        <OAuthBtn icon={<GoogleIcon/>} label="Google"
          onClick={handleGoogle} loading={oauthLoading === 'google'} />
        <OAuthBtn icon={<MicrosoftIcon/>} label="Microsoft"
          onClick={handleMicrosoft} loading={oauthLoading === 'microsoft'} />
      </div>

      <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
        Already have an account?{' '}
        <button onClick={() => switchTo('signin')} className="font-semibold hover:opacity-70"
          style={{ color: 'var(--accent)' }}>
          Sign In
        </button>
      </p>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// FORGOT PASSWORD
// ══════════════════════════════════════════════════════════════════════════════
function ForgotPassword({ switchTo }) {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)

  const handleReset = async () => {
    if (!email) { toast.error('Enter your email'); return }
    setLoading(true)
    const { error } = await authHelpers.resetPassword(email)
    setLoading(false)
    if (error) { toast.error(error.message); return }
    setSent(true)
  }

  return (
    <div className="space-y-5">
      {!sent ? (
        <>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Enter your email and we'll send you a reset link.
          </p>
          <Field label="Email" type="email" value={email} onChange={setEmail}
            placeholder="you@example.com" icon={Mail} />
          <button onClick={handleReset} disabled={loading}
            className="w-full h-11 rounded-xl font-semibold text-sm text-white"
            style={{ background: 'linear-gradient(135deg,var(--accent),var(--accent-secondary))', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </>
      ) : (
        <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(46,213,115,0.08)', border: '1px solid rgba(46,213,115,0.2)' }}>
          <p className="font-semibold" style={{ color: 'var(--accent-success)' }}>Email sent!</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Check your inbox for the reset link.</p>
        </div>
      )}
      <button onClick={() => switchTo('signin')} className="w-full text-sm hover:opacity-70"
        style={{ color: 'var(--text-muted)' }}>
        ← Back to Sign In
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN AUTH PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function Auth() {
  const [view, setView] = useState('signin') // signin | signup | forgot

  const titles = {
    signin: { h: 'Welcome back',        sub: 'Sign in to your TradeSylla account' },
    signup: { h: 'Create your account', sub: 'Start your professional trading journal' },
    forgot: { h: 'Reset password',      sub: 'We\'ll email you a reset link' },
  }

  const t = titles[view]

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-primary)' }}>
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-96 flex-shrink-0 p-10"
        style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}>
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,var(--accent),var(--accent-secondary))' }}>
            <TrendingUp size={20} className="text-white"/>
          </div>
          <span className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>TradeSylla</span>
        </div>

        {/* Features */}
        <div className="space-y-6">
          {[
            { icon: '📊', title: 'Smart Trade Journal',     desc: 'Log, track and analyse every trade with full detail.' },
            { icon: '🧠', title: 'SYLLEDGE AI Coach',       desc: 'Get personalised feedback on your trading patterns.' },
            { icon: '📈', title: 'Advanced Analytics',      desc: 'Win rate, drawdown, session breakdown and more.' },
            { icon: '🔄', title: 'MT5 Auto-Sync',           desc: 'Connect your broker and trades sync automatically.' },
          ].map(f => (
            <div key={f.title} className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                style={{ background: 'var(--bg-elevated)' }}>
                {f.icon}
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{f.title}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          © 2025 TradeSylla · Your data, your privacy
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,var(--accent),var(--accent-secondary))' }}>
              <TrendingUp size={16} className="text-white"/>
            </div>
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>TradeSylla</span>
          </div>

          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{t.h}</h1>
          <p className="text-sm mb-7" style={{ color: 'var(--text-muted)' }}>{t.sub}</p>

          {view === 'signin'  && <SignIn  switchTo={setView} />}
          {view === 'signup'  && <SignUp  switchTo={setView} />}
          {view === 'forgot'  && <ForgotPassword switchTo={setView} />}
        </div>
      </div>
    </div>
  )
}
