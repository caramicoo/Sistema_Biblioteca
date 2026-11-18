/* Sistema de Biblioteca — frontend integrado à API e ao MySQL. */
(() => {
  'use strict';
  const SESSION_KEY = 'biblioteca_api_token_v1';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const escapeHTML = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const pad = n => String(n).padStart(2, '0');
  const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const daysFromToday = offset => {const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate() + offset); return isoDate(d);};
  const dateFromIso = str => {const [y,m,d] = String(str).slice(0,10).split('-').map(Number); return new Date(y,m-1,d,12,0,0,0);};
  const formatDate = str => {if(!str) return '—'; const d = dateFromIso(str); return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('pt-BR').format(d) : '—';};
  const diffDays = (first,second) => Math.round((dateFromIso(first) - dateFromIso(second))/86400000);
  const daysLate = loan => loan.dataDevolucao ? 0 : Math.max(0,diffDays(daysFromToday(0),loan.dataPrevista));
  const emptyData = () => ({livros:[],exemplares:[],leitores:[],emprestimos:[],reservas:[]});
  let data = emptyData();
  let token = sessionStorage.getItem(SESSION_KEY) || '';
  async function api(method,path,body){
    const headers = {Accept:'application/json'};
    if(token)headers.Authorization = 'Bearer ' + token;
    if(body!==undefined)headers['Content-Type']='application/json';
    let response;
    try { response=await fetch('/api'+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})}); }
    catch { throw new Error('Falha de comunicação com a API; verifique Node.js e MySQL.'); }
    const result=await response.json().catch(()=>({}));
    if(!response.ok){
      if(response.status===401 && path!=='/auth/login'){
        token='';sessionStorage.removeItem(SESSION_KEY);
        $('#appShell').hidden=true;$('#loginScreen').hidden=false;
      }
      throw new Error(result.erro||'Erro HTTP '+response.status);
    }
    return result;
  }
  async function collect(route){
    const rows=[];
    for(let page=1;page<=100;page++){
      const result=await api('GET',route+'?limit=100&page='+page);
      if(!Array.isArray(result.dados))throw new Error('Resposta inesperada da API.');
      rows.push(...result.dados);
      if(result.dados.length<100)return rows;
    }
    throw new Error('Muitos registros para esta visualização.');
  }
  async function refreshData(){
    const [livros,exemplares,leitores,emprestimos,reservas]=await Promise.all([
      collect('/livros'),collect('/exemplares'),collect('/leitores'),collect('/emprestimos'),collect('/reservas')
    ]);
    data={
      livros:livros.map(v=>({id:Number(v.id_livro),titulo:v.titulo,autor:v.autor,isbn:v.isbn,categoria:v.categoria||''})),
      exemplares:exemplares.map(v=>({id:Number(v.id_exemplar),livroId:Number(v.id_livro),tombo:v.tombo,situacao:v.situacao})),
      leitores:leitores.map(v=>({id:Number(v.id_leitor),nome:v.nome,identificacao:v.identificacao,contato:v.contato,ativo:Boolean(v.ativo)})),
      emprestimos:emprestimos.map(v=>({id:Number(v.id_emprestimo),leitorId:Number(v.id_leitor),exemplarId:Number(v.id_exemplar),funcionarioRetiradaId:Number(v.id_funcionario_retirada),funcionarioDevolucaoId:v.id_funcionario_devolucao==null?null:Number(v.id_funcionario_devolucao),dataRetirada:v.data_retirada?.slice(0,10),dataPrevista:v.data_prevista?.slice(0,10),dataDevolucao:v.data_devolucao?.slice(0,10)||null})),
      reservas:reservas.map(v=>({id:Number(v.id_reserva),leitorId:Number(v.id_leitor),exemplarId:Number(v.id_exemplar),funcionarioId:Number(v.id_funcionario),dataReserva:v.data_reserva?.slice(0,10),situacao:v.situacao}))
    };
    render();
  }
  async function perform(method,path,body,message){
    try{await api(method,path,body);await refreshData();showToast(message);return true;}
    catch(error){showToast(error.message,true);return false;}
  }
  let currentRoute = 'dashboard';
  let activeModalConfirm = null;
  let toastTimer = 0;
  const routes = {
    dashboard:'VISÃO GERAL',acervo:'ACERVO',leitores:'LEITORES',emprestimos:'EMPRÉSTIMOS',
    devolucoes:'DEVOLUÇÕES',reservas:'RESERVAS',vencidos:'VENCIDOS',sobre:'SOBRE O PROJETO'
  };
  const bookById = id => data.livros.find(v=>v.id===Number(id));
  const readerById = id => data.leitores.find(v=>v.id===Number(id));
  const copyById = id => data.exemplares.find(v=>v.id===Number(id));
  const bookForCopy = id => {const c=copyById(id);return c?bookById(c.livroId):null;};
  const openLoan = copyId => data.emprestimos.find(v=>v.exemplarId===Number(copyId)&&!v.dataDevolucao);
  const activeReservation = copyId => data.reservas.find(v=>v.exemplarId===Number(copyId)&&v.situacao==='ativa');
  const copyStatus = id => openLoan(id) ? 'emprestado' : activeReservation(id) ? 'reservado' : 'disponível';
  const openLoans = () => data.emprestimos.filter(v=>!v.dataDevolucao);
  const overdueLoans = () => openLoans().filter(v=>daysLate(v)>0).sort((a,b)=>daysLate(b)-daysLate(a));
  const hasOverdue = readerId => overdueLoans().some(v=>v.leitorId===Number(readerId));
  const activeReservations = () => data.reservas.filter(v=>v.situacao==='ativa');
  const e = value => escapeHTML(value);
  const dateToday = daysFromToday(0);
  function badge(status) {
    const map={disponível:['badge-green','Disponível'],emprestado:['badge-blue','Emprestado'],reservado:['badge-amber','Reservado'],vencido:['badge-red','Vencido'],ativo:['badge-green','Ativo'],atendida:['badge-green','Atendida'],cancelada:['badge-gray','Cancelada']};
    const found=map[status]||['badge-gray',status];return `<span class="badge ${found[0]}">${found[1]}</span>`;
  }
  const table = (headers, rows, empty='Nenhum registro encontrado.') => `<div class="panel"><div class="table-wrap"><table class="table"><thead><tr>${headers.map(v=>`<th scope="col">${v}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.join(''):`<tr><td colspan="${headers.length}"><div class="empty"><div class="empty-icon">▤</div><strong>Sem resultados</strong>${e(empty)}</div></td></tr>`}</tbody></table></div></div>`;
  const head = (title,description,buttons='')=>`<div class="page-head"><div><div class="eyebrow">SISTEMA DE BIBLIOTECA</div><h1>${title}</h1><p>${description}</p></div><div class="page-actions">${buttons}</div></div>`;
  const warning = (title,text)=>`<div class="info-line"><span style="font-size:17px">ⓘ</span><div><strong>${title}</strong> ${text}</div></div>`;
  function showToast(message,error=false){const node=$('#toast');node.textContent=message;node.className=`toast show${error?' error':''}`;window.clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>node.className='toast',4200);}
  function closeModal(){const root=$('#modalRoot');root.hidden=true;root.innerHTML='';activeModalConfirm=null;}
  function modal(title,description,html,{submitLabel='Salvar',onConfirm=null,showFooter=true}={}){
    activeModalConfirm=onConfirm;
    const root=$('#modalRoot');root.hidden=false;
    root.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div class="modal-head"><div><h2 id="modalTitle">${title}</h2><p>${description}</p></div><button type="button" class="modal-close" data-close-modal aria-label="Fechar">×</button></div><form id="modalForm"><div class="modal-body">${html}${showFooter?`<div class="modal-foot"><button class="btn btn-outline" type="button" data-close-modal>Cancelar</button><button type="submit" class="btn btn-primary">${submitLabel}</button></div>`:''}</div></form></div>`;
    $('input:not([type=hidden]),select,button',root)?.focus();
  }
  function navigate(route){
    if(!routes[route])return;currentRoute=route;
    $$('.nav-link[data-route]').forEach(b=>b.classList.toggle('active',b.dataset.route===route));
    $('#currentPageText').textContent=routes[route];
    $('#view').innerHTML=views[route]();
    $('#sidebar').classList.remove('open');$('#mobileScrim').classList.remove('open');
    window.scrollTo({top:0,behavior:'instant'});
    if(route==='acervo') updateBookRows();
    if(route==='leitores') updateReaderRows();
  }
  const render=()=>navigate(currentRoute);
  function metric(label,num,sub,symbol,red=false){return `<div class="metric ${red?'metric-red':''}"><div class="metric-top"><span>${label}</span><span class="metric-symbol">${symbol}</span></div><div class="metric-value">${num}</div><div class="metric-sub">${sub}</div></div>`;}
  function dashboard(){
    const today=formatDate(dateToday);
    const available=data.exemplares.filter(c=>copyStatus(c.id)==='disponível').length;
    const recent=[...openLoans()].sort((a,b)=>b.id-a.id).slice(0,4);
    const activities=recent.map(l=>`<div class="activity"><div class="activity-icon">↗</div><div><strong>${e(bookForCopy(l.exemplarId)?.titulo||'Livro')}</strong><span>Empréstimo de ${e(readerById(l.leitorId)?.nome||'Leitor')} • prazo ${formatDate(l.dataPrevista)}</span></div></div>`).join('');
    return `<div class="page-head"><div><div class="eyebrow">PAINEL DO FUNCIONÁRIO</div><h1>Visão geral</h1><p>Registros carregados do MySQL. ${today}.</p></div><div class="page-actions"><button class="btn btn-outline" data-action="refresh-data">↻ Atualizar dados</button></div></div>
      <div class="hero"><div><div class="eyebrow">GESTÃO SIMPLIFICADA</div><h1>Todos os livros e atendimentos, em um só lugar.</h1><p>Consulte o acervo, registre retiradas e acompanhe devoluções com clareza.</p></div><button class="btn" data-route="emprestimos">Novo empréstimo <span>→</span></button></div>
      <div class="metrics">${metric('Obras cadastradas',data.livros.length,'Títulos no catálogo','▤')}${metric('Exemplares livres',available,'Cópias disponíveis','▣')}${metric('Empréstimos abertos',openLoans().length,'Retiradas sem devolução','↗')}${metric('Empréstimos vencidos',overdueLoans().length,'Resultado da consulta de prazos','◷',true)}</div>
      <div class="content-grid"><div class="panel"><div class="panel-head"><h2 class="panel-title">Empréstimos em andamento</h2><button class="text-link" data-route="emprestimos">Ver todos →</button></div><div class="panel-content">${activities||'<div class="empty">Nenhum empréstimo em aberto.</div>'}</div></div>
      <div class="panel"><div class="panel-head"><h2 class="panel-title">Acesso rápido</h2></div><div class="panel-content">
      <div class="notice-card"><div class="notice-icon">⌕</div><div><strong>Pesquisar livros</strong><span>Encontre títulos, autores e ISBN</span></div><button class="btn btn-sm btn-outline" data-route="acervo">Abrir</button></div>
      <div class="notice-card"><div class="notice-icon">▣</div><div><strong>Reservas ativas</strong><span>${activeReservations().length} registro(s) pendente(s)</span></div><button class="btn btn-sm btn-outline" data-route="reservas">Abrir</button></div>
      <div class="notice-card"><div class="notice-icon">◷</div><div><strong>Consultar vencidos</strong><span>Consulta manual, sem alertas automáticos</span></div><button class="btn btn-sm btn-outline" data-route="vencidos">Abrir</button></div></div></div></div>`;
  }
  function bookRows(q=''){
    const normalized=q.toLocaleLowerCase('pt-BR').trim();
    const filtered=data.livros.filter(book=>[book.titulo,book.autor,book.isbn].some(value=>String(value).toLocaleLowerCase('pt-BR').includes(normalized)));
    return filtered.map(book=>{
      const copies=data.exemplares.filter(copy=>copy.livroId===book.id);
      const available=copies.filter(copy=>copyStatus(copy.id)==='disponível').length;
      return `<tr><td><div class="book-title"><div class="book-thumb">▤</div><div><strong>${e(book.titulo)}</strong><span class="subcell">${e(book.autor)}</span></div></div></td><td>${e(book.isbn)}</td><td>${e(book.categoria)}</td><td>${copies.length}</td><td>${available} livre(s)</td><td><button class="text-link" data-action="show-book" data-id="${book.id}">Ver exemplares →</button></td></tr>`;
    });
  }
  function acervo(){return head('Acervo da biblioteca','Cadastre obras, consulte títulos e verifique a disponibilidade de cada exemplar.',`<button class="btn btn-primary" data-action="create-book">＋ Cadastrar livro</button>`)
    +`<div class="quick-stats"><span class="stat-chip"><strong>${data.livros.length}</strong> obras</span><span class="stat-chip"><strong>${data.exemplares.length}</strong> exemplares</span></div>`
    +`<div class="toolbar"><div class="search"><span class="search-symbol">⌕</span><input id="bookSearch" aria-label="Buscar por título, autor ou ISBN" placeholder="Busque por título, autor ou ISBN..."></div></div>`
    +`<div class="panel"><div class="table-wrap"><table class="table"><thead><tr><th>Livro</th><th>ISBN</th><th>Categoria</th><th>Cópias</th><th>Disponibilidade</th><th>Detalhes</th></tr></thead><tbody id="bookTableBody"></tbody></table></div></div>`;}
  function updateBookRows(){let element=$('#bookTableBody');if(!element)return;const rows=bookRows($('#bookSearch')?.value||'');element.innerHTML=rows.length?rows.join(''):`<tr><td colspan="6"><div class="empty"><strong>Nenhum livro encontrado.</strong>Tente outro título, autor ou ISBN.</div></td></tr>`;}
  function readerRows(q=''){
    const query=q.toLocaleLowerCase('pt-BR').trim();
    return data.leitores.filter(r=>[r.nome,r.identificacao,r.contato].some(v=>String(v).toLocaleLowerCase('pt-BR').includes(query))).map(r=>`<tr><td><strong>${e(r.nome)}</strong><span class="subcell">${e(r.identificacao)}</span></td><td>${e(r.contato)}</td><td>${r.ativo?badge('ativo'):badge('cancelada')}</td><td>${hasOverdue(r.id)?badge('vencido'):'Em dia'}</td><td><button class="text-link" data-action="show-reader" data-id="${r.id}">Ver ficha →</button></td></tr>`);
  }
  function leitores(){return head('Leitores','Cadastre e consulte pessoas que utilizam os serviços da biblioteca.',`<button class="btn btn-primary" data-action="create-reader">＋ Cadastrar leitor</button>`)
    +`<div class="toolbar"><div class="search"><span class="search-symbol">⌕</span><input id="readerSearch" aria-label="Buscar leitores" placeholder="Busque por nome, identificação ou contato..."></div></div>`
    +`<div class="panel"><div class="table-wrap"><table class="table"><thead><tr><th>Leitor</th><th>Contato</th><th>Situação</th><th>Empréstimos</th><th>Detalhes</th></tr></thead><tbody id="readerTableBody"></tbody></table></div></div>`;}
  function updateReaderRows(){const element=$('#readerTableBody');if(!element)return;const rows=readerRows($('#readerSearch')?.value||'');element.innerHTML=rows.length?rows.join(''):`<tr><td colspan="5"><div class="empty"><strong>Nenhum leitor encontrado.</strong>Tente outra pesquisa.</div></td></tr>`;}
  function selectReaders(){return data.leitores.filter(r=>r.ativo).map(r=>`<option value="${r.id}">${e(r.nome)} • ${e(r.identificacao)}${hasOverdue(r.id)?' (com atraso)':''}</option>`).join('');}
  function selectCopies(includeLoaned=false){return data.exemplares.filter(c=>includeLoaned||!openLoan(c.id)).map(c=>`<option value="${c.id}">${e(bookForCopy(c.id)?.titulo||'?')} • ${e(c.tombo)} (${copyStatus(c.id)})</option>`).join('');}
  function loanRows(){return openLoans().slice().sort((a,b)=>b.id-a.id).map(l=>`<tr><td><strong>${e(bookForCopy(l.exemplarId)?.titulo||'')}</strong><span class="subcell">${e(copyById(l.exemplarId)?.tombo||'')}</span></td><td>${e(readerById(l.leitorId)?.nome||'')}</td><td>${formatDate(l.dataRetirada)}</td><td>${formatDate(l.dataPrevista)}</td><td>${daysLate(l)?badge('vencido'):badge('emprestado')}</td><td><button class="text-link" data-action="start-return" data-id="${l.id}">Devolver →</button></td></tr>`);}
  function emprestimos(){return head('Empréstimos','Registre retiradas realizadas pelo funcionário e acompanhe os empréstimos em aberto.')
    +`<div class="form-card"><h2>Registrar novo empréstimo</h2><p>Selecione o leitor e o exemplar. O sistema verificará se a retirada é permitida.</p>
    <form id="loanForm"><div class="form-grid"><div><label for="loanReader">Leitor *</label><select id="loanReader" name="leitorId" required><option value="">Selecione o leitor</option>${selectReaders()}</select></div><div><label for="loanCopy">Exemplar *</label><select id="loanCopy" name="exemplarId" required><option value="">Selecione o exemplar</option>${selectCopies()}</select></div><div><label for="loanDue">Prazo de devolução *</label><input type="date" id="loanDue" name="dataPrevista" min="${dateToday}" required></div></div>
    <div class="form-actions"><span class="form-help">O prazo é informado manualmente. A política definitiva ainda será validada.</span><button class="btn btn-primary" type="submit">Registrar empréstimo →</button></div></form></div>
    <h2 class="section-title">Empréstimos em aberto</h2>${table(['Obra / exemplar','Leitor','Retirada','Prazo','Situação','Ação'],loanRows(),'Nenhum empréstimo em aberto.')}`;}
  function devolucoes(){return head('Devoluções','Localize um empréstimo em aberto e registre o recebimento do exemplar.')
    +warning('Regra RN05:', 'ao devolver, o empréstimo é encerrado; o exemplar fica disponível ou reservado caso exista uma reserva ativa.')
    +table(['Obra / exemplar','Leitor','Retirada','Prazo','Situação','Ação'],loanRows(),'Nenhuma devolução pendente.')
    +`<div class="callout" style="margin-top:17px">A devolução registra a data e o funcionário responsável. A demonstração utiliza o funcionário atualmente autenticado.</div>`;}
  function reservationRows(){return data.reservas.slice().sort((a,b)=>b.id-a.id).map(r=>`<tr><td><strong>${e(bookForCopy(r.exemplarId)?.titulo||'')}</strong><span class="subcell">${e(copyById(r.exemplarId)?.tombo||'')}</span></td><td>${e(readerById(r.leitorId)?.nome||'')}</td><td>${formatDate(r.dataReserva)}</td><td>${r.situacao==='ativa'?badge('reservado'):badge(r.situacao)}</td><td>${r.situacao==='ativa'?`<button class="text-link" data-action="cancel-reservation" data-id="${r.id}">Cancelar →</button>`:'—'}</td></tr>`);}
  function reservas(){return head('Reservas','O leitor solicita a reserva ao funcionário, que realiza o registro no sistema.')
    +`<div class="form-card"><h2>Registrar nova reserva</h2><p>Identifique o leitor e a cópia solicitada. Reservas são registradas exclusivamente pelo funcionário.</p>
    <form id="reservationForm"><div class="form-grid two"><div><label for="reservationReader">Leitor *</label><select id="reservationReader" name="leitorId" required><option value="">Selecione o leitor</option>${selectReaders()}</select></div><div><label for="reservationCopy">Exemplar *</label><select id="reservationCopy" name="exemplarId" required><option value="">Selecione o exemplar</option>${selectCopies(true)}</select></div></div>
    <div class="form-actions"><span class="form-help">Ordem e prazos de reservas: pendentes de definição.</span><button class="btn btn-primary" type="submit">Registrar reserva →</button></div></form></div>
    <h2 class="section-title">Reservas registradas</h2>${table(['Obra / exemplar','Leitor','Data','Situação','Ação'],reservationRows(),'Nenhuma reserva registrada.')}`;}
  function vencidos(){return head('Consulta de vencidos','Visualize empréstimos cujo prazo expirou e cuja devolução ainda não foi registrada.')
    +warning('Consulta manual (RF08 / RN03):','esta página não envia mensagens nem gera alertas automáticos.')
    +`<div class="quick-stats"><span class="stat-chip"><strong>${overdueLoans().length}</strong> empréstimo(s) vencido(s)</span></div>`
    +table(['Leitor','Obra / exemplar','Prazo previsto','Dias de atraso','Ação'],overdueLoans().map(l=>`<tr><td><strong>${e(readerById(l.leitorId)?.nome||'')}</strong></td><td>${e(bookForCopy(l.exemplarId)?.titulo||'')}<span class="subcell">${e(copyById(l.exemplarId)?.tombo||'')}</span></td><td>${formatDate(l.dataPrevista)}</td><td><span class="overdue-number">${daysLate(l)} dia(s)</span></td><td><button class="text-link" data-action="start-return" data-id="${l.id}">Registrar devolução →</button></td></tr>`),'Nenhum empréstimo vencido encontrado.');}
  function sobre(){
    return head('Sobre o protótipo','Versão de demonstração do frontend do Sistema de Biblioteca.')
      +`<div class="about-grid"><div class="about-card"><h3>O que está incluído</h3><ul><li>Acesso de funcionário (simulado)</li><li>Cadastro e consulta de obras, cópias e leitores</li><li>Registro de empréstimos e devoluções</li><li>Reservas feitas pelo funcionário a pedido do leitor</li><li>Consulta de empréstimos vencidos</li></ul></div><div class="about-card"><h3>O que não está incluído</h3><ul><li>Autenticação real e senhas seguras</li><li>Backend Node.js e API</li><li>Banco MySQL</li><li>Portal do leitor, aplicativo e e-books</li><li>Envio automático de alertas</li></ul></div></div>
      <h2 class="section-title" style="margin-top:28px">Regras representadas na demonstração</h2><div class="rule-list">
      <div class="rule-item"><b>RN01</b><span>Um exemplar emprestado não pode sair novamente. Se estiver reservado, a retirada só é permitida ao leitor que possui a reserva.</span></div>
      <div class="rule-item"><b>RN02</b><span>Leitor com empréstimo vencido não pode realizar novo empréstimo.</span></div>
      <div class="rule-item"><b>RN03</b><span>Vencido é o empréstimo sem devolução com prazo anterior ao dia atual.</span></div>
      <div class="rule-item"><b>RN04</b><span>Reserva solicitada pelo leitor e registrada pelo funcionário, associando os dois e o exemplar.</span></div>
      <div class="rule-item"><b>RN05</b><span>Após devolução, o exemplar fica reservado quando existe reserva ativa; caso contrário, disponível.</span></div>
      <div class="rule-item"><b>RN06</b><span>O mesmo leitor não pode manter duas reservas ativas para o mesmo exemplar. Por enquanto, o protótipo também impede reservas simultâneas de leitores diferentes para um exemplar, até a definição da fila.</span></div>
      </div><div class="callout" style="margin-top:23px"><strong>Limite deste MVP:</strong> os dados fictícios são salvos apenas neste navegador, quando o armazenamento está disponível. Não há autenticação segura nem integração com servidor. Os prazos, limites por leitor e a ordem de atendimento de reservas ainda dependem de validação.</div>`;
  }
  const views={dashboard,acervo,leitores,emprestimos,devolucoes,reservas,vencidos,sobre};
  function createBook(){modal('Cadastrar livro','Cadastre uma obra e seu primeiro exemplar.',`<label for="newBookTitle">Título *</label><input id="newBookTitle" name="titulo" maxlength="150" required><label for="newBookAuthor">Autor *</label><input id="newBookAuthor" name="autor" maxlength="120" required><label for="newBookISBN">ISBN *</label><input id="newBookISBN" name="isbn" maxlength="22" required><label for="newBookCategory">Categoria *</label><input id="newBookCategory" name="categoria" maxlength="80" required><label for="newBookCopy">Tombo do exemplar *</label><input id="newBookCopy" name="tombo" maxlength="30" placeholder="Ex.: T-0010" required>`,{submitLabel:'Cadastrar livro',onConfirm:async form=>{
      const value=Object.fromEntries(new FormData(form));
      Object.keys(value).forEach(key=>value[key]=value[key].trim());
      return perform('POST','/livros/com-exemplar',value,'Livro e exemplar cadastrados no MySQL.');
    }});}
  function showBook(id){const book=bookById(id);if(!book)return;const copies=data.exemplares.filter(c=>c.livroId===book.id);
    const copyRows=copies.map(c=>`<div class="modal-detail"><span>${e(c.tombo)}</span><strong>${badge(copyStatus(c.id))}${activeReservation(c.id)&&openLoan(c.id)?' • com reserva':''}</strong></div>`).join('');
    modal('Exemplares da obra',`${e(book.titulo)} • ${e(book.autor)}`,`<div class="modal-detail"><span>ISBN</span><strong>${e(book.isbn)}</strong></div><div class="modal-detail"><span>Categoria</span><strong>${e(book.categoria)}</strong></div>${copyRows}<div class="modal-foot"><button type="button" class="btn btn-outline" data-close-modal>Fechar</button><button type="button" class="btn btn-primary" data-action="add-copy" data-id="${book.id}">＋ Adicionar exemplar</button></div>`,{showFooter:false});}
  function addCopy(bookId){const book=bookById(bookId);if(!book)return;modal('Adicionar exemplar',`Nova cópia física de ${e(book.titulo)}.`,`<label for="newCopyTombo">Número de tombo único *</label><input id="newCopyTombo" name="tombo" maxlength="30" placeholder="Ex.: T-0010" required>`,{submitLabel:'Adicionar exemplar',onConfirm:async form=>perform('POST','/exemplares',{id_livro:bookId,tombo:form.tombo.value.trim()},'Exemplar cadastrado no banco.')});}
  function createReader(){modal('Cadastrar leitor','O leitor é identificado, mas não possui login no sistema.',`<label for="readerName">Nome completo *</label><input id="readerName" name="nome" maxlength="100" required><label for="readerId">Identificação *</label><input id="readerId" name="identificacao" maxlength="30" placeholder="Ex.: L-0006" required><label for="readerContact">Contato *</label><input id="readerContact" name="contato" maxlength="120" placeholder="Telefone ou e-mail de exemplo" required>`,{submitLabel:'Cadastrar leitor',onConfirm:async form=>{
        const value=Object.fromEntries(new FormData(form));
        Object.keys(value).forEach(key=>value[key]=value[key].trim());
        return perform('POST','/leitores',value,'Leitor cadastrado no banco.');
      }});}
  function showReader(id){const r=readerById(id);if(!r)return;const readerLoans=openLoans().filter(l=>l.leitorId===r.id);modal('Ficha do leitor','Informações de consulta',`<div class="modal-detail"><span>Nome</span><strong>${e(r.nome)}</strong></div><div class="modal-detail"><span>Identificação</span><strong>${e(r.identificacao)}</strong></div><div class="modal-detail"><span>Contato</span><strong>${e(r.contato)}</strong></div><div class="modal-detail"><span>Empréstimos abertos</span><strong>${readerLoans.length}</strong></div><div class="modal-detail"><span>Possui atraso?</span><strong>${hasOverdue(r.id)?'Sim':'Não'}</strong></div><div class="modal-foot"><button type="button" class="btn btn-outline" data-close-modal>Fechar</button></div>`,{showFooter:false});}
  async function registerLoan(form){
    const id_leitor=Number(form.leitorId.value),id_exemplar=Number(form.exemplarId.value),data_prevista=form.dataPrevista.value;
    if(!readerById(id_leitor)?.ativo)return showToast('Selecione um leitor ativo.',true);
    if(!copyById(id_exemplar))return showToast('Selecione um exemplar válido.',true);
    if(data_prevista<daysFromToday(0))return showToast('Informe prazo válido.',true);
    await perform('POST','/emprestimos',{id_leitor,id_exemplar,data_prevista},'Empréstimo registrado no MySQL.');
  }
  function startReturn(id){const loan=data.emprestimos.find(l=>l.id===Number(id)&&!l.dataDevolucao);if(!loan)return showToast('Empréstimo não está em aberto.',true);
    const title=e(bookForCopy(loan.exemplarId)?.titulo||'Livro'),copy=e(copyById(loan.exemplarId)?.tombo||'');const reservation=activeReservation(loan.exemplarId);
    modal('Confirmar devolução',`Registro de devolução do exemplar ${copy}.`,`<div class="modal-detail"><span>Livro</span><strong>${title}</strong></div><div class="modal-detail"><span>Leitor</span><strong>${e(readerById(loan.leitorId)?.nome||'')}</strong></div><div class="modal-detail"><span>Data de devolução</span><strong>${formatDate(daysFromToday(0))}</strong></div><div class="modal-detail"><span>Depois de devolver</span><strong>${reservation?'Exemplar reservado':'Exemplar disponível'}</strong></div>`,{submitLabel:'Confirmar devolução',onConfirm:async()=>perform('PUT',`/emprestimos/${id}/devolucao`,undefined,'Devolução registrada no MySQL.')});
  }
  async function registerReservation(form){
    const id_leitor=Number(form.leitorId.value),id_exemplar=Number(form.exemplarId.value);
    if(!readerById(id_leitor)?.ativo)return showToast('Selecione um leitor ativo.',true);
    if(!copyById(id_exemplar))return showToast('Exemplar inválido.',true);
    await perform('POST','/reservas',{id_leitor,id_exemplar},'Reserva registrada no MySQL.');
  }
  function cancelReservation(id){const reservation=data.reservas.find(r=>r.id===Number(id)&&r.situacao==='ativa');if(!reservation)return showToast('Reserva não está ativa.',true);
    modal('Cancelar reserva','Esta ação encerra a reserva ativa no MySQL.',`<div class="modal-detail"><span>Livro</span><strong>${e(bookForCopy(reservation.exemplarId)?.titulo||'')}</strong></div><div class="modal-detail"><span>Leitor</span><strong>${e(readerById(reservation.leitorId)?.nome||'')}</strong></div>`,{submitLabel:'Confirmar cancelamento',onConfirm:async()=>perform('PUT',`/reservas/${id}/cancelamento`,undefined,'Reserva cancelada no MySQL.')});
  }
  async function updateFromServer(){
    try{await refreshData();showToast('Dados atualizados.');}
    catch(error){showToast(error.message,true);}
  }
  document.addEventListener('click',event=>{
    const routeButton=event.target.closest('[data-route]');if(routeButton){navigate(routeButton.dataset.route);return;}
    const closeButton=event.target.closest('[data-close-modal]');if(closeButton){closeModal();return;}
    const button=event.target.closest('[data-action]');if(!button)return;
    const id=Number(button.dataset.id);
    switch(button.dataset.action){case 'refresh-data':updateFromServer();break;case 'create-book':createBook();break;case 'show-book':showBook(id);break;case 'add-copy':addCopy(id);break;case 'create-reader':createReader();break;case 'show-reader':showReader(id);break;case 'start-return':startReturn(id);break;case 'cancel-reservation':cancelReservation(id);break;}
  });
  document.addEventListener('input',event=>{if(event.target.id==='bookSearch')updateBookRows();if(event.target.id==='readerSearch')updateReaderRows();});
  document.addEventListener('submit',async event=>{
    if(event.target.id==='loginForm'){
      event.preventDefault();
      const form=event.target,button=form.querySelector('button[type=submit]');
      button.disabled=true;$('#loginError').hidden=true;
      try{
        const result=await api('POST','/auth/login',{login:form.usuario.value.trim(),senha:form.senha.value});
        token=result.token;sessionStorage.setItem(SESSION_KEY,token);
        await refreshData();
        $('#loginScreen').hidden=true;$('#appShell').hidden=false;
        $('.staff-label').textContent=result.funcionario.nome;
        form.senha.value='';
      }catch(error){
        $('#loginError').textContent=error.message;$('#loginError').hidden=false;
      }finally{button.disabled=false;}
      return;
    }
    if(event.target.id==='modalForm'){
      event.preventDefault();const form=event.target,button=form.querySelector('button[type=submit]');
      if(button)button.disabled=true;
      try{if(activeModalConfirm){const ok=await activeModalConfirm(form);if(ok!==false)closeModal();}}
      catch(error){showToast(error.message,true);}
      finally{if(button?.isConnected)button.disabled=false;}
      return;
    }
    if(event.target.id==='loanForm'||event.target.id==='reservationForm'){
      event.preventDefault();
      const button=event.target.querySelector('button[type=submit]');
      button.disabled=true;
      try{
        if(event.target.id==='loanForm')await registerLoan(event.target);
        else await registerReservation(event.target);
      }catch(error){showToast(error.message,true);}
      finally{if(button.isConnected)button.disabled=false;}
    }
  });
  $('#logoutBtn').addEventListener('click',()=>{
    token='';sessionStorage.removeItem(SESSION_KEY);data=emptyData();
    $('#appShell').hidden=true;$('#loginScreen').hidden=false;
    $('#loginPassword').value='';currentRoute='dashboard';closeModal();
  });
  $('#menuToggle').addEventListener('click',()=>{$('#sidebar').classList.add('open');$('#mobileScrim').classList.add('open');});
  $('#mobileScrim').addEventListener('click',()=>{$('#sidebar').classList.remove('open');$('#mobileScrim').classList.remove('open');});
  $('#modalRoot').addEventListener('click',event=>{if(event.target===$('#modalRoot'))closeModal();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('#modalRoot').hidden)closeModal();});
  if(token){
    api('GET','/auth/me').then(user=>refreshData().then(()=>{
      $('#loginScreen').hidden=true;$('#appShell').hidden=false;
      $('.staff-label').textContent=user.nome||'Funcionário';
    })).catch(error=>{
      token='';sessionStorage.removeItem(SESSION_KEY);
      $('#loginError').textContent=error.message;$('#loginError').hidden=false;
    });
  }
})();
