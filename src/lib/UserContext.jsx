import React, { createContext, useState, useContext, useEffect } from "react"
import { localUser } from "@/api/localStore"

const UserContext = createContext()

export const UserProvider = ({ children }) => {
  const [user, setUserState] = useState(null)

  useEffect(() => {
    const profile = localUser.getOrCreate({ full_name: "Trader", email: "" })
    setUserState(profile)
  }, [])

  const updateUser = (data) => {
    const updated = localUser.set(data)
    setUserState(updated)
    return updated
  }

  return (
    <UserContext.Provider value={{ user, updateUser }}>
      {children}
    </UserContext.Provider>
  )
}

export const useUser = () => {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error("useUser must be used inside UserProvider")
  return ctx
}
