/* Access JWT verification: always verify signature, audience, issuer, expiry.
 * Never trust an unverified email header or client-provided identity. */
const keyCache = new Map();
const MAX_JWT = 12000;
function decodeB64url(str) {
  if(typeof str!=='string'||str.length>MAX_JWT||!/^[A-Za-z0-9_-]+$/.test(str)) throw new Error('invalid_token');
  const raw=atob(str.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-str.length%4)%4));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function decodeJson(segment){
  return JSON.parse(new TextDecoder().decode(decodeB64url(segment)));
}
export function normalizeTeamDomain(value) {
  const domain=String(value||'').toLowerCase().replace(/^https:\/\//,'').replace(/\/+$/,'');
  if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain)) throw new Error('Access team domain non valido');
  return domain;
}
export function verifiedEmail(email) {
  const v=String(email||'').trim().toLowerCase();
  if(v.length<5||v.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))throw new Error('Email Access non valida');
  return v;
}
export function checkAccessClaims(payload,{aud,iss,now=Math.floor(Date.now()/1000)}) {
  if(!payload||typeof payload!=='object') throw new Error('invalid_claims');
  if(payload.iss!==iss)throw new Error('wrong_issuer');
  if(!((typeof payload.aud==='string'&&payload.aud===aud)||
    (Array.isArray(payload.aud)&&payload.aud.includes(aud))))throw new Error('wrong_audience');
  if(!Number.isFinite(payload.exp)||payload.exp<=now-30)throw new Error('expired');
  if(payload.nbf!==undefined&&(!Number.isFinite(payload.nbf)||payload.nbf>now+30))throw new Error('not_yet_valid');
  if(payload.iat!==undefined&&(!Number.isFinite(payload.iat)||payload.iat>now+30))throw new Error('future_issue_date');
  return verifiedEmail(payload.email);
}
async function getKey(domain,kid){
  const cached=keyCache.get(domain),now=Date.now();
  if(cached && cached.until>now && cached.keys.has(kid))return cached.keys.get(kid);
  const response=await fetch('https://'+domain+'/cdn-cgi/access/certs',{redirect:'error'});
  if(!response.ok)throw new Error('Access certificates unavailable');
  const json=await response.json(),keys=new Map();
  for(const jwk of json.keys||[]){
    if(jwk.kty==='RSA'&&jwk.alg==='RS256'&&jwk.kid && jwk.n && jwk.e) {
      keys.set(jwk.kid,await crypto.subtle.importKey(
        'jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']));
    }
  }
  keyCache.set(domain,{keys,until:now+300000});
  return keys.get(kid);
}
export async function verifyAccess(request,env){
  const domain=normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN);
  const aud=String(env.ACCESS_AUD||'');
  if(!/^[A-Za-z0-9_-]{20,}$/.test(aud))throw new Error('Access audience not configured');
  const jwt=request.headers.get('cf-access-jwt-assertion')||'';
  if(jwt.length<50||jwt.length>MAX_JWT)throw new Error('missing_access_token');
  const parts=jwt.split('.');
  if(parts.length!==3)throw new Error('invalid_token');
  const header=decodeJson(parts[0]);
  if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>150)throw new Error('unsupported_token');
  const key=await getKey(domain,header.kid);
  if(!key)throw new Error('unknown_signing_key');
  const valid=await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',key,decodeB64url(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  if(!valid)throw new Error('invalid_signature');
  const payload=decodeJson(parts[1]);
  const email=checkAccessClaims(payload,{aud,iss:'https://'+domain});
  return {email,subject:String(payload.sub||'')};
}
