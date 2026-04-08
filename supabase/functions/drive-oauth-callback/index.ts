import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  deleteAppConfigKey,
  getAppConfigValue,
  setAppConfig,
} from "../_shared/driveAccess.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function htmlRedirect(target: string, message: string) {
  const esc = JSON.stringify(target)
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Drive</title>
    <script>location.replace(${esc});</script>
    </head><body><p>${message}</p><p><a href=${esc}>Continuar</a></p></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders } },
  )
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  const sbUrl = Deno.env.get("SUPABASE_URL")!
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const frontendBase = (Deno.env.get("DRIVE_OAUTH_FRONTEND_URL") ?? Deno.env.get("FRONTEND_URL") ?? "").replace(/\/$/, "")

  try {
    const url = new URL(req.url)
    const err = url.searchParams.get("error")
    const errDesc = url.searchParams.get("error_description") ?? ""
    if (err) {
      if (frontendBase) {
        return htmlRedirect(
          `${frontendBase}/drying-invoices?drive_error=${encodeURIComponent(errDesc || err)}`,
          "Error al conectar Google",
        )
      }
      return new Response(
        `<!DOCTYPE html><html><body><p>OAuth: ${errDesc || err}</p><p>Configura DRIVE_OAUTH_FRONTEND_URL para volver a la app.</p></body></html>`,
        { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
      )
    }

    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")
    if (!code || !state) {
      return new Response(JSON.stringify({ error: "Faltan code o state" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const pendingRaw = await getAppConfigValue(sbUrl, sbKey, "drive_oauth_pending")
    if (!pendingRaw) {
      return new Response(JSON.stringify({ error: "Sesión OAuth expirada. Vuelve a iniciar conexión desde la app." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    let pending: { s?: string; e?: number }
    try {
      pending = JSON.parse(pendingRaw)
    } catch {
      return new Response(JSON.stringify({ error: "Estado OAuth inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (pending.s !== state || !pending.e || Date.now() > pending.e) {
      return new Response(JSON.stringify({ error: "State OAuth no coincide o expiró" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")?.trim()
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")?.trim()
    const redirectUri = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI")?.trim()
    if (!clientId || !clientSecret || !redirectUri) {
      return new Response(JSON.stringify({ error: "OAuth no configurado en el servidor" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    })

    const tokenJson = await tokenRes.json()
    if (!tokenRes.ok) {
      console.error("Token exchange:", tokenJson)
      return new Response(JSON.stringify({ error: tokenJson.error_description || tokenJson.error || "Token exchange failed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const refreshToken = tokenJson.refresh_token as string | undefined
    if (!refreshToken) {
      return new Response(
        JSON.stringify({
          error:
            "Google no devolvió refresh_token. Prueba de nuevo; si persiste, en la pantalla de Google elige la cuenta y acepta de nuevo, o revoca el acceso de la app en myaccount.google.com/permissions y reconecta.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const accessToken = tokenJson.access_token as string
    let email = ""
    const ui = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (ui.ok) {
      const u = await ui.json()
      email = String(u.email ?? "")
    }

    await setAppConfig(sbUrl, sbKey, "google_drive_oauth_refresh_token", refreshToken)
    if (email) await setAppConfig(sbUrl, sbKey, "google_drive_oauth_email", email)
    await deleteAppConfigKey(sbUrl, sbKey, "drive_oauth_pending")

    if (!frontendBase) {
      return new Response(
        `<!DOCTYPE html><html><body><h1>Drive conectado</h1><p>${email || "OK"}</p><p>Configura DRIVE_OAUTH_FRONTEND_URL en Supabase para redirigir a la app.</p></body></html>`,
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
      )
    }

    return htmlRedirect(
      `${frontendBase}/drying-invoices?drive_connected=1`,
      "Google Drive conectado. Redirigiendo…",
    )
  } catch (e) {
    console.error("drive-oauth-callback:", e)
    const msg = encodeURIComponent((e as Error).message)
    if (frontendBase) {
      return htmlRedirect(`${frontendBase}/drying-invoices?drive_error=${msg}`, "Error")
    }
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
