import { timingSafeEqual } from 'node:crypto';
import { tokenFor } from '../config/env.mjs';
export function requireAuth(header,config) {
  if(config.demo)return;
  let token='';try{token=tokenFor(config);}catch{}
  const supplied=typeof header==='string'&&header.startsWith('Bearer ')?header.slice(7):'';
  const a=Buffer.from(supplied),b=Buffer.from(token);
  if(b.length<32||a.length!==b.length||!timingSafeEqual(a,b))throw Object.assign(new Error('A valid operator API bearer token is required.'),{status:401});
}
