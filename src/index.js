import React from "react";
import ReactDOM from "react-dom/client";  // Updated import for React 18
import Main from "./Main";  // Import your Main component
import "./index.css";  // Optional CSS file

// Use the createRoot API instead of ReactDOM.render
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<Main />);  // Render the Main component