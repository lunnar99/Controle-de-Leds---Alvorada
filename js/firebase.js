import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBLiKdwjB77BR3XByLpbnpOkYM6L0wHr1Y",
  authDomain: "alvoleds-aab35.firebaseapp.com",
  projectId: "alvoleds-aab35",
  storageBucket: "alvoleds-aab35.firebasestorage.app",
  messagingSenderId: "397291431762",
  appId: "1:397291431762:web:2ff438e326bb5ae2f3fc8b"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
