import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, signInWithEmailAndPassword } from "./firebase";

// Map display names to email addresses
const USER_EMAILS = {
  Caka: "caka@kupovinaapp.com",
  Mare: "mare@kupovinaapp.com",
};

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Get email for the username
    const email = USER_EMAILS[username];
    
    if (!email) {
      setError("Invalid username");
      setLoading(false);
      return;
    }

    try {
      // Sign in with Firebase Auth
      await signInWithEmailAndPassword(auth, email, password);
      
      // Navigate to app on success
      navigate("/app", { state: { username } });
    } catch (err) {
      // Handle different error types
      let errorMessage = "Login failed. Please try again.";
      
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
        errorMessage = "Invalid username or password";
      } else if (err.code === "auth/user-not-found") {
        errorMessage = "User not found";
      } else if (err.code === "auth/too-many-requests") {
        errorMessage = "Too many failed attempts. Please try again later.";
      } else if (err.code === "auth/network-request-failed") {
        errorMessage = "Network error. Please check your connection.";
      }
      
      setError(errorMessage);
      console.error("Login error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.header}>Login</h2>
      <form onSubmit={handleLogin} style={styles.form}>
        <input
          type="text"
          placeholder="Username (Caka or Mare)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={styles.input}
          disabled={loading}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
          disabled={loading}
        />
        <button 
          type="submit" 
          style={{
            ...styles.button,
            opacity: loading ? 0.6 : 1,
            cursor: loading ? "not-allowed" : "pointer"
          }}
          disabled={loading}
        >
          {loading ? "Logging in..." : "Login"}
        </button>
        {error && <p style={styles.error}>{error}</p>}
      </form>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    background: "#f3f4f6",
    padding: "1rem",
  },
  header: {
    fontSize: "2rem",
    marginBottom: "1rem",
    color: "#111827",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    maxWidth: "300px",
  },
  input: {
    padding: "0.75rem",
    marginBottom: "0.75rem",
    borderRadius: "0.5rem",
    border: "1px solid #d1d5db",
    fontSize: "1rem",
  },
  button: {
    padding: "0.75rem",
    backgroundColor: "#3b82f6",
    color: "white",
    border: "none",
    borderRadius: "0.5rem",
    cursor: "pointer",
    fontSize: "1rem",
    fontWeight: "500",
    transition: "background-color 0.2s",
  },
  error: {
    color: "#ef4444",
    marginTop: "0.5rem",
    fontSize: "0.9rem",
    textAlign: "center",
  },
};