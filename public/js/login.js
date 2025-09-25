import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  GoogleAuthProvider, 
  signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// 🔑 Replace with your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCPCRnEl01GaxbfC5EwWhen_DUOLE2-wZA",
    authDomain: "mytvam-app.firebaseapp.com",
    projectId: "mytvam-app",
    storageBucket: "mytvam-app.firebasestorage.app",
    messagingSenderId: "336382893777",
    appId: "1:336382893777:web:6684804f2c94c101636ff0",
    measurementId: "G-EETD3SZX43"

};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Sign Up
document.getElementById("signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("name").value;
  const age = document.getElementById("age").value;
  const gender = document.getElementById("gender").value;
  const location = document.getElementById("location").value;
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", userCredential.user.uid), {
      name, age, gender, location, email
    });
    window.location.href = "index.html";
  } catch (err) {
    alert(err.message);
  }
});

// Log In
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "index.html";
  } catch (err) {
    alert(err.message);
  }
});

// Google Login
document.getElementById("google-login").addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
    window.location.href = "index.html";
  } catch (err) {
    alert(err.message);
  }
});
