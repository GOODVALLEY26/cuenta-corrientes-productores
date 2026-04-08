import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"
import { getAppConfigValue } from "../_shared/driveAccess.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Se requiere sesión iniciada" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Sesión no válida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const sbUrl = Deno.env.get("SUPABASE_URL")!
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    const refreshToken = await getAppConfigValue(sbUrl, sbKey, "google_drive_oauth_refresh_token")
    const oauthEmail = await getAppConfigValue(sbUrl, sbKey, "google_drive_oauth_email")
    const saB64 = await getAppConfigValue(sbUrl, sbKey, "google_sa_b64")

    let serviceAccountEmail: string | null = null
    if (saB64) {
      try {
        const saJson = new TextDecoder().decode(Uint8Array.from(atob(saB64), (c) => c.charCodeAt(0)))
        const sa = JSON.parse(saJson) as { client_email?: string }
        serviceAccountEmail = sa.client_email ?? null
      } catch {
        /* ignore */
      }
    }

    const oauthClientConfigured = !!(
      Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")?.trim() &&
      Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")?.trim() &&
      Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI")?.trim()
    )

    const oauthConnected = !!refreshToken
    const serviceAccountConfigured = !!serviceAccountEmail

    const authMode: "oauth" | "service_account" | "none" = oauthConnected
      ? "oauth"
      : serviceAccountConfigured
      ? "service_account"
      : "none"

    const connectedEmail = oauthConnected
      ? (oauthEmail || "Cuenta Google conectada")
      : (serviceAccountEmail || "")

    return new Response(
      JSON.stringify({
        authMode,
        connectedEmail,
        oauthConnected,
        oauthClientConfigured,
        serviceAccountConfigured,
        /** @deprecated usar connectedEmail */
        serviceAccountEmail: serviceAccountEmail ?? undefined,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  } catch (error) {
    console.error("drive-service-account-email:", error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
