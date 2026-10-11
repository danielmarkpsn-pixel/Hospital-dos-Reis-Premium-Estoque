const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const app = express();
const PORT = Number(process.env.PORT || 4317);
const HOST = process.env.HOST || '0.0.0.0';
const dataDir = process.env.APP_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'hospital-estoque.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
let SECRET = process.env.JWT_SECRET;
if (!SECRET) { const secretFile=path.join(dataDir,'.jwt-secret'); if(fs.existsSync(secretFile)) SECRET=fs.readFileSync(secretFile,'utf8').trim(); if(!SECRET){SECRET=crypto.randomBytes(48).toString('hex');fs.writeFileSync(secretFile,SECRET,{mode:0o600});} }

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
 name TEXT NOT NULL, password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','estoque','consulta')),
 active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, name TEXT NOT NULL,
 category TEXT NOT NULL DEFAULT 'Material cirúrgico', unit TEXT NOT NULL DEFAULT 'un',
 min_stock REAL NOT NULL DEFAULT 0, location TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS lots (
 id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL REFERENCES products(id),
 lot_code TEXT NOT NULL DEFAULT '', expiry_date TEXT, quantity REAL NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS surgeries (
 id INTEGER PRIMARY KEY AUTOINCREMENT, surgery_code TEXT UNIQUE NOT NULL,
 procedure_name TEXT NOT NULL, surgery_date TEXT NOT NULL, notes TEXT DEFAULT '',
 created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS movements (
 id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL REFERENCES products(id),
 lot_id INTEGER REFERENCES lots(id), type TEXT NOT NULL CHECK(type IN ('entrada','saida','ajuste','perda')),
 quantity REAL NOT NULL, reason TEXT NOT NULL, surgery_id INTEGER REFERENCES surgeries(id),
 user_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);
const ensureColumn=(table,column,definition)=>{const cols=db.prepare('PRAGMA table_info('+table+')').all();if(!cols.some(c=>c.name===column))db.exec('ALTER TABLE '+table+' ADD COLUMN '+column+' '+definition)};
ensureColumn('products','barcode','TEXT');ensureColumn('products','unit_cost','REAL NOT NULL DEFAULT 0');ensureColumn('products','supplier_id','INTEGER');
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL AND barcode <> '';
CREATE TABLE IF NOT EXISTS suppliers(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,cnpj TEXT DEFAULT '',contact TEXT DEFAULT '',phone TEXT DEFAULT '',email TEXT DEFAULT '',address TEXT DEFAULT '',notes TEXT DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,username TEXT,user_name TEXT,action TEXT NOT NULL,entity TEXT NOT NULL,details TEXT DEFAULT '',ip_address TEXT DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);`);
const adminUser = db.prepare('SELECT id, password_hash FROM users WHERE username=?').get('admin');
if (!adminUser) {
  db.prepare('INSERT INTO users(username,name,password_hash,role) VALUES(?,?,?,?)')
    .run('admin', 'Administrador', bcrypt.hashSync('admin', 10), 'admin');
} else if (bcrypt.compareSync('Trocar@123', adminUser.password_hash)) {
  // Migração única do usuário padrão antigo; não sobrescreve senhas já alteradas.
  db.prepare('UPDATE users SET password_hash=? WHERE id=?')
    .run(bcrypt.hashSync('admin', 10), adminUser.id);
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api',(req,res,next)=>{res.on('finish',()=>{if(!req.user||!['POST','PUT','PATCH','DELETE'].includes(req.method)||res.statusCode>=400)return;try{const b=req.body&&typeof req.body==='object'?{...req.body}:{};for(const k of ['password','password_hash','token','authorization'])delete b[k];db.prepare('INSERT INTO audit_logs(user_id,username,user_name,action,entity,details,ip_address) VALUES(?,?,?,?,?,?,?)').run(req.user.id,req.user.username,req.user.name,req.method,req.path.split('/')[2]||'sistema',JSON.stringify({path:req.path,method:req.method,status:res.statusCode,fields:Object.keys(b)}),String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').slice(0,100))}catch(e){console.error('Auditoria:',e.message)}});next()});
app.get('/api/health', (req,res)=>res.json({ok:true, app:'Hospital dos Reis Premium Estoque'}));

function auth(req,res,next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i,'');
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { res.status(401).json({error:'Sessão inválida. Entre novamente.'}); }
}
function roles(...allowed) {
  return (req,res,next) => allowed.includes(req.user.role) ? next() : res.status(403).json({error:'Seu usuário não tem permissão para esta ação.'});
}
function logMovement({product_id,lot_id,type,quantity,reason,surgery_id,user_id}) {
  const tx = db.transaction(() => {
    const current = lot_id ? db.prepare('SELECT quantity FROM lots WHERE id=? AND product_id=?').get(lot_id, product_id) : null;
    if (type === 'saida' || type === 'perda') {
      if (lot_id && (!current || current.quantity < quantity)) throw new Error('Quantidade insuficiente no lote selecionado.');
      if (!lot_id) {
        const total = db.prepare('SELECT COALESCE(SUM(quantity),0) q FROM lots WHERE product_id=?').get(product_id).q;
        if (total < quantity) throw new Error('Estoque insuficiente.');
      }
    }
    if (type === 'entrada') {
      if (lot_id) db.prepare('UPDATE lots SET quantity=quantity+? WHERE id=?').run(quantity,lot_id);
      else {
        const lot = db.prepare('INSERT INTO lots(product_id,lot_code,quantity) VALUES(?,?,?)').run(product_id,'SEM-LOTE',quantity);
        lot_id = lot.lastInsertRowid;
      }
    } else if (type === 'saida' || type === 'perda') {
      if (lot_id) db.prepare('UPDATE lots SET quantity=quantity-? WHERE id=?').run(quantity,lot_id);
      else {
        let remaining = quantity;
        const lots = db.prepare('SELECT id,quantity FROM lots WHERE product_id=? AND quantity>0 ORDER BY COALESCE(expiry_date,"9999-12-31"),id').all(product_id);
        for (const lot of lots) {
          const take = Math.min(remaining, lot.quantity);
          db.prepare('UPDATE lots SET quantity=quantity-? WHERE id=?').run(take,lot.id);
          remaining -= take;
          if (remaining <= 0) break;
        }
      }
    } else if (type === 'ajuste') {
      if (!lot_id) throw new Error('Selecione o lote para ajustar.');
      db.prepare('UPDATE lots SET quantity=? WHERE id=?').run(quantity,lot_id);
    }
    db.prepare(`INSERT INTO movements(product_id,lot_id,type,quantity,reason,surgery_id,user_id)
      VALUES(?,?,?,?,?,?,?)`).run(product_id,lot_id || null,type,quantity,reason,surgery_id || null,user_id);
  });
  tx();
}

app.post('/api/login',(req,res)=>{
  const {username,password}=req.body||{};
  const user=db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(String(username||'').trim());
  if(!user || !bcrypt.compareSync(String(password||''),user.password_hash)) return res.status(401).json({error:'Usuário ou senha incorretos.'});
  const token=jwt.sign({id:user.id,username:user.username,name:user.name,role:user.role},SECRET,{expiresIn:'12h'});
  res.json({token,user:{id:user.id,username:user.username,name:user.name,role:user.role}});
});
app.get('/api/me',auth,(req,res)=>res.json({user:req.user}));
app.post('/api/change-password',auth,(req,res)=>{const b=req.body||{};const user=db.prepare('SELECT id,password_hash FROM users WHERE id=? AND active=1').get(req.user.id);if(!user||!bcrypt.compareSync(String(b.current_password||''),user.password_hash))return res.status(400).json({error:'A senha atual está incorreta.'});if(String(b.new_password||'').length<10)return res.status(400).json({error:'A nova senha deve ter pelo menos 10 caracteres.'});if(String(b.new_password)===String(b.current_password))return res.status(400).json({error:'Escolha uma senha diferente da atual.'});db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(String(b.new_password),12),req.user.id);res.json({ok:true})});


app.get('/api/dashboard',auth,(req,res)=>{
 const products=db.prepare(`SELECT p.id,p.name,p.code,p.min_stock,p.unit_cost,
   COALESCE(SUM(l.quantity),0) stock,
   SUM(CASE WHEN l.expiry_date IS NOT NULL AND l.expiry_date < date('now') AND l.quantity>0 THEN l.quantity ELSE 0 END) expired,
   SUM(CASE WHEN l.expiry_date BETWEEN date('now') AND date('now','+60 day') AND l.quantity>0 THEN l.quantity ELSE 0 END) expiring
   FROM products p LEFT JOIN lots l ON l.product_id=p.id WHERE p.active=1 GROUP BY p.id`).all();
 const recent=db.prepare(`SELECT m.*,p.name product_name,u.name user_name,s.surgery_code
   FROM movements m JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.user_id
   LEFT JOIN surgeries s ON s.id=m.surgery_id ORDER BY m.id DESC LIMIT 8`).all();
 const monthly=db.prepare("SELECT COALESCE(SUM(quantity),0) q FROM movements WHERE type IN ('saida','perda') AND created_at>=date('now','start of month')").get().q;
 res.json({products:products.length,inventoryValue:products.reduce((sum,p)=>sum+(Number(p.stock)||0)*(Number(p.unit_cost)||0),0),monthlyConsumption:monthly,low:products.filter(p=>p.stock<=p.min_stock).length,
   expired:products.filter(p=>p.expired>0).length,expiring:products.filter(p=>p.expiring>0).length,
   recent,lowItems:products.filter(p=>p.stock<=p.min_stock).slice(0,8)});
});
app.get('/api/products',auth,(req,res)=>{
 const rows=db.prepare(`SELECT p.*,COALESCE(SUM(l.quantity),0) stock,
  MIN(CASE WHEN l.quantity>0 AND l.expiry_date IS NOT NULL THEN l.expiry_date END) next_expiry
  FROM products p LEFT JOIN lots l ON l.product_id=p.id WHERE p.active=1
  GROUP BY p.id ORDER BY p.name`).all();
 res.json(rows);
});
app.post('/api/products',auth,roles('admin','estoque'),(req,res)=>{
 const b=req.body||{};
 if(!String(b.name||'').trim()) return res.status(400).json({error:'Informe o nome do material.'});
 try {
  const r=db.prepare('INSERT INTO products(code,name,category,unit,min_stock,location,barcode,unit_cost,supplier_id) VALUES(?,?,?,?,?,?,?,?,?)')
   .run(b.code||null,String(b.name).trim(),b.category||'Material cirúrgico',b.unit||'un',Math.max(0,Number(b.min_stock)||0),b.location||'',String(b.barcode||'').trim()||null,Math.max(0,Number(b.unit_cost)||0),b.supplier_id?Number(b.supplier_id):null);
  res.json({id:r.lastInsertRowid});
 } catch(e){res.status(400).json({error:e.message.includes('UNIQUE')?'Este código já está cadastrado.':e.message});}
});
app.put('/api/products/:id',auth,roles('admin','estoque'),(req,res)=>{
 const b=req.body||{};
 try {
  const r=db.prepare('UPDATE products SET code=?,name=?,category=?,unit=?,min_stock=?,location=?,barcode=?,unit_cost=?,supplier_id=? WHERE id=?')
   .run(b.code||null,String(b.name||'').trim(),b.category||'Material cirúrgico',b.unit||'un',Math.max(0,Number(b.min_stock)||0),b.location||'',String(b.barcode||'').trim()||null,Math.max(0,Number(b.unit_cost)||0),b.supplier_id?Number(b.supplier_id):null,Number(req.params.id));
  if(!r.changes) return res.status(404).json({error:'Material não encontrado.'});
  res.json({ok:true});
 } catch(e){res.status(400).json({error:e.message.includes('UNIQUE')?'Este código já está cadastrado.':e.message});}
});
app.get('/api/lots',auth,(req,res)=>{
 const rows=db.prepare(`SELECT l.*,p.name product_name,p.unit FROM lots l JOIN products p ON p.id=l.product_id ORDER BY CASE WHEN l.expiry_date IS NULL THEN 1 ELSE 0 END,l.expiry_date`).all();
 res.json(rows);
});
app.post('/api/movements',auth,roles('admin','estoque'),(req,res)=>{
 const b=req.body||{}, qty=Number(b.quantity);
 if(!b.product_id || !Number.isFinite(qty) || qty<=0 || !String(b.reason||'').trim()) return res.status(400).json({error:'Preencha material, quantidade e motivo.'});
 try {
  let lotId=b.lot_id?Number(b.lot_id):null;
  if(b.type==='entrada' && !lotId) {
    const lot=db.prepare('INSERT INTO lots(product_id,lot_code,expiry_date,quantity) VALUES(?,?,?,0)')
      .run(Number(b.product_id),String(b.new_lot_code||'SEM-LOTE').trim(),b.expiry_date||null);
    lotId=lot.lastInsertRowid;
  }
  logMovement({product_id:Number(b.product_id),lot_id:lotId,type:b.type,quantity:qty,reason:String(b.reason).trim(),surgery_id:b.surgery_id?Number(b.surgery_id):null,user_id:req.user.id});
  res.json({ok:true});
 } catch(e){res.status(400).json({error:e.message});}
});
app.get('/api/surgeries',auth,(req,res)=>{
 res.json(db.prepare(`SELECT s.*,u.name user_name FROM surgeries s LEFT JOIN users u ON u.id=s.created_by ORDER BY surgery_date DESC,id DESC`).all());
});
app.post('/api/surgeries',auth,roles('admin','estoque'),(req,res)=>{
 const b=req.body||{};
 if(!String(b.surgery_code||'').trim()||!String(b.procedure_name||'').trim()||!b.surgery_date) return res.status(400).json({error:'Preencha código, procedimento e data.'});
 try {
  const r=db.prepare('INSERT INTO surgeries(surgery_code,procedure_name,surgery_date,notes,created_by) VALUES(?,?,?,?,?)')
    .run(String(b.surgery_code).trim(),String(b.procedure_name).trim(),b.surgery_date,String(b.notes||''),req.user.id);
  res.json({id:r.lastInsertRowid});
 } catch(e){res.status(400).json({error:e.message.includes('UNIQUE')?'Este código de cirurgia já existe.':e.message});}
});
app.post('/api/surgeries/:id/consume',auth,roles('admin','estoque'),(req,res)=>{
 const items=Array.isArray(req.body.items)?req.body.items:[];
 if(!items.length) return res.status(400).json({error:'Adicione pelo menos um material.'});
 try {
  // Cada baixa usa sua própria transação; evita transações SQLite aninhadas.
  for(const item of items) {
    const qty=Number(item.quantity);
    if(!item.product_id||!Number.isFinite(qty)||qty<=0) throw new Error('Material ou quantidade inválida.');
    logMovement({product_id:Number(item.product_id),lot_id:item.lot_id?Number(item.lot_id):null,type:'saida',quantity:qty,reason:'Consumo cirúrgico',surgery_id:Number(req.params.id),user_id:req.user.id});
  }
  res.json({ok:true});
 } catch(e){res.status(400).json({error:e.message});}
});
app.get('/api/reports/movements',auth,(req,res)=>{
 const rows=db.prepare(`SELECT m.created_at,m.type,m.quantity,m.reason,p.name product_name,p.unit,u.name user_name,s.surgery_code
 FROM movements m JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.user_id LEFT JOIN surgeries s ON s.id=m.surgery_id
 ORDER BY m.id DESC LIMIT 1000`).all();
 res.json(rows);
});
app.get('/api/users',auth,roles('admin'),(req,res)=>res.json(db.prepare('SELECT id,username,name,role,active,created_at FROM users ORDER BY name').all()));
app.post('/api/users',auth,roles('admin'),(req,res)=>{
 const b=req.body||{};
 if(!b.username||!b.name||!b.password||String(b.password).length<8||!['admin','estoque','consulta'].includes(b.role)) return res.status(400).json({error:'Informe usuário, nome, senha com 8+ caracteres e perfil válido.'});
 try {
  const r=db.prepare('INSERT INTO users(username,name,password_hash,role) VALUES(?,?,?,?)')
   .run(String(b.username).trim(),String(b.name).trim(),bcrypt.hashSync(String(b.password),10),b.role);
  res.json({id:r.lastInsertRowid});
 } catch(e){res.status(400).json({error:e.message.includes('UNIQUE')?'Nome de usuário já existe.':e.message});}
});
app.get('/api/network',auth,roles('admin'),(req,res)=>{
 const addresses=[];
 for(const [name,items] of Object.entries(os.networkInterfaces())) for(const i of items||[]) if(i.family==='IPv4'&&!i.internal) addresses.push({name,address:i.address});
 res.json({port:PORT,addresses});
});
app.get('/api/export',auth,roles('admin','estoque'),(req,res)=>{
 const products=db.prepare(`SELECT p.code,p.name,p.category,p.unit,p.min_stock,COALESCE(SUM(l.quantity),0) stock,p.location
 FROM products p LEFT JOIN lots l ON l.product_id=p.id WHERE p.active=1 GROUP BY p.id ORDER BY p.name`).all();
 res.setHeader('Content-Type','text/csv; charset=utf-8');
 res.setHeader('Content-Disposition','attachment; filename="estoque-hospital-dos-reis.csv"');
 const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 res.send('\ufeff'+['Código;Material;Categoria;Unidade;Estoque mínimo;Saldo;Localização',...products.map(p=>[p.code,p.name,p.category,p.unit,p.min_stock,p.stock,p.location].map(esc).join(';'))].join('\r\n'));
});

app.get('/api/suppliers',auth,roles('admin','estoque','consulta'),(req,res)=>res.json(db.prepare('SELECT s.*,COUNT(p.id) product_count FROM suppliers s LEFT JOIN products p ON p.supplier_id=s.id AND p.active=1 WHERE s.active=1 GROUP BY s.id ORDER BY s.name').all()));
app.post('/api/suppliers',auth,roles('admin','estoque'),(req,res)=>{const b=req.body||{};if(!String(b.name||'').trim())return res.status(400).json({error:'Informe o nome do fornecedor.'});try{const r=db.prepare('INSERT INTO suppliers(name,cnpj,contact,phone,email,address,notes) VALUES(?,?,?,?,?,?,?)').run(String(b.name).trim(),String(b.cnpj||'').trim(),String(b.contact||'').trim(),String(b.phone||'').trim(),String(b.email||'').trim(),String(b.address||'').trim(),String(b.notes||'').trim());res.json({id:r.lastInsertRowid})}catch(e){res.status(400).json({error:e.message})}});
app.put('/api/suppliers/:id',auth,roles('admin','estoque'),(req,res)=>{const b=req.body||{};if(!String(b.name||'').trim())return res.status(400).json({error:'Informe o nome do fornecedor.'});const r=db.prepare('UPDATE suppliers SET name=?,cnpj=?,contact=?,phone=?,email=?,address=?,notes=? WHERE id=? AND active=1').run(String(b.name).trim(),String(b.cnpj||'').trim(),String(b.contact||'').trim(),String(b.phone||'').trim(),String(b.email||'').trim(),String(b.address||'').trim(),String(b.notes||'').trim(),Number(req.params.id));if(!r.changes)return res.status(404).json({error:'Fornecedor não encontrado.'});res.json({ok:true})});
app.get('/api/audit',auth,roles('admin'),(req,res)=>{const b=req.query||{},w=[],a=[];if(b.from){w.push('date(created_at)>=date(?)');a.push(b.from)}if(b.to){w.push('date(created_at)<=date(?)');a.push(b.to)}if(b.user){w.push('(username LIKE ? OR user_name LIKE ?)');a.push('%'+b.user+'%','%'+b.user+'%')}res.json(db.prepare('SELECT * FROM audit_logs '+(w.length?'WHERE '+w.join(' AND '):'')+' ORDER BY id DESC LIMIT 2000').all(...a))});
app.get('/api/reports/advanced',auth,roles('admin','estoque','consulta'),(req,res)=>{const b=req.query||{},w=[],a=[];if(b.from){w.push('date(m.created_at)>=date(?)');a.push(b.from)}if(b.to){w.push('date(m.created_at)<=date(?)');a.push(b.to)}if(b.product_id){w.push('m.product_id=?');a.push(Number(b.product_id))}if(b.user_id){w.push('m.user_id=?');a.push(Number(b.user_id))}if(b.type){w.push('m.type=?');a.push(b.type)}res.json(db.prepare('SELECT m.id,m.created_at,m.type,m.quantity,m.reason,p.name product_name,p.unit,u.name user_name,s.surgery_code,l.lot_code,l.expiry_date FROM movements m JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.user_id LEFT JOIN surgeries s ON s.id=m.surgery_id LEFT JOIN lots l ON l.id=m.lot_id '+(w.length?'WHERE '+w.join(' AND '):'')+' ORDER BY m.id DESC LIMIT 5000').all(...a))});


const backupDir=path.join(dataDir,'backups');fs.mkdirSync(backupDir,{recursive:true});
async function createBackup(){const stamp=new Date().toISOString().replace(/[:.]/g,'-');const dest=path.join(backupDir,'hospital-estoque-'+stamp+'.db');await db.backup(dest);const list=fs.readdirSync(backupDir).filter(n=>n.endsWith('.db')).map(name=>({name,time:fs.statSync(path.join(backupDir,name)).mtimeMs})).sort((a,b)=>b.time-a.time);for(const old of list.slice(14)){try{fs.unlinkSync(path.join(backupDir,old.name))}catch{}}return dest}
app.get('/api/backups',auth,roles('admin'),(req,res)=>res.json(fs.readdirSync(backupDir).filter(name=>name.endsWith('.db')).map(name=>({name,created_at:fs.statSync(path.join(backupDir,name)).mtime.toISOString(),size:fs.statSync(path.join(backupDir,name)).size})).sort((a,b)=>b.created_at.localeCompare(a.created_at))));
app.post('/api/backups',auth,roles('admin'),async(req,res)=>{try{const file=await createBackup();res.json({ok:true,name:path.basename(file),created_at:fs.statSync(file).mtime.toISOString()})}catch(e){res.status(500).json({error:'Não foi possível criar backup: '+e.message})}});
app.get('/api/backups/:name/download',auth,roles('admin'),(req,res)=>{const name=path.basename(req.params.name);if(name!==req.params.name||!name.startsWith('hospital-estoque-')||!name.endsWith('.db'))return res.status(400).json({error:'Nome de backup inválido.'});const file=path.join(backupDir,name);if(!fs.existsSync(file))return res.status(404).json({error:'Backup não encontrado.'});res.download(file,name)});

app.listen(PORT,HOST,()=>{console.log(`Estoque disponível na porta ${PORT}`);createBackup().catch(e=>console.error('Backup inicial:',e.message));setInterval(()=>createBackup().catch(e=>console.error('Backup diário:',e.message)),24*60*60*1000);});
