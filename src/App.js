import { useState, useEffect } from "react";
import { database, ref, set, onValue, remove, auth, signOut, onAuthStateChanged } from "./firebase";
import { useLocation, useNavigate } from "react-router-dom";

export default function App() {
  const [imamo, setImamo] = useState({});
  const [kupiti, setKupiti] = useState({});
  const [newItem, setNewItem] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const location = useLocation();
  const navigate = useNavigate();
  const username = location.state?.username || "unknown";

  // Check authentication status
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        setLoading(false);
      } else {
        navigate("/");
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  // Listen to Firebase changes (single source of truth)
  useEffect(() => {
    if (!currentUser) return;

    const dataRef = ref(database, "shoppingList");
    const unsubscribe = onValue(dataRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setImamo(data.imamo || {});
        setKupiti(data.kupiti || {});
      } else {
        // Initialize empty structure if no data exists
        setImamo({});
        setKupiti({});
      }
    }, (error) => {
      console.error("Error reading from Firebase:", error);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // Move item from one list to another
  const moveItem = async (itemId, item, fromList, toList) => {
    try {
      const updates = {};
      
      // Remove from source list
      updates[`shoppingList/${fromList}/${itemId}`] = null;
      
      // Add to destination list with same ID
      updates[`shoppingList/${toList}/${itemId}`] = item;
      
      // Apply both updates atomically
      await set(ref(database), updates);
    } catch (error) {
      console.error("Error moving item:", error);
      alert("Failed to move item. Please try again.");
    }
  };

  // Delete item from a list
  const deleteItem = async (itemId, listName) => {
    try {
      const itemRef = ref(database, `shoppingList/${listName}/${itemId}`);
      await remove(itemRef);
    } catch (error) {
      console.error("Error deleting item:", error);
      alert("Failed to delete item. Please try again.");
    }
  };

  // Add new item to kupiti list
  const addItem = async () => {
    if (newItem.trim() === "") return;

    try {
      // Generate unique ID using timestamp + random
      const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const item = {
        name: newItem.trim(),
        addedBy: username,
        addedAt: Date.now()
      };

      const itemRef = ref(database, `shoppingList/kupiti/${uniqueId}`);
      await set(itemRef, item);
      
      setNewItem("");
    } catch (error) {
      console.error("Error adding item:", error);
      alert("Failed to add item. Please try again.");
    }
  };

  const userColors = {
    Mare: "blue",
    Caka: "deeppink",
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <p>Loading...</p>
      </div>
    );
  }

  // Convert objects to arrays for rendering
  const imamoArray = Object.entries(imamo).map(([id, item]) => ({ id, ...item }));
  const kupitiArray = Object.entries(kupiti).map(([id, item]) => ({ id, ...item }));

  return (
    <div style={styles.page}>
      <div style={styles.logoutContainer}>
        <span style={styles.welcomeText}>
          Welcome, <span style={{ color: userColors[username] || "#6b7280" }}>{username}</span>
        </span>
        <button style={styles.logoutButton} onClick={handleLogout}>
          Logout
        </button>
      </div>

      <div style={styles.container}>
        {/* Left Table - Imamo */}
        <div>
          <h2 style={styles.header}>Imamo ({imamoArray.length})</h2>
          <ul style={styles.table}>
            {imamoArray.length === 0 ? (
              <li style={styles.emptyState}>No items yet</li>
            ) : (
              imamoArray.map((item) => (
                <li
                  key={item.id}
                  style={styles.item}
                  onClick={() => moveItem(item.id, { name: item.name, addedBy: item.addedBy, addedAt: item.addedAt }, "imamo", "kupiti")}
                >
                  <div style={styles.itemText}>
                    <strong>{item.name}</strong>
                    <br />
                    <small>
                      added by{" "}
                      <span style={{ color: userColors[item.addedBy] || "#6b7280" }}>
                        {item.addedBy}
                      </span>
                    </small>
                  </div>
                  <button
                    style={styles.deleteButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete "${item.name}"?`)) {
                        deleteItem(item.id, "imamo");
                      }
                    }}
                  >
                    ✖
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* Right Table - Kupiti */}
        <div>
          <h2 style={styles.header}>Kupiti ({kupitiArray.length})</h2>
          <ul style={styles.table}>
            {kupitiArray.length === 0 ? (
              <li style={styles.emptyState}>No items to buy</li>
            ) : (
              kupitiArray.map((item) => (
                <li
                  key={item.id}
                  style={styles.item}
                  onClick={() => moveItem(item.id, { name: item.name, addedBy: item.addedBy, addedAt: item.addedAt }, "kupiti", "imamo")}
                >
                  <div style={styles.itemText}>
                    <strong>{item.name}</strong>
                    <br />
                    <small>
                      added by{" "}
                      <span style={{ color: userColors[item.addedBy] || "#6b7280" }}>
                        {item.addedBy}
                      </span>
                    </small>
                  </div>
                  <button
                    style={styles.deleteButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete "${item.name}"?`)) {
                        deleteItem(item.id, "kupiti");
                      }
                    }}
                  >
                    ✖
                  </button>
                </li>
              ))
            )}
          </ul>

          {/* Input Field and Button */}
          <div style={styles.inputArea}>
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addItem()}
              placeholder="Enter item name!"
              style={styles.input}
            />
            <button 
              style={styles.addButton} 
              onClick={addItem}
              disabled={!newItem.trim()}
            >
              Add to Kupiti
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    background: "linear-gradient(to bottom right, #e5e7eb, #f9fafb)",
    padding: "2rem",
  },
  loadingContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    fontSize: "1.2rem",
    color: "#6b7280",
  },
  logoutContainer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    maxWidth: "600px",
    marginBottom: "1rem",
    padding: "0.5rem",
  },
  welcomeText: {
    fontSize: "1rem",
    fontWeight: "500",
    color: "#374151",
  },
  logoutButton: {
    padding: "0.5rem 1rem",
    backgroundColor: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: "0.5rem",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: "500",
    transition: "background-color 0.2s",
  },
  container: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "2rem",
    padding: "2rem",
    backgroundColor: "#fff",
    borderRadius: "1rem",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
    border: "1px solid #d1d5db",
    width: "100%",
    maxWidth: "600px",
  },
  header: {
    fontSize: "1.5rem",
    fontWeight: "bold",
    marginBottom: "1rem",
    color: "#374151",
    textAlign: "center",
  },
  table: {
    border: "1px solid #e5e7eb",
    borderRadius: "0.5rem",
    padding: "1rem",
    backgroundColor: "#fff",
    minWidth: "200px",
    listStyle: "none",
    maxWidth: "100%",
    minHeight: "100px",
  },
  emptyState: {
    padding: "1rem",
    textAlign: "center",
    color: "#9ca3af",
    fontStyle: "italic",
  },
  item: {
    padding: "0.75rem",
    borderBottom: "1px solid #e5e7eb",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: "0.5rem",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  itemText: {
    color: "#374151",
    fontWeight: "500",
    flexGrow: 1,
  },
  deleteButton: {
    color: "#ef4444",
    background: "none",
    border: "none",
    fontSize: "1.2rem",
    cursor: "pointer",
    padding: "0.25rem 0.5rem",
  },
  inputArea: {
    marginTop: "1rem",
    width: "100%",
  },
  input: {
    padding: "0.75rem",
    border: "1px solid #d1d5db",
    borderRadius: "0.5rem",
    width: "92%",
    marginBottom: "0.5rem",
    fontSize: "1rem",
  },
  addButton: {
    padding: "0.75rem",
    backgroundColor: "#3b82f6",
    color: "white",
    borderRadius: "0.5rem",
    width: "100%",
    fontWeight: "500",
    border: "none",
    cursor: "pointer",
    transition: "opacity 0.2s",
  },
};