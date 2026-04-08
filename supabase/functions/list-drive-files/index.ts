import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getDriveAccessToken } from "../_shared/driveAccess.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  let folderId: string | undefined
  let connectedEmail = ""
  let authMode: "oauth" | "service_account" = "service_account"

  try {
    const body = await req.text()
    console.log("Request body:", body)

    const sbUrl = Deno.env.get("SUPABASE_URL")!
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    try {
      const parsed = JSON.parse(body || "{}")
      folderId = typeof parsed.folderId === "string" ? parsed.folderId.trim() : undefined
    } catch {
      throw new Error(`Invalid JSON body: ${body.substring(0, 80)}`)
    }

    if (!folderId) {
      const folderRes = await fetch(`${sbUrl}/rest/v1/app_config?key=eq.drive_drying_folder_id&select=value`, {
        headers: { Authorization: `Bearer ${sbKey}`, apikey: sbKey },
      })
      const folderData = await folderRes.json()
      folderId = folderData?.[0]?.value?.trim()
    }

    if (!folderId) {
      throw new Error(
        "No hay carpeta de Drive configurada. Define app_config.drive_drying_folder_id en Supabase o envía folderId en el body.",
      )
    }

    const { accessToken, mode, connectedEmail: ce } = await getDriveAccessToken(sbUrl, sbKey)
    connectedEmail = ce
    authMode = mode

    const query = `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime,modifiedTime,size)&orderBy=modifiedTime desc&pageSize=100`

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) {
      const err = await res.text()
      console.error("Drive API error:", err)
      throw new Error(`Drive API error [${res.status}]: ${err}`)
    }

    const data = await res.json()

    const drivePayload = {
      folderId,
      authMode,
      connectedEmail,
      serviceAccountEmail: connectedEmail,
    }

    return new Response(
      JSON.stringify({
        files: data.files || [],
        drive: drivePayload,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  } catch (error) {
    console.error("Error:", error.message)
    const payload: {
      error: string
      drive?: {
        folderId?: string
        authMode: string
        connectedEmail: string
        serviceAccountEmail: string
      }
    } = { error: error.message }
    if (folderId && connectedEmail) {
      payload.drive = {
        folderId,
        authMode,
        connectedEmail,
        serviceAccountEmail: connectedEmail,
      }
    }
    return new Response(JSON.stringify(payload), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
