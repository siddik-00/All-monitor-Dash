export function cors(req,res,config) {
  const origin=req.headers.origin;
  if(!origin)return;
  const same=req.headers.host&&(origin===`http://${req.headers.host}`||origin===`https://${req.headers.host}`);
  if(!same&&!config.allowedOrigins.includes(origin))throw Object.assign(new Error('Origin is not allowed.'),{status:403});
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, Accept');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
}
