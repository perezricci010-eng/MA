// ============================================================
// LÓGICA DE LA INTERFAZ: pantallas, formularios y mensajes.
// Secciones: 1) Estado  2) Utilidades  3) Catálogo  4) Admin
//            5) Sesión  6) Publicar/editar  7) Arranque
// ============================================================
import * as D from "./data.js";

// ---------- 1) ESTADO ----------
const CATS = ["Comida","Ropa y accesorios","Manualidades","Tecnología","Útiles escolares","Otros"];
const ICON = {"Comida":"🍪","Ropa y accesorios":"👕","Manualidades":"🎨","Tecnología":"💻","Útiles escolares":"✏️","Otros":"🛍️"};
let user = null, products = [], cat = "Todas", query = "", mine = false, editingId = null, photo = "";

// ---------- 2) UTILIDADES ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
function toast(msg, type = "") {
  const t = document.createElement("div"); t.className = "toast " + type; t.textContent = msg;
  $("#toasts").append(t); setTimeout(() => t.remove(), 3500);
}
function showErrors(form, errs) {   // escribe cada error debajo de su campo
  [...form.elements].forEach(el => { const s = el.name && el.closest("label")?.querySelector(".err"); if (s) s.textContent = errs[el.name] || ""; });
  return Object.keys(errs).length === 0;
}
const canEdit = p => user && !p.sample && (user.role === "admin" || p.ownerId === user.uid);

// ---------- 3) CATÁLOGO: buscar, filtrar y dibujar ----------
function render() {
  $("#chips").innerHTML = ["Todas", ...CATS].map(c => `<button data-cat="${c}" class="${c === cat ? "on" : ""}">${c}</button>`).join("");
  const q = query.toLowerCase();
  const list = products.filter(p =>
    (cat === "Todas" || p.category === cat) && (!mine || p.ownerId === user?.uid) &&
    (p.name + " " + p.desc).toLowerCase().includes(q));
  $("#listTitle").textContent = mine ? "Mis productos" : "Productos";
  $("#empty").hidden = list.length > 0;
  $("#grid").innerHTML = list.map(p => `
    <article class="card">
      <div class="ph">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">` : `<span>${p.emoji || ICON[p.category] || "🛍️"}</span>`}<em>${esc(p.category)}</em></div>
      <div class="bd"><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p>
        <div class="row"><b>L ${Number(p.price).toFixed(2)}</b><small>por ${esc(p.ownerName)}</small></div>
        ${canEdit(p) ? `<div class="act"><button data-edit="${p.id}">Editar</button><button data-del="${p.id}" class="danger">Eliminar</button></div>` : ""}
      </div></article>`).join("");
  // barra superior según la sesión
  $("#userBox").innerHTML = user
    ? `<span>Hola, ${esc(user.name.split(" ")[0])}${user.role === "admin" ? " (admin)" : ""}</span><button id="btnOut">Salir</button>`
    : `<button id="btnIn" class="primary">Entrar</button>`;
  $("#btnAdmin").hidden = user?.role !== "admin";
  if (!$("#viewAdmin").hidden) renderAdmin();
}
async function refresh() { try { products = await D.listProducts(); } catch (e) { toast(D.errorMsg(e), "err"); } render(); }

// ---------- 4) PANEL DE ADMINISTRADOR ----------
function renderAdmin() {
  const real = products.filter(p => !p.sample);
  $("#stats").textContent = `${real.length} publicaciones de ${new Set(real.map(p => p.ownerId)).size} vendedores.`;
  $("#btnSeed").hidden = D.isFirebase === false || real.length > 0;
  $("#adminRows").innerHTML = products.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td>${esc(p.ownerName)}</td><td>L ${Number(p.price).toFixed(2)}</td>
    <td>${p.sample ? "<small>ejemplo</small>" : `<button data-edit="${p.id}">Editar</button> <button data-del="${p.id}" class="danger">Eliminar</button>`}</td></tr>`).join("");
}
function show(view) {
  $("#viewHome").hidden = view !== "home"; $("#viewAdmin").hidden = view !== "admin";
  if (view === "admin") renderAdmin();
  window.scrollTo(0, 0);
}

// ---------- 5) SESIÓN: registro e inicio ----------
function openAuth(tab = "login") {
  $("#loginForm").hidden = tab !== "login"; $("#regForm").hidden = tab !== "register";
  document.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  $("#authDlg").showModal();
}
$("#loginForm").onsubmit = async ev => {
  ev.preventDefault(); const f = ev.target, v = Object.fromEntries(new FormData(f)), er = {};
  if (!emailOk(v.email)) er.email = "Escribe un correo válido.";
  if (!v.password) er.password = "Escribe tu contraseña.";
  if (!showErrors(f, er)) return;
  try { await D.login(v.email.trim(), v.password); $("#authDlg").close(); f.reset(); toast("Sesión iniciada. ¡Bienvenido!"); }
  catch (e) { toast(D.errorMsg(e), "err"); }
};
$("#regForm").onsubmit = async ev => {
  ev.preventDefault(); const f = ev.target, v = Object.fromEntries(new FormData(f)), er = {};
  if (v.name.trim().length < 3) er.name = "Escribe tu nombre completo.";
  if (!emailOk(v.email)) er.email = "Escribe un correo válido.";
  if (v.password.length < 6) er.password = "Mínimo 6 caracteres.";
  if (v.password2 !== v.password) er.password2 = "Las contraseñas no coinciden.";
  if (!showErrors(f, er)) return;
  try { await D.register(v.name.trim(), v.email.trim(), v.password); $("#authDlg").close(); f.reset(); toast("Cuenta creada. ¡Ya puedes publicar!"); }
  catch (e) { toast(D.errorMsg(e), "err"); }
};

// ---------- 6) PUBLICAR, EDITAR Y ELIMINAR ----------
function openProduct(p) {
  if (!user) { toast("Inicia sesión para publicar productos.", "err"); return openAuth(); }
  const f = $("#prodForm"); f.reset(); showErrors(f, {});
  editingId = p?.id || null; photo = p?.image || "";
  $("#prodTitle").textContent = p ? "Editar producto" : "Publicar producto";
  f.category.innerHTML = `<option value="">Elige una categoría</option>` + CATS.map(c => `<option>${c}</option>`).join("");
  if (p) { f.name.value = p.name; f.price.value = p.price; f.category.value = p.category; f.desc.value = p.desc; }
  $("#preview").src = photo; $("#preview").hidden = !photo;
  $("#prodDlg").showModal();
}
// La foto se reduce a 600 px y se guarda dentro del documento (no necesita Firebase Storage)
$("#photo").onchange = ev => {
  const file = ev.target.files[0]; if (!file) return;
  if (!file.type.startsWith("image/")) { ev.target.value = ""; return toast("El archivo debe ser una imagen.", "err"); }
  const r = new FileReader();
  r.onload = () => { const i = new Image(); i.onload = () => {
    const s = Math.min(1, 600 / Math.max(i.width, i.height)), c = document.createElement("canvas");
    c.width = i.width * s; c.height = i.height * s; c.getContext("2d").drawImage(i, 0, 0, c.width, c.height);
    photo = c.toDataURL("image/jpeg", .7); $("#preview").src = photo; $("#preview").hidden = false;
  }; i.src = r.result; };
  r.readAsDataURL(file);
};
$("#prodForm").onsubmit = async ev => {
  ev.preventDefault(); const f = ev.target, v = Object.fromEntries(new FormData(f)), er = {};
  if (v.name.trim().length < 3) er.name = "Mínimo 3 caracteres.";
  if (!(parseFloat(v.price) > 0)) er.price = "Escribe un precio mayor que 0.";
  if (!v.category) er.category = "Elige una categoría.";
  if (v.desc.trim().length < 10) er.desc = "Describe el producto (mínimo 10 caracteres).";
  if (!showErrors(f, er)) return toast("Revisa los campos marcados en rojo.", "err");
  const data = {name:v.name.trim(), price:+(+v.price).toFixed(2), category:v.category, desc:v.desc.trim(), image:photo};
  if (!editingId) { data.ownerId = user.uid; data.ownerName = user.name; }
  try {
    await D.saveProduct(data, editingId); $("#prodDlg").close();
    toast(editingId ? "Publicación actualizada." : "Producto publicado."); await refresh();
  } catch (e) { toast(D.errorMsg(e), "err"); }
};
async function removeProduct(id) {
  if (!confirm("¿Seguro que quieres eliminar esta publicación?")) return;
  try { await D.removeProduct(id); toast("Publicación eliminada."); await refresh(); }
  catch (e) { toast(D.errorMsg(e), "err"); }
}

// ---------- 7) EVENTOS Y ARRANQUE ----------
document.addEventListener("click", ev => {
  const t = ev.target.closest("button, a"); if (!t) return;
  if (t.dataset.cat) { cat = t.dataset.cat; render(); }
  else if (t.dataset.edit) openProduct(products.find(p => p.id === t.dataset.edit));
  else if (t.dataset.del) removeProduct(t.dataset.del);
  else if (t.dataset.tab) openAuth(t.dataset.tab);
  else if (t.dataset.close !== undefined) t.closest("dialog").close();
  else if (t.id === "btnIn") openAuth();
  else if (t.id === "btnOut") { D.logout(); toast("Sesión cerrada."); }
  else if (t.id === "btnNew") openProduct();
  else if (t.id === "btnMine") { if (!user) { toast("Inicia sesión para ver tus productos.", "err"); return openAuth(); } mine = true; show("home"); render(); }
  else if (t.id === "btnSeed") D.seedSamples().then(() => { toast("Productos de ejemplo cargados."); refresh(); }).catch(e => toast(D.errorMsg(e), "err"));
  if (t.dataset.view) { mine = t.dataset.view === "home" ? false : mine; show(t.dataset.view); render(); if (t.tagName === "A") ev.preventDefault(); }
});
$("#q").oninput = e => { query = e.target.value; render(); };

if (!D.isFirebase) {
  $("#modeBanner").hidden = false;
  $("#modeBanner").textContent = "Modo demostración: los datos solo se guardan en este navegador. Para guardarlos de verdad, configura Firebase en js/config.js. Admin de prueba: admin@mitamarket.test / admin123";
}
try {
  await D.init(u => { user = u; if (user?.role !== "admin") show("home"); render(); });
} catch (e) { toast("No se pudo conectar con Firebase: " + D.errorMsg(e), "err"); }
await refresh();
