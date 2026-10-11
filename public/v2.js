// Módulos adicionais da versão 2.0 — interface compatível com a V1.
titles.barcode='Leitura por código de barras';
titles.suppliers='Fornecedores';
titles.audit='Auditoria completa';
titles.security='Segurança e backup';

window.renderPage=async function(){
 const c=$('#content');
 c.innerHTML='<div class="panel empty">Carregando informações…</div>';
 if(state.page==='barcode')return barcodePage(c);
 if(state.page==='suppliers')return suppliersPage(c);
 if(state.page==='audit')return auditPage(c);
 if(state.page==='security')return securityPage(c);
 if(state.page==='reports')return advancedReportsPage(c);
 if(state.page==='products')return v2ProductsPage(c);
 if(state.page==='dashboard')return executiveDashboard(c);
 if(state.page==='users'||state.page==='network')return (state.user?.role==='admin'? (state.page==='users'?usersPage(c):networkPage(c)) : (c.innerHTML='<div class="panel empty">Acesso restrito ao administrador.</div>'));
 if(state.page==='lots')return lotsPage(c);
 if(state.page==='movements')return movementsPage(c);
 if(state.page==='surgeries')return surgeriesPage(c);
};
window.navigate=async function(page){
 if((page==='audit'||page==='security'||page==='users'||page==='network')&&state.user?.role!=='admin'){toast('Acesso restrito ao administrador.',true);return}
 state.page=page;
 document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
 $('#pageTitle').textContent=titles[page]||page;
 try{await renderPage()}catch(e){toast(e.message,true)}
};
function brl(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
async function executiveDashboard(c){
 const d=await api('/dashboard');
 const bars=(d.lowItems||[]).slice(0,7).map(p=>'<div class="v2-bar-row"><span>'+esc(p.name)+'</span><div class="v2-track"><i style="width:'+Math.max(4,Math.min(100,(Number(p.stock)/(Number(p.min_stock)||1))*100))+'%"></i></div><b>'+num(p.stock)+'</b></div>').join('');
 c.innerHTML=pageHead('Painel executivo','Indicadores de disponibilidade, validade e consumo para apoiar decisões de estoque.',btn('＋ Registrar entrada',"openMovement('entrada')"))+
 '<div class="stats v2-stats"><div class="stat"><div class="stat-top">Materiais ativos</div><div class="stat-value">'+d.products+'</div><div class="stat-note">Itens no catálogo</div></div><div class="stat '+(d.low?'alert':'')+'"><div class="stat-top">Estoque crítico</div><div class="stat-value">'+d.low+'</div><div class="stat-note">No mínimo ou abaixo</div></div><div class="stat '+(d.expiring?'alert':'')+'"><div class="stat-top">Próximos do vencimento</div><div class="stat-value">'+d.expiring+'</div><div class="stat-note">Até 60 dias</div></div><div class="stat '+(d.expired?'critical':'')+'"><div class="stat-top">Com lote vencido</div><div class="stat-value">'+d.expired+'</div><div class="stat-note">Exigem segregação e conferência</div></div></div>'+
 '<div class="stats v2-stats"><div class="stat v2-wide"><div class="stat-top">Valor estimado do estoque</div><div class="stat-value">'+brl(d.inventoryValue)+'</div><div class="stat-note">Calculado com custo unitário cadastrado</div></div><div class="stat v2-wide"><div class="stat-top">Consumo / perdas no mês</div><div class="stat-value">'+num(d.monthlyConsumption)+'</div><div class="stat-note">Quantidade acumulada, unidades conforme cadastro</div></div></div>'+
 '<div class="columns"><div class="panel"><div class="panel-head"><div><h3>Materiais que exigem atenção</h3><p>Comparação do saldo com o estoque mínimo</p></div><button class="text-link" onclick="navigate(\'products\')">Ver catálogo →</button></div>'+(bars||'<p class="helper">Nenhum material abaixo do mínimo.</p>')+'</div><div class="panel"><div class="panel-head"><div><h3>Ações rápidas</h3><p>Atalhos operacionais</p></div></div><div class="quick-grid"><button class="quick-action" onclick="navigate(\'barcode\')"><span class="quick-icon">▦</span><b>Ler código de barras</b><small>Localizar um material</small></button><button class="quick-action" onclick="navigate(\'suppliers\')"><span class="quick-icon">♧</span><b>Fornecedores</b><small>Cadastro e contatos</small></button><button class="quick-action" onclick="navigate(\'reports\')"><span class="quick-icon">▥</span><b>Relatórios avançados</b><small>Filtrar movimentações</small></button><button class="quick-action" onclick="navigate(\'security\')"><span class="quick-icon">♙</span><b>Backup</b><small>Administrador</small></button></div></div></div>';
 roleUI();
}
async function v2ProductsPage(c){
 await loadCatalog();
 const suppliers=await api('/suppliers');
 const rows=state.products.map(p=>'<tr><td class="product-cell">'+esc(p.name)+'<span class="subcell">'+esc(p.category)+'</span></td><td>'+esc(p.barcode||p.code||'—')+'</td><td>'+num(p.stock)+' '+esc(p.unit)+'</td><td>'+num(p.min_stock)+' '+esc(p.unit)+'</td><td>'+brl(p.unit_cost)+'</td><td>'+esc((suppliers.find(s=>s.id===p.supplier_id)||{}).name||'—')+'</td><td>'+moneyDate(p.next_expiry)+'</td><td>'+(canWrite()?'<button class="secondary" onclick="openProduct('+p.id+')">Editar</button>':'—')+'</td></tr>').join('');
 c.innerHTML=pageHead('Materiais','Catálogo com código de barras, custo e fornecedor.',(canWrite()?btn('＋ Novo material','openProduct()'):'')+btn('Exportar CSV','exportCsv()','secondary'))+'<div class="panel"><div class="panel-head"><div><h3>Materiais cadastrados</h3><p>'+state.products.length+' itens</p></div><input class="search" id="productSearch" placeholder="Nome, SKU ou código de barras…" oninput="filterTable(\'productSearch\',\'productTable\')"></div><div id="productTable">'+table(['MATERIAL','CÓDIGO / BARRAS','SALDO','MÍNIMO','CUSTO UNITÁRIO','FORNECEDOR','VALIDADE','AÇÕES'],rows)+'</div></div>';
 roleUI();
}
window.openProduct=async id=>{
 if(!canWrite())return;
 await loadCatalog();const suppliers=await api('/suppliers');const p=id?state.products.find(x=>x.id===id):{};
 showModal(id?'Editar material':'Novo material','Informe o código de barras, custo unitário e fornecedor, quando disponíveis.', '<form id="productForm"><div class="form-grid">'+
 '<label class="field">Nome do material *<input name="name" required value="'+esc(p.name||'')+'"></label>'+
 '<label class="field">Código interno / SKU<input name="code" value="'+esc(p.code||'')+'" placeholder="Ex.: CIR-001"></label>'+
 '<label class="field">Código de barras<input name="barcode" value="'+esc(p.barcode||'')+'" placeholder="Leia ou digite o código"></label>'+
 '<label class="field">Categoria<select name="category">'+['Material cirúrgico','Fios de sutura','Descartáveis','Soluções','Instrumental','Curativos','Outros'].map(x=>'<option '+(p.category===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label>'+
 '<label class="field">Unidade<select name="unit">'+['un','cx','pct','kit','ampola','frasco','par','ml','L'].map(x=>'<option '+(p.unit===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label>'+
 '<label class="field">Estoque mínimo<input name="min_stock" type="number" min="0" step="0.001" value="'+(p.min_stock??0)+'"></label>'+
 '<label class="field">Custo unitário (R$)<input name="unit_cost" type="number" min="0" step="0.01" value="'+(p.unit_cost??0)+'"></label>'+
 '<label class="field">Fornecedor<select name="supplier_id"><option value="">Sem fornecedor vinculado</option>'+suppliers.map(s=>'<option value="'+s.id+'" '+(p.supplier_id===s.id?'selected':'')+'>'+esc(s.name)+'</option>').join('')+'</select></label>'+
 '<label class="field full">Localização<input name="location" value="'+esc(p.location||'')+'" placeholder="Ex.: Almoxarifado A"></label></div></form>',
 async()=>{const f=$('#productForm');if(!f.reportValidity())return;const b=Object.fromEntries(new FormData(f));await api('/products'+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify(b)});closeModal();toast(id?'Material atualizado.':'Material cadastrado.');await renderPage()});
};
async function barcodePage(c){
 c.innerHTML=pageHead('Leitura por código de barras','Use um leitor USB (que digita como teclado) ou informe o código manualmente.')+
 '<div class="panel v2-scan-panel"><h3>Localizar material</h3><p class="helper">Clique no campo, leia o código e pressione Enter se o leitor não enviar essa tecla automaticamente.</p><form id="barcodeForm" class="v2-scan-form"><input id="barcodeInput" autocomplete="off" autofocus placeholder="Aguardando leitura do código de barras…" required><button class="primary">Buscar</button></form><div id="barcodeResult" class="v2-scan-result"><p class="helper">O resultado do material aparecerá aqui.</p></div></div>';
 $('#barcodeForm').addEventListener('submit',async e=>{e.preventDefault();const code=$('#barcodeInput').value.trim();if(!code)return;try{const all=await api('/products');const p=all.find(x=>String(x.barcode||'')===code||String(x.code||'')===code);const root=$('#barcodeResult');if(!p){root.innerHTML='<p class="pill bad">Código não encontrado</p><p class="helper">Cadastre o material e associe este código de barras.</p>';return}state.products=all;root.innerHTML='<div class="v2-result-card"><div><span class="eyebrow">MATERIAL LOCALIZADO</span><h3>'+esc(p.name)+'</h3><p>'+esc(p.category)+' · '+esc(p.unit)+'</p></div><div class="v2-result-stock"><small>Saldo atual</small><strong>'+num(p.stock)+' '+esc(p.unit)+'</strong></div></div><p class="helper">Código: '+esc(p.barcode||p.code||'—')+' · Mínimo: '+num(p.min_stock)+' · Local: '+esc(p.location||'—')+'</p>'+(canWrite()?'<div class="actions"><button class="primary" id="scanOut">Registrar saída</button><button class="secondary" id="scanIn">Registrar entrada</button></div>':'');if(canWrite()){$('#scanOut').onclick=()=>scanMovement(p.id,'saida');$('#scanIn').onclick=()=>scanMovement(p.id,'entrada')}$('#barcodeInput').select()}catch(err){toast(err.message,true)}});
 setTimeout(()=>$('#barcodeInput')?.focus(),80);
}
window.scanMovement=async(id,type)=>{await openMovement(type);const sel=$('#movementProduct');if(sel){sel.value=String(id);updateLotOptions()}};
async function suppliersPage(c){
 const list=await api('/suppliers');
 const rows=list.map(s=>'<tr><td class="product-cell">'+esc(s.name)+'</td><td>'+esc(s.cnpj||'—')+'</td><td>'+esc(s.contact||'—')+'</td><td>'+esc(s.phone||'—')+'</td><td>'+esc(s.email||'—')+'</td><td>'+s.product_count+'</td><td>'+(canWrite()?'<button class="secondary" onclick="editSupplier('+s.id+')">Editar</button>':'—')+'</td></tr>').join('');
 c.innerHTML=pageHead('Fornecedores','Mantenha contatos comerciais e associe fornecedores aos materiais.',canWrite()?btn('＋ Novo fornecedor','editSupplier()'):'')+'<div class="panel"><div class="panel-head"><div><h3>Cadastro de fornecedores</h3><p>'+list.length+' fornecedores ativos</p></div><input class="search" id="supplierSearch" placeholder="Buscar fornecedor…" oninput="filterTable(\'supplierSearch\',\'supplierTable\')"></div><div id="supplierTable">'+table(['FORNECEDOR','CNPJ','CONTATO','TELEFONE','E-MAIL','MATERIAIS','AÇÕES'],rows)+'</div></div>';roleUI();
}
window.editSupplier=async id=>{if(!canWrite())return;const s=id?(await api('/suppliers')).find(x=>x.id===id):{};showModal(id?'Editar fornecedor':'Novo fornecedor','Cadastre os dados comerciais do fornecedor.', '<form id="supplierForm"><div class="form-grid"><label class="field">Nome / razão social *<input name="name" required value="'+esc(s.name||'')+'"></label><label class="field">CNPJ<input name="cnpj" value="'+esc(s.cnpj||'')+'"></label><label class="field">Contato<input name="contact" value="'+esc(s.contact||'')+'"></label><label class="field">Telefone<input name="phone" value="'+esc(s.phone||'')+'"></label><label class="field">E-mail<input name="email" type="email" value="'+esc(s.email||'')+'"></label><label class="field">Endereço<input name="address" value="'+esc(s.address||'')+'"></label><label class="field full">Observações<textarea name="notes" rows="2">'+esc(s.notes||'')+'</textarea></label></div></form>',async()=>{const f=$('#supplierForm');if(!f.reportValidity())return;await api('/suppliers'+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify(Object.fromEntries(new FormData(f)))});closeModal();toast('Fornecedor salvo.');await renderPage()})};
async function auditPage(c){
 if(state.user?.role!=='admin')throw new Error('Acesso restrito ao administrador.');
 c.innerHTML=pageHead('Auditoria completa','Histórico de operações autenticadas; senhas e tokens não são registrados.')+'<div class="panel"><div class="v2-filter-grid"><label class="field">De<input id="auditFrom" type="date"></label><label class="field">Até<input id="auditTo" type="date"></label><label class="field">Usuário<input id="auditUser" placeholder="Nome ou login"></label><button class="primary" id="auditSearch">Filtrar</button></div><div id="auditTable"></div></div>';
 $('#auditSearch').onclick=async()=>{const q=new URLSearchParams();if($('#auditFrom').value)q.set('from',$('#auditFrom').value);if($('#auditTo').value)q.set('to',$('#auditTo').value);if($('#auditUser').value.trim())q.set('user',$('#auditUser').value.trim());const rows=await api('/audit?'+q.toString());$('#auditTable').innerHTML=table(['DATA / HORA','USUÁRIO','AÇÃO','MÓDULO','DETALHES','ORIGEM'],rows.map(a=>'<tr><td>'+esc(a.created_at)+'</td><td>'+esc(a.user_name||a.username||'—')+'</td><td>'+esc(a.action)+'</td><td>'+esc(a.entity)+'</td><td>'+esc(a.details)+'</td><td>'+esc(a.ip_address||'—')+'</td></tr>').join(''),'Nenhuma operação encontrada.')};await $('#auditSearch').click();
}
async function securityPage(c){
 if(state.user?.role!=='admin')throw new Error('Acesso restrito ao administrador.');
 const backups=await api('/backups');
 c.innerHTML=pageHead('Segurança e backup','Backups do banco de dados com retenção dos 14 arquivos mais recentes.',btn('＋ Criar backup agora','createBackupNow()'))+
 '<div class="panel"><h3>Proteção dos dados</h3><ul class="v2-security-list"><li>O servidor cria um backup ao iniciar e agenda novas cópias a cada 24 horas.</li><li>Os backups ficam no diretório de dados do servidor e são limitados aos 14 mais recentes.</li><li>Baixe uma cópia externa regularmente e mantenha-a em local protegido.</li><li>Use senhas individuais, restrinja o acesso ao servidor e não exponha a porta do sistema à internet.</li></ul><p class="helper">A restauração automática pela interface ainda não está habilitada; antes de recuperar um banco, interrompa o serviço e valide a cópia com suporte técnico. Esta versão não implementa MFA nem HTTPS na rede local.</p></div><div class="panel" style="margin-top:16px"><div class="panel-head"><div><h3>Backups disponíveis</h3><p>'+backups.length+' cópias no servidor</p></div><button class="secondary" onclick="renderPage()">Atualizar lista</button></div>'+table(['ARQUIVO','CRIADO EM','TAMANHO','AÇÃO'],backups.map(b=>'<tr><td>'+esc(b.name)+'</td><td>'+esc(new Date(b.created_at).toLocaleString('pt-BR'))+'</td><td>'+num(Math.round(b.size/1024))+' KB</td><td><button class="secondary" onclick="downloadBackup(\''+esc(b.name)+'\')">Baixar</button></td></tr>').join(''),'Nenhum backup criado ainda.')+'</div>';roleUI();
}
window.createBackupNow=async()=>{try{const r=await api('/backups',{method:'POST',body:JSON.stringify({})});toast('Backup criado: '+r.name);await renderPage()}catch(e){toast(e.message,true)}};
window.downloadBackup=async name=>{try{const r=await fetch('/api/backups/'+encodeURIComponent(name)+'/download',{headers:{Authorization:'Bearer '+state.token}});if(!r.ok){const d=await r.json();throw new Error(d.error||'Falha ao baixar backup')}const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}catch(e){toast(e.message,true)}};
async function advancedReportsPage(c){
 const [products,users]=await Promise.all([api('/products'),state.user?.role==='admin'?api('/users'):Promise.resolve([])]);
 c.innerHTML=pageHead('Relatórios avançados','Filtre movimentações por período, material, usuário e tipo; use Imprimir para salvar em PDF.',btn('Imprimir / PDF','window.print()','secondary'))+
 '<div class="panel"><div class="v2-filter-grid"><label class="field">Data inicial<input id="repFrom" type="date"></label><label class="field">Data final<input id="repTo" type="date"></label><label class="field">Material<select id="repProduct"><option value="">Todos</option>'+products.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('')+'</select></label><label class="field">Tipo<select id="repType"><option value="">Todos</option><option value="entrada">Entrada</option><option value="saida">Saída</option><option value="perda">Perda</option><option value="ajuste">Ajuste</option></select></label>'+(users.length?'<label class="field">Usuário<select id="repUser"><option value="">Todos</option>'+users.map(u=>'<option value="'+u.id+'">'+esc(u.name)+'</option>').join('')+'</select></label>':'')+'<button class="primary" id="repSearch">Aplicar filtros</button></div><div id="advancedReportTable"></div></div>';
 $('#repSearch').onclick=async()=>{const q=new URLSearchParams();if($('#repFrom').value)q.set('from',$('#repFrom').value);if($('#repTo').value)q.set('to',$('#repTo').value);if($('#repProduct').value)q.set('product_id',$('#repProduct').value);if($('#repType').value)q.set('type',$('#repType').value);const user=$('#repUser');if(user?.value)q.set('user_id',user.value);const rows=await api('/reports/advanced?'+q.toString());$('#advancedReportTable').innerHTML=table(['DATA','MATERIAL','TIPO','QUANTIDADE','LOTE','VALIDADE','MOTIVO','USUÁRIO','CIRURGIA'],rows.map(m=>'<tr><td>'+esc(m.created_at)+'</td><td>'+esc(m.product_name)+'</td><td>'+typePill(m.type)+'</td><td>'+num(m.quantity)+' '+esc(m.unit)+'</td><td>'+esc(m.lot_code||'—')+'</td><td>'+moneyDate(m.expiry_date)+'</td><td>'+esc(m.reason)+'</td><td>'+esc(m.user_name||'—')+'</td><td>'+esc(m.surgery_code||'—')+'</td></tr>').join(''),'Nenhuma movimentação encontrada.')};await $('#repSearch').click();
}
