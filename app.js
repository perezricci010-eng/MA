// ============================================================
// CAPA DE DATOS: aquí está TODO lo que habla con Firebase.
// Si Firebase no está configurado, usa localStorage (modo demo).
// app.js solo llama a estas funciones y no sabe cuál modo se usa.
// ============================================================
import { firebaseConfig } from "./config.js";
export const isFirebase = !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("PEGA");
const V = "https://www.gstatic.com/firebasejs/10.12.2/";

export const SAMPLES = [
  {id:"s1",name:"Pastelitos de piña",price:25,category:"Comida",emoji:"🥧",desc:"Pastelitos caseros rellenos de piña, hechos cada mañana. Paquete de 4."},
  {id:"s2",name:"Pulseras artesanales",price:40,category:"Manualidades",emoji:"📿",desc:"Pulseras tejidas a mano con hilo y cuentas de colores. Varios diseños."},
  {id:"s3",name:"Llaveros de fieltro",price:30,category:"Manualidades",emoji:"🔑",desc:"Llaveros con forma de animalitos, cosidos a mano. Ideales para regalo."},
  {id:"s4",name:"Cuaderno decorado",price:55,category:"Útiles escolares",emoji:"📓",desc:"Cuaderno de 100 hojas con portada personalizada con el diseño que elijas."},
  {id:"s5",name:"Jugo natural de maracuyá",price:15,category:"Comida",emoji:"🥤",desc:"Jugo fresco sin conservantes, botella de 16 onzas. Se entrega frío."},
  {id:"s6",name:"Gorra bordada",price:150,category:"Ropa y accesorios",emoji:"🧢",desc:"Gorra con bordado de tu nombre o iniciales. Entrega en una semana."},
  {id:"s7",name:"Funda para celular",price:90,category:"Tecnología",emoji:"📱",desc:"Fundas transparentes con diseños pintados a mano. Consulta tu modelo."},
  {id:"s8",name:"Servicio de impresiones",price:3,category:"Otros",emoji:"🖨️",desc:"Impresión de tareas y trabajos a color o blanco y negro. Precio por página."}
].map(p => ({...p, ownerId:"demo", ownerName:"Estudiantes Mita", sample:true}));

let fb = {}, listener = () => {};
const ls = (k, d) => JSON.parse(localStorage.getItem(k) || "null") ?? d;
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const clean = ({sample, ...p}) => p;

// Traduce errores de Firebase a mensajes claros
const ERR = {"auth/email-already-in-use":"Ese correo ya está registrado.","auth/invalid-credential":"Correo o contraseña incorrectos.",
  "auth/invalid-email":"El correo no es válido.","auth/weak-password":"La contraseña es muy débil.","auth/too-many-requests":"Demasiados intentos. Espera un momento.",
  "permission-denied":"No tienes permiso para hacer esto (revisa las reglas de Firestore)."};
export const errorMsg = e => ERR[e.code] || e.message || "Ocurrió un error inesperado.";

// ---------- Inicio ----------
export async function init(onUser) {
  listener = onUser;
  if (!isFirebase) {
    if (!ls("mm_products")) save("mm_products", SAMPLES.map(clean));
    // Administrador SOLO de prueba para el modo demostración (no es de Firebase)
    if (!ls("mm_users")) save("mm_users", [{uid:"admin",name:"Administrador",email:"admin@mitamarket.test",pass:"admin123",role:"admin"}]);
    const u = ls("mm_users", []).find(x => x.uid === localStorage.getItem("mm_session"));
    return onUser(u ? {uid:u.uid,name:u.name,email:u.email,role:u.role} : null);
  }
  const [A, Au, F] = await Promise.all(["firebase-app","firebase-auth","firebase-firestore"].map(m => import(`${V}${m}.js`)));
  const app = A.initializeApp(firebaseConfig);
  fb = {Au, F, auth: Au.getAuth(app), db: F.getFirestore(app)};
  // Firebase avisa cada vez que alguien entra o sale
  Au.onAuthStateChanged(fb.auth, async u => {
    if (!u) return onUser(null);
    let role = "user";
    try { const s = await F.getDoc(F.doc(fb.db, "users", u.uid)); if (s.exists()) role = s.data().role || "user"; } catch {}
    onUser({uid:u.uid, name:u.displayName || u.email, email:u.email, role});
  });
}

// ---------- Usuarios ----------
export async function register(name, email, pass) {
  if (!isFirebase) {
    const us = ls("mm_users", []);
    if (us.some(u => u.email === email.toLowerCase())) throw new Error("Ese correo ya está registrado.");
    const u = {uid:"u" + Date.now(), name, email:email.toLowerCase(), pass, role:"user"};
    save("mm_users", [...us, u]); localStorage.setItem("mm_session", u.uid);
    return listener({uid:u.uid,name,email:u.email,role:"user"});
  }
  const {Au, F, auth, db} = fb;
  const cred = await Au.createUserWithEmailAndPassword(auth, email, pass);
  await Au.updateProfile(cred.user, {displayName: name});
  await F.setDoc(F.doc(db, "users", cred.user.uid), {name, email, role:"user"});  // rol normal; el admin se asigna a mano en Firestore
  listener({uid:cred.user.uid, name, email, role:"user"});
}
export async function login(email, pass) {
  if (!isFirebase) {
    const u = ls("mm_users", []).find(x => x.email === email.toLowerCase() && x.pass === pass);
    if (!u) throw new Error("Correo o contraseña incorrectos.");
    localStorage.setItem("mm_session", u.uid);
    return listener({uid:u.uid,name:u.name,email:u.email,role:u.role});
  }
  await fb.Au.signInWithEmailAndPassword(fb.auth, email, pass);
}
export async function logout() {
  if (!isFirebase) { localStorage.removeItem("mm_session"); return listener(null); }
  await fb.Au.signOut(fb.auth);
}

// ---------- Productos ----------
export async function listProducts() {
  if (!isFirebase) return ls("mm_products", []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const {F, db} = fb;
  const snap = await F.getDocs(F.query(F.collection(db, "products"), F.orderBy("createdAt", "desc")));
  const list = snap.docs.map(d => ({id:d.id, ...d.data()}));
  return list.length ? list : SAMPLES;   // si aún no hay datos, se muestran los de ejemplo
}
export async function saveProduct(data, id) {
  if (!isFirebase) {
    const ps = ls("mm_products", []);
    if (id) save("mm_products", ps.map(p => p.id === id ? {...p, ...data} : p));
    else save("mm_products", [{...data, id:"p" + Date.now(), createdAt:Date.now()}, ...ps]);
    return;
  }
  const {F, db} = fb;
  if (id) await F.updateDoc(F.doc(db, "products", id), data);
  else await F.addDoc(F.collection(db, "products"), {...data, createdAt:F.serverTimestamp()});
}
export async function removeProduct(id) {
  if (!isFirebase) return save("mm_products", ls("mm_products", []).filter(p => p.id !== id));
  await fb.F.deleteDoc(fb.F.doc(fb.db, "products", id));
}
export async function seedSamples() {   // solo para administrador, modo Firebase
  for (const p of SAMPLES) { const {id, sample, ...d} = p; await saveProduct(d); }
}
