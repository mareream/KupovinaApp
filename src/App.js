import { useState, useEffect, useRef } from "react";
import { database, ref, set, onValue, remove, auth, signOut, onAuthStateChanged } from "./firebase";
import { useLocation, useNavigate } from "react-router-dom";

export default function App() {
  const [imamo, setImamo] = useState({});
  const [kupiti, setKupiti] = useState({});
  const [newItem, setNewItem] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [error, setError] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [showUndo, setShowUndo] = useState(false);
  const [animatingItems, setAnimatingItems] = useState(new Set());
  
  const location = useLocation();
  const navigate = useNavigate();
  const username = location.state?.username || "unknown";
  const undoTimeoutRef = useRef(null);

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
        setImamo({});
        setKupiti({});
      }
      setError(null);
    }, (error) => {
      console.error("Error reading from Firebase:", error);
      setError("Failed to load data. Please refresh the page.");
    });

    return () => unsubscribe();
  }, [currentUser]);

  // User presence tracking
  useEffect(() => {
    if (!currentUser || !username) return;

    const presenceRef = ref(database, `presence/${username}`);

    const setOnline = async () => {
      try {
        await set(presenceRef, {
          username: username,
          online: true,
          lastSeen: Date.now()
        });
      } catch (err) {
        console.error("Error setting presence:", err);
      }
    };

    const setOffline = async () => {
      try {
        await set(presenceRef, {
          username: username,
          online: false,
          lastSeen: Date.now()
        });
      } catch (err) {
        console.error("Error setting offline:", err);
      }
    };

    setOnline();

    const presenceListener = onValue(ref(database, "presence"), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setOnlineUsers(data);
      }
    });

    window.addEventListener("beforeunload", setOffline);
    const intervalId = setInterval(setOnline, 30000);

    return () => {
      setOffline();
      window.removeEventListener("beforeunload", setOffline);
      clearInterval(intervalId);
      presenceListener();
    };
  }, [currentUser, username]);

  const handleLogout = async () => {
    if (!window.confirm("Are you sure you want to logout?")) return;

    try {
      const presenceRef = ref(database, `presence/${username}`);
      await set(presenceRef, {
        username: username,
        online: false,
        lastSeen: Date.now()
      });
      
      await signOut(auth);
      navigate("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const itemExists = (itemName) => {
    const normalizedName = itemName.trim().toLowerCase();
    
    const existsInImamo = Object.values(imamo).some(
      item => item.name.toLowerCase() === normalizedName
    );
    const existsInKupiti = Object.values(kupiti).some(
      item => item.name.toLowerCase() === normalizedName
    );
    
    return existsInImamo || existsInKupiti;
  };

  // Show undo notification
  const showUndoNotification = (undoAction) => {
    setUndoStack([undoAction]);
    setShowUndo(true);

    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
    }

    undoTimeoutRef.current = setTimeout(() => {
      setShowUndo(false);
      setUndoStack([]);
    }, 5000);
  };

  // Undo last action
  const performUndo = async () => {
    if (undoStack.length === 0) return;

    const action = undoStack[0];
    
    try {
      if (action.type === "move") {
        // Move item back
        const toRef = ref(database, `shoppingList/${action.fromList}/${action.itemId}`);
        await set(toRef, action.item);
        
        const fromRef = ref(database, `shoppingList/${action.toList}/${action.itemId}`);
        await remove(fromRef);
      } else if (action.type === "delete") {
        // Restore deleted item
        const itemRef = ref(database, `shoppingList/${action.listName}/${action.itemId}`);
        await set(itemRef, action.item);
      }

      setShowUndo(false);
      setUndoStack([]);
      
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }
    } catch (error) {
      console.error("Error undoing action:", error);
      setError("Failed to undo action.");
    }
  };

  // Move item from one list to another (with animation)
  const moveItem = async (itemId, item, fromList, toList) => {
    // Add animation
    setAnimatingItems(prev => new Set(prev).add(itemId));
    
    setTimeout(() => {
      setAnimatingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }, 300);

    // Optimistic update
    const updatedFrom = { ...eval(fromList) };
    const updatedTo = { ...eval(toList) };
    
    delete updatedFrom[itemId];
    updatedTo[itemId] = item;
    
    if (fromList === "imamo") {
      setImamo(updatedFrom);
      setKupiti(updatedTo);
    } else {
      setKupiti(updatedFrom);
      setImamo(updatedTo);
    }

    try {
      const toRef = ref(database, `shoppingList/${toList}/${itemId}`);
      await set(toRef, item);
      
      const fromRef = ref(database, `shoppingList/${fromList}/${itemId}`);
      await remove(fromRef);

      // Add to undo stack
      showUndoNotification({
        type: "move",
        itemId,
        item,
        fromList,
        toList,
        itemName: item.name
      });
    } catch (error) {
      console.error("Error moving item:", error);
      setError("Failed to move item. Changes reverted.");
      
      if (fromList === "imamo") {
        setImamo(prev => ({ ...prev, [itemId]: item }));
        setKupiti(prev => {
          const reverted = { ...prev };
          delete reverted[itemId];
          return reverted;
        });
      } else {
        setKupiti(prev => ({ ...prev, [itemId]: item }));
        setImamo(prev => {
          const reverted = { ...prev };
          delete reverted[itemId];
          return reverted;
        });
      }
    }
  };

  // Delete item from a list
  const deleteItem = async (itemId, listName, itemName) => {
    if (!window.confirm(`Delete "${itemName}"?`)) return;

    const itemToDelete = listName === "imamo" ? imamo[itemId] : kupiti[itemId];

    // Add animation
    setAnimatingItems(prev => new Set(prev).add(itemId));
    
    setTimeout(() => {
      setAnimatingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }, 300);

    // Optimistic update
    if (listName === "imamo") {
      setImamo(prev => {
        const updated = { ...prev };
        delete updated[itemId];
        return updated;
      });
    } else {
      setKupiti(prev => {
        const updated = { ...prev };
        delete updated[itemId];
        return updated;
      });
    }

    try {
      const itemRef = ref(database, `shoppingList/${listName}/${itemId}`);
      await remove(itemRef);

      // Add to undo stack
      showUndoNotification({
        type: "delete",
        itemId,
        item: itemToDelete,
        listName,
        itemName
      });
    } catch (error) {
      console.error("Error deleting item:", error);
      setError("Failed to delete item. Please try again.");
    }
  };

  // Add new item to kupiti list
  const addItem = async () => {
    const trimmedItem = newItem.trim();
    
    if (trimmedItem === "") return;

    if (itemExists(trimmedItem)) {
      setError(`"${trimmedItem}" already exists in your lists!`);
      setTimeout(() => setError(null), 3000);
      return;
    }

    const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const item = {
        name: trimmedItem,
        addedBy: username,
        addedAt: Date.now()
      };

      // Optimistic update
      setKupiti(prev => ({
        ...prev,
        [uniqueId]: item
      }));

      const itemRef = ref(database, `shoppingList/kupiti/${uniqueId}`);
      await set(itemRef, item);
      
      setNewItem("");
      setError(null);

      // Add animation for new item
      setAnimatingItems(prev => new Set(prev).add(uniqueId));
      setTimeout(() => {
        setAnimatingItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(uniqueId);
          return newSet;
        });
      }, 300);
    } catch (error) {
      console.error("Error adding item:", error);
      setError("Failed to add item. Please try again.");
      
      setKupiti(prev => {
        const reverted = { ...prev };
        delete reverted[uniqueId];
        return reverted;
      });
    }
  };

  const userColors = {
    Mare: "blue",
    Caka: "deeppink",
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading...</p>
      </div>
    );
  }

  const imamoArray = Object.entries(imamo).map(([id, item]) => ({ id, ...item }));
  const kupitiArray = Object.entries(kupiti).map(([id, item]) => ({ id, ...item }));

  const otherOnlineUsers = Object.entries(onlineUsers)
    .filter(([name, data]) => name !== username && data.online)
    .map(([name]) => name);

  return (
    <div style={styles.page}>
      <div style={styles.topBar}>
        <div style={styles.logoutContainer}>
          <span style={styles.welcomeText}>
            Welcome, <span style={{ color: userColors[username] || "#6b7280" }}>{username}</span>
          </span>
          <button 
            style={styles.logoutButton} 
            onClick={handleLogout}
            onMouseEnter={(e) => e.target.style.backgroundColor = "#dc2626"}
            onMouseLeave={(e) => e.target.style.backgroundColor = "#ef4444"}
          >
            Logout
          </button>
        </div>
        
        {otherOnlineUsers.length > 0 && (
          <div style={styles.onlineIndicator}>
            <span style={styles.onlineDot}>●</span>
            <span style={styles.onlineText}>
              {otherOnlineUsers.map(name => (
                <span key={name} style={{ color: userColors[name] || "#6b7280" }}>
                  {name}
                </span>
              ))} online
            </span>
          </div>
        )}
      </div>

      {error && (
        <div style={styles.errorBanner}>
          <span>⚠️ {error}</span>
          <button style={styles.closeError} onClick={() => setError(null)}>✖</button>
        </div>
      )}

      {showUndo && undoStack.length > 0 && (
        <div style={styles.undoBanner}>
          <span>
            {undoStack[0].type === "move" 
              ? `Moved "${undoStack[0].itemName}"` 
              : `Deleted "${undoStack[0].itemName}"`}
          </span>
          <button style={styles.undoButton} onClick={performUndo}>
            ↶ Undo
          </button>
        </div>
      )}

      <div style={styles.container}>
        <div>
          <h2 style={styles.header}>Imamo ({imamoArray.length})</h2>
          <ul style={styles.table}>
            {imamoArray.length === 0 ? (
              <li style={styles.emptyState}>No items yet</li>
            ) : (
              imamoArray.map((item) => (
                <li
                  key={item.id}
                  style={{
                    ...styles.item,
                    ...(animatingItems.has(item.id) ? styles.itemAnimating : {})
                  }}
                  onClick={() => moveItem(item.id, { name: item.name, addedBy: item.addedBy, addedAt: item.addedAt }, "imamo", "kupiti")}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f3f4f6"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
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
                      deleteItem(item.id, "imamo", item.name);
                    }}
                    onMouseEnter={(e) => e.target.style.color = "#dc2626"}
                    onMouseLeave={(e) => e.target.style.color = "#ef4444"}
                  >
                    ✖
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        <div>
          <h2 style={styles.header}>Kupiti ({kupitiArray.length})</h2>
          <ul style={styles.table}>
            {kupitiArray.length === 0 ? (
              <li style={styles.emptyState}>No items to buy</li>
            ) : (
              kupitiArray.map((item) => (
                <li
                  key={item.id}
                  style={{
                    ...styles.item,
                    ...(animatingItems.has(item.id) ? styles.itemAnimating : {})
                  }}
                  onClick={() => moveItem(item.id, { name: item.name, addedBy: item.addedBy, addedAt: item.addedAt }, "kupiti", "imamo")}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f3f4f6"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
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
                      deleteItem(item.id, "kupiti", item.name);
                    }}
                    onMouseEnter={(e) => e.target.style.color = "#dc2626"}
                    onMouseLeave={(e) => e.target.style.color = "#ef4444"}
                  >
                    ✖
                  </button>
                </li>
              ))
            )}
          </ul>

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
              style={{
                ...styles.addButton,
                opacity: !newItem.trim() ? 0.5 : 1,
                cursor: !newItem.trim() ? "not-allowed" : "pointer"
              }}
              onClick={addItem}
              disabled={!newItem.trim()}
              onMouseEnter={(e) => {
                if (newItem.trim()) {
                  e.target.style.backgroundColor = "#2563eb";
                }
              }}
              onMouseLeave={(e) => {
                if (newItem.trim()) {
                  e.target.style.backgroundColor = "#3b82f6";
                }
              }}
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
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    fontSize: "1.2rem",
    color: "#6b7280",
  },
  spinner: {
    width: "40px",
    height: "40px",
    border: "4px solid #e5e7eb",
    borderTop: "4px solid #3b82f6",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    marginBottom: "1rem",
  },
  topBar: {
    width: "100%",
    maxWidth: "600px",
    marginBottom: "1rem",
  },
  logoutContainer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
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
    transition: "background-color 0.3s",
  },
  onlineIndicator: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.5rem",
    backgroundColor: "#f0fdf4",
    borderRadius: "0.5rem",
    marginTop: "0.5rem",
    border: "1px solid #bbf7d0",
  },
  onlineDot: {
    color: "#22c55e",
    marginRight: "0.5rem",
    fontSize: "1.2rem",
    animation: "pulse 2s ease-in-out infinite",
  },
  onlineText: {
    fontSize: "0.9rem",
    color: "#166534",
    fontWeight: "500",
  },
  errorBanner: {
    width: "100%",
    maxWidth: "600px",
    padding: "0.75rem 1rem",
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "0.5rem",
    marginBottom: "1rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: "#991b1b",
    fontSize: "0.9rem",
    animation: "slideIn 0.3s ease-out",
  },
  undoBanner: {
    width: "100%",
    maxWidth: "600px",
    padding: "0.75rem 1rem",
    backgroundColor: "#f0f9ff",
    border: "1px solid #bae6fd",
    borderRadius: "0.5rem",
    marginBottom: "1rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: "#075985",
    fontSize: "0.9rem",
    animation: "slideIn 0.3s ease-out",
  },
  undoButton: {
    padding: "0.25rem 0.75rem",
    backgroundColor: "#0284c7",
    color: "white",
    border: "none",
    borderRadius: "0.375rem",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: "500",
    transition: "background-color 0.2s",
  },
  closeError: {
    background: "none",
    border: "none",
    color: "#991b1b",
    cursor: "pointer",
    fontSize: "1rem",
    padding: "0",
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
    transition: "all 0.3s ease",
  },
  itemAnimating: {
    transform: "scale(0.95)",
    opacity: 0.7,
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
    transition: "color 0.2s",
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
    transition: "border-color 0.2s",
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
    transition: "all 0.3s",
  },
};