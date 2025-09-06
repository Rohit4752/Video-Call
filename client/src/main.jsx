import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import process from "process";
import { UserProvider } from './context/UserContextApi.jsx';

if (typeof window !== "undefined") {
  window.process = window.process || process;
  window.global = window.global || window;
}



createRoot(document.getElementById('root')).render(
  <UserProvider>
    <App />
  </UserProvider>
)
