// Transitional import path retained so the UI can be moved without touching every screen.
// Authentication and user data are backed by Firebase; Supabase is no longer used here.
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as firebaseSignOut,
  sendPasswordResetEmail, sendEmailVerification, updatePassword, updateProfile, onAuthStateChanged,
  GoogleAuthProvider, OAuthProvider, signInWithPopup,
} from "firebase/auth"
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
  query as firestoreQuery, where, orderBy, limit as firestoreLimit,
} from "firebase/firestore"
import { firebaseAuth, firebaseConfigured, firestore } from "@/lib/firebase"

const result = async (fn) => { try { return { data: await fn(), error: null } } catch (error) { return { data: null, error } } }
const authUser = (user) => user ? ({ ...user, id: user.uid, user_metadata: { full_name: user.displayName || "", avatar_url: user.photoURL || null }, created_at: user.metadata?.creationTime }) : null
const ensureProfile = async user => {
  if (!user) return
  const profileRef = doc(firestore, "users", user.uid, "profiles", user.uid)
  const existing = await getDoc(profileRef)
  if (existing.exists()) return
  await setDoc(profileRef, {
    id: user.uid,
    user_id: user.uid,
    email: user.email || "",
    full_name: user.displayName || user.email?.split("@")[0] || "Trader",
    avatar_url: user.photoURL || null,
    currency: "USD",
    created_at: user.metadata?.creationTime || new Date().toISOString(),
  }, { merge: true })
}
const collectionFor = (table, uid) => table === "sylledge_market_data"
  ? collection(firestore, table)
  : collection(firestore, "users", uid, table)

const auth = {
  async getSession() {
    const user = firebaseAuth.currentUser
    const session = user ? { user: authUser(user), access_token: await user.getIdToken() } : null
    return { data: { session }, error: null }
  },
  async getUser() { return { data: { user: authUser(firebaseAuth.currentUser) }, error: null } },
  onAuthStateChange(callback) {
    let first = true
    const unsubscribe = onAuthStateChanged(firebaseAuth, async user => {
      try { await ensureProfile(user) } catch (error) { console.error("Could not initialize Firebase profile:", error.message) }
      const session = user ? { user: authUser(user), access_token: await user.getIdToken() } : null
      callback(first ? "INITIAL_SESSION" : user ? "SIGNED_IN" : "SIGNED_OUT", session)
      first = false
    })
    return { data: { subscription: { unsubscribe } } }
  },
  async updateUser({ data = {}, password } = {}) {
    if (!firebaseConfigured) return { error: new Error("Firebase is not configured. Add the VITE_FIREBASE_* values first.") }
    const user = firebaseAuth.currentUser
    if (!user) return { error: new Error("You must be signed in") }
    try {
      if (password) await updatePassword(user, password)
      const profile = {}
      if (data.full_name || data.name) profile.displayName = data.full_name || data.name
      if (data.avatar_url || data.picture) profile.photoURL = data.avatar_url || data.picture
      if (Object.keys(profile).length) await updateProfile(user, profile)
      if (Object.keys(data).length) await setDoc(doc(firestore, "users", user.uid, "profiles", user.uid), data, { merge: true })
      return { data: { user: authUser(user) }, error: null }
    } catch (error) { return { data: null, error } }
  },
}

class Query {
  constructor(table) { this.table = table; this.filters = []; this.sort = null; this.max = null; this.op = "select"; this.payload = null; this.mode = "many" }
  select(columns = "*") { this.columns = columns; return this }
  eq(field, value) { this.filters.push([field, "eq", value]); return this }
  neq(field, value) { this.filters.push([field, "neq", value]); return this }
  gte(field, value) { this.filters.push([field, "gte", value]); return this }
  lte(field, value) { this.filters.push([field, "lte", value]); return this }
  gt(field, value) { this.filters.push([field, "gt", value]); return this }
  lt(field, value) { this.filters.push([field, "lt", value]); return this }
  is(field, value) { this.filters.push([field, "is", value]); return this }
  not(field, operator, value) { this.filters.push([field, `not_${operator}`, value]); return this }
  order(field, { ascending = true } = {}) { this.sort = [field, ascending]; return this }
  limit(n) { this.max = n; return this }
  range(a, b) { this.slice = [a, b]; return this }
  single() { this.mode = "single"; return this }
  maybeSingle() { this.mode = "maybe"; return this }
  insert(payload) { this.op = "insert"; this.payload = payload; return this }
  upsert(payload, { onConflict } = {}) { this.op = "upsert"; this.payload = payload; this.onConflict = onConflict; return this }
  update(payload) { this.op = "update"; this.payload = payload; return this }
  delete() { this.op = "delete"; return this }
  async execute() {
    try {
      if (!firebaseConfigured) throw new Error("Firebase is not configured. Add the VITE_FIREBASE_* values first.")
      const user = firebaseAuth.currentUser
      if (!user) throw new Error("Sign in to access your data")
      const coll = collectionFor(this.table, user.uid)
      let docs = []
      if (this.op === "select" || this.op === "update" || this.op === "delete" || this.op === "upsert") {
        const constraints = []
        for (const [field, op, value] of this.filters) {
          if (field === "user_id" && this.table !== "sylledge_market_data") continue
          const firestoreOp = ({ eq: "==", neq: "!=", gte: ">=", lte: "<=", gt: ">", lt: "<", is: "==", not_is: "!=" })[op]
          if (firestoreOp) constraints.push(where(field, firestoreOp, value))
        }
        if (this.sort) constraints.push(orderBy(this.sort[0], this.sort[1] ? "asc" : "desc"))
        if (this.max != null && !this.slice) constraints.push(firestoreLimit(this.max))
        const snap = await getDocs(constraints.length ? firestoreQuery(coll, ...constraints) : coll)
        docs = snap.docs.map(d => ({ ...d.data(), id: d.id }))
        docs = docs.filter(row => this.filters.every(([key, op, value]) => {
          const x = row[key]
          if (op === "eq") return x === value
          if (op === "neq") return x !== value
          if (op === "gte") return x >= value
          if (op === "lte") return x <= value
          if (op === "gt") return x > value
          if (op === "lt") return x < value
          if (op === "is") return x === value
          if (op === "not_is") return x !== value
          return true
        }))
      }
      if (this.op === "select") {
        if (this.sort) docs.sort((a, b) => (a[this.sort[0]] > b[this.sort[0]] ? 1 : a[this.sort[0]] < b[this.sort[0]] ? -1 : 0) * (this.sort[1] ? 1 : -1))
        if (this.slice) docs = docs.slice(this.slice[0], this.slice[1] + 1)
        if (this.max != null) docs = docs.slice(0, this.max)
        if (this.mode === "single") return { data: docs[0] || null, error: docs.length ? null : new Error("Record not found") }
        if (this.mode === "maybe") return { data: docs[0] || null, error: null }
        return { data: docs, error: null }
      }
      const rows = Array.isArray(this.payload) ? this.payload : this.payload ? [this.payload] : []
      if (this.op === "insert") {
        const added = []
        for (const row of rows) { const ref = await addDoc(coll, { ...row, user_id: user.uid, created_at: row.created_at || new Date().toISOString(), updated_at: new Date().toISOString() }); added.push({ ...row, user_id: user.uid, id: ref.id }) }
        return { data: this.mode === "single" ? added[0] : added, error: null }
      }
      if (this.op === "upsert") {
        const saved = []
        for (const row of rows) {
          const keys = (this.onConflict || "id").split(",")
          const old = docs.find(d => keys.every(k => d[k] === row[k]))
          const ref = old ? doc(coll, old.id) : row.id ? doc(coll, row.id) : doc(coll)
          await setDoc(ref, { ...row, user_id: user.uid, updated_at: new Date().toISOString(), ...(!old ? { created_at: row.created_at || new Date().toISOString() } : {}) }, { merge: true })
          saved.push({ ...row, id: ref.id, user_id: user.uid })
        }
        return { data: this.mode === "single" ? saved[0] : saved, error: null }
      }
      if (this.op === "update") {
        for (const row of docs) await updateDoc(doc(coll, row.id), { ...this.payload, updated_at: new Date().toISOString() })
        return { data: docs.map(row => ({ ...row, ...this.payload })), error: null }
      }
      if (this.op === "delete") {
        for (const row of docs) await deleteDoc(doc(coll, row.id))
        return { data: docs, error: null }
      }
      return { data: null, error: new Error("Unsupported Firestore operation") }
    } catch (error) { return { data: null, error } }
  }
  then(resolve, reject) { return this.execute().then(resolve, reject) }
}

export const supabase = {
  auth,
  from: (table) => new Query(table),
  async rpc(name) {
    if (!firebaseConfigured) return { data: null, error: new Error("Firebase is not configured. Add the VITE_FIREBASE_* values first.") }
    if (["get_market_symbols", "get_synced_symbols"].includes(name)) {
      try {
        const snap = await getDocs(collection(firestore, "market_symbols"))
        const rows = snap.docs.map(d => d.data())
        const data = name === "get_synced_symbols"
          ? rows.map(row => ({ symbol: row.symbol, timeframe: row.timeframe, candle_count: row.candle_count || 0 }))
          : [...new Set(rows.map(row => row.symbol))].sort()
        return { data, error: null }
      } catch (error) { return { data: null, error } }
    }
    return { data: null, error: new Error(`RPC ${name} must be moved to a trusted Firebase function`) }
  },
  channel: () => ({ on() { return this }, subscribe(cb) { cb?.("SUBSCRIBED"); return this } }),
  removeChannel: () => Promise.resolve(),
}

const safe = async fn => { try { if (!firebaseConfigured) throw new Error("Firebase is not configured. Add the VITE_FIREBASE_* values first."); return { data: await fn(), error: null } } catch (error) { return { data: null, error } } }
export const authHelpers = {
  signUp: async (email, password, fullName) => safe(async () => {
    const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password)
    if (fullName) await updateProfile(credential.user, { displayName: fullName })
    await setDoc(doc(firestore, "users", credential.user.uid, "profiles", credential.user.uid), { id: credential.user.uid, user_id: credential.user.uid, email, full_name: fullName || "", created_at: new Date().toISOString() }, { merge: true })
    await sendEmailVerification(credential.user)
    return credential
  }),
  signIn: (email, password) => safe(() => signInWithEmailAndPassword(firebaseAuth, email, password)),
  signInGoogle: () => safe(() => signInWithPopup(firebaseAuth, new GoogleAuthProvider())),
  signInMicrosoft: () => safe(() => signInWithPopup(firebaseAuth, new OAuthProvider("microsoft.com"))),
  signOut: () => safe(() => firebaseSignOut(firebaseAuth)),
  resetPassword: (email) => safe(() => sendPasswordResetEmail(firebaseAuth, email)),
  getSession: () => auth.getSession(),
  getUser: () => auth.getUser(),
  onAuthStateChange: cb => auth.onAuthStateChange(cb),
  updatePassword: password => safe(() => updatePassword(firebaseAuth.currentUser, password)),
}
