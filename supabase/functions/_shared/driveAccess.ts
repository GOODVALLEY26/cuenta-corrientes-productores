/** Google Drive API access: prefer OAuth (Workspace user), fallback to service account JSON. */

function toBase64Url(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function getAccessTokenFromServiceAccount(serviceAccount: {
  client_email: string
  token_uri: string
  private_key: string
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = toBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload = toBase64Url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      aud: serviceAccount.token_uri,
      exp: now + 3600,
      iat: now,
    }),
  )

  const encoder = new TextEncoder()
  const signingInput = `${header}.${payload}`

  const pemContent = serviceAccount.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "")

  const binaryKey = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  )

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, encoder.encode(signingInput))

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

  const jwt = `${header}.${payload}.${sig}`

  const tokenRes = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    throw new Error(`Token exchange (service account) failed: ${err}`)
  }

  const tokenData = await tokenRes.json()
  return tokenData.access_token as string
}

export async function getAppConfigValue(sbUrl: string, sbKey: string, configKey: string): Promise<string | null> {
  const res = await fetch(`${sbUrl}/rest/v1/app_config?key=eq.${encodeURIComponent(configKey)}&select=value`, {
    headers: { Authorization: `Bearer ${sbKey}`, apikey: sbKey },
  })
  const data = await res.json()
  const v = data?.[0]?.value
  return typeof v === "string" && v.trim() ? v.trim() : null
}

export async function setAppConfig(sbUrl: string, sbKey: string, configKey: string, value: string): Promise<void> {
  const res = await fetch(`${sbUrl}/rest/v1/app_config?on_conflict=key`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sbKey}`,
      apikey: sbKey,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ key: configKey, value }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`app_config upsert failed: ${t}`)
  }
}

export async function deleteAppConfigKey(sbUrl: string, sbKey: string, configKey: string): Promise<void> {
  await fetch(`${sbUrl}/rest/v1/app_config?key=eq.${encodeURIComponent(configKey)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${sbKey}`, apikey: sbKey },
  })
}

export type DriveAccessResult = {
  accessToken: string
  mode: "oauth" | "service_account"
  /** Email shown in UI (Workspace user or service account) */
  connectedEmail: string
}

/**
 * OAuth refresh token is tried first when client id/secret env vars exist and refresh token is stored.
 */
export async function getDriveAccessToken(sbUrl: string, sbKey: string): Promise<DriveAccessResult> {
  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")?.trim()
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")?.trim()
  const refreshToken = await getAppConfigValue(sbUrl, sbKey, "google_drive_oauth_refresh_token")
  const storedEmail = await getAppConfigValue(sbUrl, sbKey, "google_drive_oauth_email")

  if (refreshToken && clientId && clientSecret) {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    })
    if (tokenRes.ok) {
      const tok = await tokenRes.json()
      return {
        accessToken: tok.access_token as string,
        mode: "oauth",
        connectedEmail: storedEmail ?? "cuenta Google conectada",
      }
    }
    const errTxt = await tokenRes.text()
    console.error("Drive OAuth refresh failed, falling back to service account:", errTxt)
  }

  const saB64 = await getAppConfigValue(sbUrl, sbKey, "google_sa_b64")
  if (!saB64) {
    throw new Error(
      "Drive no configurado: conecta una cuenta Google (Facturas de secado) o configura google_sa_b64 en app_config.",
    )
  }

  const saJson = new TextDecoder().decode(Uint8Array.from(atob(saB64), (c) => c.charCodeAt(0)))
  const serviceAccount = JSON.parse(saJson)
  const accessToken = await getAccessTokenFromServiceAccount(serviceAccount)
  return {
    accessToken,
    mode: "service_account",
    connectedEmail: String(serviceAccount.client_email ?? ""),
  }
}
