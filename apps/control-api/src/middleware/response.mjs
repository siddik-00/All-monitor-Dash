export function json(res,status,data) {
  const body=JSON.stringify(data);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(body),'X-Content-Type-Options':'nosniff'});
  res.end(body);
}
export function errorResponse(res,error) {
  const status=Number.isInteger(error.status)?error.status:502;
  json(res,status,{error:status>=500?'Collection failed. Check upstream configuration and service health.':error.message});
}
