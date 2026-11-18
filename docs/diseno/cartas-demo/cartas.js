'use strict';
const $ = id => document.getElementById(id);
const money = n => 'Q' + n.toFixed(2);
const art = name => 'cartas-demo/' + name + '.webp';
const escapeText = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button = (label, action, cls='action') => '<button class="'+cls+'" data-act="'+action+'">'+label+'</button>';
const heading = title => '<h2 id="dialogTitle">'+title+'</h2>';
const totalRow = (label,n) => '<div class="total"><b>'+label+'</b><strong>'+money(n)+'</strong></div>';
const wrap = content => '<div class="foot">'+content+'</div>';
function product(id,name,en,price,description,image=''){return {id,name,en,price,description,image};}
const brands = {
 miga:{name:'Miga de Oro',place:'Obrador · Antigua Guatemala',edition:'Del horno de hoy',title:'Brioche de cacao.',story:'Lo abrimos todavía tibio. Bajo la corteza dorada queda un corazón de chocolate oscuro.',photo:'pan',caption:'La pieza entera',cta:'Ver el primer bocado',section:'Pan de hoy',kicker:'La carta del obrador',special:'Ver hornadas',products:[
 product('brioche','Brioche de cacao','Chocolate brioche',24,'Masa de mantequilla, azúcar tostada y centro de chocolate. Contiene trigo, lácteos y huevo.','pan'),product('pan','Pan campesino','Country sourdough bread',38,'Una hogaza de masa madre con corteza gruesa. Contiene trigo.'),product('roll','Rol de canela','Cinnamon roll',20,'Canela, mantequilla y glaseado de panela. Contiene trigo, lácteos y huevo.'),product('cafe','Café filtrado','Filter coffee',16,'Una taza de café negro preparado al momento.')]},
 doble:{name:'Doble Fondo',place:'Hamburguesería · Zona 4',edition:'Especialidad de la plancha',title:'Doble Bacon.',story:'Dos carnes a la plancha, cheddar y tocino crujiente. Elige el punto de la carne al pedir.',photo:'doble',caption:'Doble carne · Tocino',cta:'Comparar las dos',section:'La plancha',kicker:'Hechas al pedir',special:'Comparar burgers',products:[
 product('bacon','Doble Bacon','Double bacon burger',68,'Dos carnes, cheddar, tocino y cebolla. Incluye papas.','doble'),product('clasica','La Clásica','Classic cheeseburger',52,'Una carne de 150 g, cheddar, lechuga y tomate. Incluye papas.','clasica'),product('papas','Papas rústicas','Potato wedges',22,'Papas con piel, sal y pimienta.'),product('limon','Limonada','Lemonade',18,'Limón, agua y hielo.')]},
 mesa:{name:'Mesa Larga',place:'Cocina para compartir · Jutiapa',edition:'La mesa de la casa',title:'Alitas al centro.',story:'Ocho alitas BBQ con apio y ranch, y papas con queso para compartir. Arma la mesa a tu gusto.',photo:'alitas',caption:'Una orden · Ocho alitas',cta:'Armar la mesa',section:'Para compartir',kicker:'La carta de la casa',special:'Abrir una ronda',products:[
 product('alitas','Alitas BBQ','Barbecue chicken wings',55,'Ocho alitas, apio y ranch.','alitas'),product('papas','Papas con queso','Cheese fries',35,'Una orden de papas con queso para el centro.'),product('nachos','Nachos supremos','Loaded nachos',48,'Totopos, queso, frijol, guacamole y pico de gallo.'),product('limon','Limonada con menta','Mint lemonade',18,'Un vaso de limonada con hojas de menta.')]}}
let key='miga',scenario='normal',entry='general',limit=12,extras=[],cut=false,groupSize=2,side=35,drinks=false;
let cart=[],order=null,votes=[],activeProduct=null,opener=null;
function brand(){return brands[key];}
function products(){return brand().products.concat(extras);}
function sold(p){return scenario==='sold' && p.id===brand().products[0].id;}
function sum(lines){return lines.reduce((s,l)=>s+l.qty*l.price,0);}
function readState(){
 try{const s=JSON.parse(localStorage.getItem('cartas-demo-v1-'+key)||'{}');cart=s.cart||[];order=s.order||null;votes=s.votes||[];}
 catch{cart=[];order=null;votes=[];}
}
function save(){try{localStorage.setItem('cartas-demo-v1-'+key,JSON.stringify({cart,order,votes}));}catch{}}
function bagLabel(){$('bag').textContent=cart.length?'Mi pedido · '+money(sum(cart)):order?'Ver mi pedido':'Mi pedido';}
function activate(k){
 key=k;scenario='normal';entry='general';extras=[];limit=12;cut=false;side=35;groupSize=2;drinks=false;
 readState();document.body.dataset.brand=key;$('restaurant').value=key;$('entry').value=entry;$('scenario').value=scenario;$('query').value='';
 const b=brand();for(const [id,val] of Object.entries({place:b.place,brand:b.name,edition:b.edition,title:b.title,story:b.story,price:key==='mesa'?'Q45.00 por persona':money(b.products[0].price),discover:b.cta,caption:b.caption,sectionKicker:b.kicker,sectionName:b.section,special:b.special,sheetBrand:b.name}))$(id).textContent=val;
 $('photo').src=art(b.photo);$('photo').alt=b.title;document.title=b.name+' · Cartas vivas';bagLabel();renderList();
}
function fold(v){return v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function renderList(){
 const ready=!['empty','failure'].includes(scenario);$('feature').hidden=entry==='mesa'||!ready;$('special').hidden=!ready;$('query').disabled=!ready;
 $('discover').disabled=false;$('edition').textContent=sold(brand().products[0])?'Especialidad agotada':brand().edition;
 $('sectionKicker').textContent=entry==='mesa'?'Mesa 4 · Pedido en mesa':brand().kicker;
 if(!ready){$('list').innerHTML=scenario==='failure'?'<p>La carta no pudo cargar. Conservamos tu pedido.</p>'+button('Reintentar','retry'):'<p>El restaurante todavía no ha publicado platillos.</p>';return;}
 const q=fold($('query').value.trim()),found=products().filter(p=>fold(p.name+' '+p.en+' '+p.description).includes(q));
 $('list').innerHTML='<div class="items">'+found.slice(0,limit).map(p=>'<button class="item" data-product="'+p.id+'">'+(key==='doble'&&p.image?'<img class="thumb" width="78" height="78" loading="lazy" src="'+art(p.image)+'" alt="">':'')+'<span><b>'+p.name+'</b><small>'+p.description+'</small></span><strong>'+(sold(p)?'Agotado':money(p.price))+'</strong></button>').join('')+'</div>'+
 (!found.length?'<p>No encontramos ese platillo.</p>'+button('Ver toda la carta','clear','lineBtn'):'')+(found.length>limit?button('Ver más · '+(found.length-limit)+' restantes','more','lineBtn'):'');
}
function show(content){
 const d=$('sheet');if(!d.open)opener=document.activeElement;$('inside').innerHTML=content;
 if(!d.open)d.showModal();d.scrollTop=0;const h=$('dialogTitle');h.tabIndex=-1;h.focus({preventScroll:true});
}
function closeSheet(){if($('sheet').open)$('sheet').close();}
$('sheet').addEventListener('close',()=>{if(opener?.isConnected)opener.focus({preventScroll:true});});
function line(p,qty=1,note=''){return {id:p.id,name:p.name,price:p.price,qty,note};}
function add(lines){
 for(const l of lines){const found=cart.find(c=>c.id===l.id&&c.note===l.note);if(found)found.qty+=l.qty;else cart.push({...l});}
 save();bagLabel();cartSheet();
}
function detail(id){
 const p=products().find(p=>p.id===id);if(!p)return;activeProduct=p;
 const burger=key==='doble'&&['bacon','clasica'].includes(id),bread=key==='miga'&&id==='brioche';
 show(heading(p.name)+(p.image?'<img src="'+art(bread&&cut?'corte':p.image)+'" alt="'+(bread&&cut?'Corte del brioche con chocolate':p.name)+'">':'')+
 (bread?button(cut?'Ver la pieza entera':'Abrir y ver el centro','cut','lineBtn'):'')+
 '<p>'+p.description+'</p>'+totalRow('Precio por unidad',p.price)+
 (burger&&!sold(p)?'<label class="field">Término de la carne<select id="term" required><option value="">Elige el término</option><option>Tres cuartos</option><option>Bien cocido</option></select></label>':'')+
 (sold(p)?'<p>Agotado en este servicio.</p>'+button('Ver otras opciones','browse','lineBtn'):button('Agregar · '+money(p.price),'add','action wide'))+
 wrap(button('Enlace al platillo','link','mini')));
}
function compare(){
 const [b,a]=brand().products;const col=p=>'<div><img src="'+art(p.image)+'" alt="'+p.name+'"><h3>'+p.name+'</h3><strong>'+money(p.price)+'</strong><small>'+p.description+'</small><button class="action" data-product="'+p.id+'">'+(sold(p)?'Ver disponibilidad':'Elegir esta')+'</button></div>';
 show(heading('Entre estas dos')+'<p>La Doble Bacon cuesta Q16.00 más. Ambas incluyen papas.</p><div class="compare">'+col(a)+col(b)+'</div>');
}
function ovens(){
 show(heading('Las hornadas de hoy')+'<p>Horario de muestra del obrador.</p><div class="row"><b>Brioche de cacao</b><span>'+(sold(brand().products[0])?'Agotado':'Disponible')+'</span></div><div class="row"><b>Siguiente hornada</b><span>16:30</span></div><p>La hora indica cuándo el equipo espera sacar la siguiente tanda.</p>'+button('Ver el brioche','first'));
}
function tableLines(){
 const p=brand().products,m=groupSize/2;return [line(p[0],m),...(side?[line(side===35?p[1]:p[2],m)]:[]),...(drinks?[line(p[3],groupSize)]:[])];
}
function table(){
 const total=sum(tableLines());
 show(heading('Al centro')+'<p>Una orden de ocho alitas por cada dos personas. Tú decides qué más llega a la mesa.</p><img src="'+art('papas')+'" alt="Papas con queso y limonadas de la casa"><label class="row">Personas<select id="people"><option value="2">2 personas</option><option value="4">4 personas</option></select></label><label class="row">Acompañamiento<select id="side"><option value="35">Papas con queso</option><option value="48">Nachos supremos</option><option value="0">Solo alitas</option></select></label><label class="option"><input id="drink" type="checkbox">Una limonada por persona</label><div id="tableCost" aria-live="polite">'+tableCost(total)+'</div>'+
 (sold(brand().products[0])?'<p>Las alitas están agotadas.</p>'+button('Volver a la carta','browse','lineBtn'):button('Agregar selección','tableAdd','action wide')));
 $('people').value=groupSize;$('side').value=side;$('drink').checked=drinks;
}
function tableCost(n){return totalRow('Total de la mesa',n)+'<p>'+money(n/groupSize)+' por persona · '+tableLines().map(l=>l.qty+' × '+l.name).join(', ')+'</p>';}
function round(){
 const counts=new Map();for(const v of votes)counts.set(v.id,(counts.get(v.id)||0)+1);
 const rows=[...counts].map(([id,n])=>{const p=products().find(p=>p.id===id);return p?'<label class="row">'+p.name+' · '+n+' voto(s)<select data-round="'+id+'" aria-label="Órdenes de '+p.name+'">'+Array.from({length:n+1},(_,i)=>'<option '+(i===1?'selected':'')+'>'+i+'</option>').join('')+'</select></label>':'';}).join('');
 show(heading('Una ronda para la mesa')+'<p>Pásense el teléfono. Cada persona propone un plato y la mesa decide cuántas órdenes agregar.</p><label class="field">Quién propone<select id="guest"><option>Ana</option><option>Luis</option><option>Sol</option></select></label><label class="field">Me apetece<select id="proposal">'+brand().products.filter(p=>!sold(p)).map(p=>'<option value="'+p.id+'">'+p.name+'</option>').join('')+'</select></label>'+button('Guardar mi propuesta','vote','lineBtn')+
 (votes.length?'<p>'+votes.map(v=>v.guest+' · '+brand().products.find(p=>p.id===v.id)?.name).join('<br>')+'</p><h3>Órdenes a pedir</h3>'+rows+button('Agregar órdenes elegidas','roundAdd','action wide'):''));
}
function cartSheet(){
 if(!cart.length){if(order)return tracking();return show(heading('Mi pedido')+'<p>Tu pedido está vacío.</p>'+button('Explorar la carta','browse'));}
 show(heading('Mi pedido')+cart.map((l,i)=>'<div class="row"><span><b>'+l.name+'</b><br><small>'+escapeText(l.note)+'</small><br>'+money(l.price)+' × '+l.qty+'</span><div>'+button('−','minus-'+i,'mini')+' '+button('+','plus-'+i,'mini')+'</div></div>').join('')+totalRow('Total',sum(cart))+button('Revisar pedido','checkout','action wide')+wrap(button('Seguir explorando','browse','mini')));
}
function checkout(){
 if(cart.some(l=>sold({id:l.id}))||['failure','empty'].includes(scenario))return show(heading('Revisa tu selección')+'<p>La disponibilidad cambió. Revisa el carrito o vuelve a cargar la carta antes de confirmar.</p>'+button('Editar carrito','bag'));
 show(heading('Revisar pedido')+'<p>'+brand().name+' · '+(entry==='mesa'?'Servicio en mesa 4':'Recoger en el local')+'</p>'+cart.map(l=>'<div class="row"><span>'+l.qty+' × '+l.name+'<small> '+escapeText(l.note)+'</small></span><b>'+money(l.qty*l.price)+'</b></div>').join('')+totalRow('Total',sum(cart))+button('Confirmar pedido de prueba','confirm','action wide')+wrap(button('Editar carrito','bag','mini')));
}
function tracking(){
 const states=['Recibido','En preparación','Listo'];show(heading('Pedido de prueba')+'<p>'+brand().name+' · '+order.channel+'</p><ol class="steps">'+states.map((s,i)=>'<li>'+(i===order.step?'<strong aria-current="step">'+s+'</strong>':s)+(i<order.step?' ✓':'')+'</li>').join('')+'</ol>'+totalRow('Total confirmado',order.total)+(order.step<2?button('Simular siguiente estado','advance','action wide'):'<p>El local terminó de preparar tu pedido.</p>')+wrap(button('Volver a la carta','browse','mini')));
}
function startFeature(){if(key==='miga')detail('brioche');else if(key==='doble')compare();else table();}
function browse(){closeSheet();$('carta').focus();$('carta').scrollIntoView();}
function urlFor(productId=''){return location.href.split('#')[0]+'#'+key+(productId?'/'+productId:'');}
function openRoute(){const [k,id]=location.hash.slice(1).split('/');closeSheet();activate(Object.hasOwn(brands,k)?k:'miga');if(id&&products().some(p=>p.id===id)){entry='redes';$('entry').value=entry;detail(id);}}
$('restaurant').onchange=e=>{location.hash=e.target.value;};
$('entry').onchange=e=>{entry=e.target.value;renderList();if(entry==='redes')detail(brand().products[0].id);if(entry==='mesa')browse();};
$('scenario').onchange=e=>{scenario=e.target.value;limit=12;extras=[];if(scenario==='large'){extras=Array.from({length:1001-brand().products.length},(_,i)=>product('serie-'+i,'Especial '+(i+5),'Special '+(i+5),20+i%18,'Platillo de prueba para búsqueda y paginación.'));}$('query').value='';renderList();};
$('query').oninput=()=>{limit=12;renderList();};
$('discover').onclick=startFeature;$('bag').onclick=cartSheet;$('special').onclick=()=>key==='miga'?ovens():key==='doble'?compare():round();$('close').onclick=closeSheet;
document.addEventListener('change',e=>{if(!['people','side','drink'].includes(e.target.id))return;groupSize=Number($('people').value);side=Number($('side').value);drinks=$('drink').checked;$('tableCost').innerHTML=tableCost(sum(tableLines()));});
document.addEventListener('click',e=>{
 const target=e.target.closest('button');if(!target)return;if(target.dataset.product){cut=false;return detail(target.dataset.product);}
 const a=target.dataset.act;if(!a)return;
 if(a==='retry'){scenario='normal';$('scenario').value='normal';renderList();$('notice').textContent='Carta recuperada.';}
 if(a==='clear'){$('query').value='';renderList();$('query').focus();}
 if(a==='more'){const old=limit;limit+=12;renderList();$('list').querySelectorAll('.item')[old]?.focus();}
 if(a==='cut'){cut=!cut;detail(activeProduct.id);$('inside').querySelector('[data-act=cut]').focus();}
 if(a==='first')detail(brand().products[0].id);
 if(a==='add'){const term=$('term');if(term&&!term.reportValidity())return;if(!sold(activeProduct))add([line(activeProduct,1,term?.value||'')]);}
 if(a==='link'){const url=urlFor(activeProduct.id);show(heading('Compartir platillo')+'<p>Abre esta dirección en otra pestaña del mismo equipo para entrar directamente al platillo.</p><label class="field">Enlace de demostración<input id="shareUrl" readonly></label>'+button('Seleccionar enlace','select','lineBtn'));$('shareUrl').value=url;}
 if(a==='select'){$('shareUrl').focus();$('shareUrl').select();}
 if(a==='tableAdd'&&!sold(brand().products[0]))add(tableLines());
 if(a==='vote'){const guest=$('guest').value;votes=votes.filter(v=>v.guest!==guest);votes.push({guest,id:$('proposal').value});save();round();$('guest').value=['Ana','Luis','Sol'].find(n=>!votes.some(v=>v.guest===n))||guest;}
 if(a==='roundAdd'){const lines=[...document.querySelectorAll('[data-round]')].map(s=>line(brand().products.find(p=>p.id===s.dataset.round),Number(s.value))).filter(l=>l.qty&&!sold(l));if(lines.length){votes=[];add(lines);}else{const note=document.createElement('p');note.textContent='Elige al menos una orden disponible.';note.setAttribute('role','alert');target.after(note);}}
 if(a.startsWith('plus-')||a.startsWith('minus-')){let i=Number(a.split('-')[1]);cart[i].qty+=a.startsWith('plus')?1:-1;cart=cart.filter(l=>l.qty);save();bagLabel();cartSheet();}
 if(a==='checkout')checkout();if(a==='bag')cartSheet();if(a==='browse')browse();
 if(a==='confirm'&&cart.length){order={total:sum(cart),step:0,channel:entry==='mesa'?'Mesa 4':'Recogida'};cart=[];save();bagLabel();tracking();}
 if(a==='advance'&&order){order.step=Math.min(2,order.step+1);save();tracking();}
});
window.addEventListener('hashchange',openRoute);openRoute();
