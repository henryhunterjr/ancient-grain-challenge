const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname,'..');
http.createServer((req,res)=>{
  const url = new URL(req.url,'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname==='/') pathname='/index.html';
  else if (!path.extname(pathname)) pathname+='.html';
  const file=path.resolve(root,'.'+pathname);
  if (!file.startsWith(root+path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file,(err,data)=>{
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'}).end(data);
  });
}).listen(4178,'127.0.0.1',()=>console.log('Local preview http://127.0.0.1:4178/record-score'));
