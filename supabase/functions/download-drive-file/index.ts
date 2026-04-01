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
    let fileId: string, fileName: string
    try {
      const parsed = JSON.parse(body)
      fileId = parsed.fileId
      fileName = parsed.fileName
    } catch (e) {
      throw new Error(`Invalid JSON body: ${body.substring(0, 50)}`)
    }
    
    if (!fileId) throw new Error('fileId is required')

    const saB64 = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_B64')
    if (!saB64) throw new Error('GOOGLE_SERVICE_ACCOUNT_B64 not configured')

    const saJson = new TextDecoder().decode(Uint8Array.from(atob(saB64), c => c.charCodeAt(0)))
    const serviceAccount = JSON.parse(saJson)
    const accessToken = await getAccessToken(serviceAccount)

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Drive download error [${res.status}]: ${err}`)
    }

    const fileBytes = new Uint8Array(await res.arrayBuffer())

    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < fileBytes.length; i += chunkSize) {
      const chunk = fileBytes.subarray(i, i + chunkSize)
      binary += String.fromCharCode(...chunk)
    }
    const base64 = btoa(binary)

    const apiKey = Deno.env.get('LOVABLE_API_KEY')
    if (!apiKey) throw new Error('LOVABLE_API_KEY not configured')

    const systemPrompt = `Eres un sistema que extrae datos de facturas chilenas. 
Analiza el PDF y determina si es una factura de productor o una factura de secado.
Extrae la siguiente información y devuelve SOLO un JSON válido (sin markdown):
{
  "invoice_type": "producer" o "drying",
  "producer_name": "nombre del emisor o destinatario según el tipo",
  "invoice_number": "número de folio",
  "amount_net_clp": número NETO en CLP (sin IVA, solo número),
  "iva_clp": número del IVA en CLP (solo número),
  "date": "YYYY-MM-DD",
  "exchange_rate": número o null si no aparece tipo de cambio,
  "document_type": "factura" o "nota_debito",
  "notes": "observaciones relevantes o null"
}
IMPORTANTE: Separa siempre el monto NETO del IVA. El monto total = neto + IVA.
Si un campo no se encuentra, usa null.`

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extrae los datos de esta factura:' },
              { type: 'image_url', image_url: { url: `data:application/pdf;base64,${base64}` } }
            ]
          }
        ],
        response_format: { type: 'json_object' }
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`AI API error: ${response.status} - ${errText}`)
    }

    const aiResult = await response.json()
    const content = aiResult.choices?.[0]?.message?.content

    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      const jsonMatch = content?.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1].trim())
      } else {
        parsed = { error: 'Could not parse AI response', raw: content }
      }
    }

    parsed.pdf_base64 = base64
    parsed.file_name = fileName || `${fileId}.pdf`

    return new Response(JSON.stringify(parsed), {
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
