// src/firebase.js
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCZCwSQo62zd_gmoUUKGQ90kQnIKkJbzDs",
  authDomain: "kupovinaapp-53642.firebaseapp.com",
  //databaseURL: "https://YOUR_APP.firebaseio.com",
  projectId: "kupovinaapp-53642",
  storageBucket: "kupovinaapp-53642.firebasestorage.app",
  messagingSenderId: "835733140276",
  appId: "1:835733140276:web:385133de2736f5194e2b61",
  measurementId: "G-VH7Z6TSRZZ"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const database = getDatabase(app);

export { database, ref, set, onValue };