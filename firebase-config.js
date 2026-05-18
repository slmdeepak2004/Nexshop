// firebase-config.js — shared Firebase initializer
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCbxXh6JT--QupqjomhP3oxtfap_S5EfBE",
    authDomain: "my-ecommerce-8fa9b.firebaseapp.com",
    projectId: "my-ecommerce-8fa9b",
    storageBucket: "my-ecommerce-8fa9b.firebasestorage.app",
    messagingSenderId: "674588239598",
    appId: "1:674588239598:web:7f112531e664ad6e8f35ff"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
