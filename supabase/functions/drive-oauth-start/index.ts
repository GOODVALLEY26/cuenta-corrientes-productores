import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"
import { setAppConfig } from "../_shared/driveAccess.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const SCOPE = "https://www.googleapis.com/auth/drive.readonly"

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Se requiere sesión" }), {
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

    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")?.trim()
    const redirectUri = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI")?.trim()
    if (!clientId || !redirectUri) {
      return new Response(
        JSON.stringify({
          error:
            "Falta configurar en Supabase (secrets de la función): GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_REDIRECT_URI",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const state = crypto.randomUUID()
    const sbUrl = Deno.env.get("SUPABASE_URL")!
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    await setAppConfig(
      sbUrl,
      sbKey,
      "drive_oauth_pending",
      JSON.stringify({ s: state, e: Date.now() + 15 * 60 * 1000, uid: user.id }),
    )

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    })

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (e) {
    console.error("drive-oauth-start:", e)
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
