import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect } from "react"

/** Set once this browser has been switched to Ukrainian, so a later choice sticks. */
const MARKER = "admin-default-language"

/**
 * Opens the admin in Ukrainian.
 *
 * The dashboard reads its language from the `lng` cookie, then localStorage,
 * and on first start writes whatever it detected there, English by default.
 * So "nothing stored yet" never happens, and a marker of our own records that
 * the switch was made. On the first visit this widget, which sits on the login
 * page, stores "uk" and reloads once; a language picked afterwards under
 * Settings → Profile is left alone.
 */
const DefaultLanguage = () => {
  useEffect(() => {
    if (window.localStorage.getItem(MARKER)) {
      return
    }
    window.localStorage.setItem(MARKER, "1")
    window.localStorage.setItem("lng", "uk")
    document.cookie = "lng=uk; path=/; max-age=31536000; SameSite=Lax"
    window.location.reload()
  }, [])

  return null
}

export const config = defineWidgetConfig({
  zone: "login.before",
})

export default DefaultLanguage
