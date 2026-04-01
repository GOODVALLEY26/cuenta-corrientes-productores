import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function toBase64Url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function getAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = toBase64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: serviceAccount.token_uri,
    exp: now + 3600,
    iat: now,
  }))

  const encoder = new TextEncoder()
  const signingInput = `${header}.${payload}`

  const pemContent = serviceAccount.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '')
  
  const binaryKey = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0))
  
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signingInput)
  )

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  
  const jwt = `${header}.${payload}.${sig}`

  const tokenRes = await fetch(serviceAccount.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    console.error('Token exchange failed:', err)
    throw new Error(`Token exchange failed: ${err}`)
  }

  const tokenData = await tokenRes.json()
  return tokenData.access_token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.text()
    console.log('Request body:', body)
    
    let folderId: string
    try {
      const parsed = JSON.parse(body)
      folderId = parsed.folderId
    } catch (e) {
      throw new Error(`Invalid JSON body: ${body.substring(0, 50)}`)
    }
    
    if (!folderId) throw new Error('folderId is required')

    // Read credentials from database (stored as base64)
    const sbUrl = Deno.env.get('SUPABASE_URL')!
    const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const configRes = await fetch(`${sbUrl}/rest/v1/app_config?key=eq.google_sa_b64&select=value`, {
      headers: { 'Authorization': `Bearer ${sbKey}`, 'apikey': sbKey },
    })
    const configData = await configRes.json()
    if (!configData?.[0]?.value) throw new Error('Google service account not configured in database')
    
    const saJson = new TextDecoder().decode(Uint8Array.from(atob(configData[0].value), c => c.charCodeAt(0)))
    const serviceAccount = JSON.parse(saJson)
    const accessToken = await getAccessToken(serviceAccount)

    const query = `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime,modifiedTime,size)&orderBy=modifiedTime desc&pageSize=100`

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Drive API error:', err)
      throw new Error(`Drive API error [${res.status}]: ${err}`)
    }

    const data = await res.json()

    return new Response(JSON.stringify({ files: data.files || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
