import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCgsBIE-qFuL_M9V5fiJEUDzT5dYULLcU",
  authDomain: "trelastordre.firebaseapp.com",
  projectId: "trelastordre",
  storageBucket: "trelastordre.firebasestorage.app",
  messagingSenderId: "842355228879",
  appId: "1:842355228879:web:20f35479f8bc76207ab7ba",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const db = getFirestore(app);
