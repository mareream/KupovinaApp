import { useState, useEffect } from "react";
import { database, ref, set, onValue } from "./firebase"; // make sure this path matches your project
import { useLocation } from "react-router-dom";

export default function App() {
  const [imamo, setImamo] = useState([]);
  const [kupiti, setKupiti] = useState([]);
  const [newItem, setNewItem] = useState("");
  const [initialized, setInitialized] = useState(false);
  const location = useLocation();
  const username = location.state?.username || "unknown";

  // Load data from Firebase once
  useEffect(() => {
    const dataRef = ref(database, "shoppingList");
    onValue(dataRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setImamo(data.imamo || []);
        setKupiti(data.kupiti || []);
      }
      setInitialized(true);
    });
  }, []);

  // Save data to Firebase only after initial load
  useEffect(() => {
    if (initialized) {
      const dataRef = ref(database, "shoppingList");
      set(dataRef, { imamo, kupiti });
    }
  }, [imamo, kupiti, initialized]);

  const moveItem = (item, fromList, setFrom, toList, setTo) => {
    if (!toList.includes(item)) {
      setFrom((prev) => prev.filter((i) => i.name !== item.name));
      setTo((prev) => [...prev, item]);
    }
  };

  const deleteItem = (item, setList) => {
    setList((prev) => prev.filter((i) => i !== item));
  };

  const addItem = () => {
    if (newItem.trim() !== "") {
      const item = { name: newItem.trim(), addedBy: username };
      setKupiti((prev) => [...prev, item]);
      setNewItem("");
    }
  };

  const userColors = {
    Mare: "blue",
    Caka: "deeppink",
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Left Table */}
        <div>
          <h2 style={styles.header}>Imamo</h2>
          <ul style={styles.table}>
            {imamo.map((item) => (
              <li
                key={item.name}
                style={styles.item}
                onClick={() => moveItem(item, imamo, setImamo, kupiti, setKupiti)}
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
                    deleteItem(item, setImamo);
                  }}
                >
                  ✖
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Right Table */}
        <div>
          <h2 style={styles.header}>Kupiti</h2>
          <ul style={styles.table}>
            {kupiti.map((item) => (
              <li
                key={item.name}
                style={styles.item}
                onClick={() => moveItem(item, kupiti, setKupiti, imamo, setImamo)}
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
                    deleteItem(item, setKupiti);
                  }}
                >
                  ✖
                </button>
              </li>
            ))}
          </ul>

          {/* Input Field and Button */}
          <div style={styles.inputArea}>
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Enter item name!"
              style={styles.input}
            />
            <button style={styles.addButton} onClick={addItem}>
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
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    background: "linear-gradient(to bottom right, #e5e7eb, #f9fafb)",
    padding: "2rem",
  },
  container: {
    display: "grid",
    gridTemplateColumns: "1fr", // Keep a single column for layout
    gap: "2rem",
    padding: "2rem",
    backgroundColor: "#fff",
    borderRadius: "1rem",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
    border: "1px solid #d1d5db",
    width: "100%",
    maxWidth: "600px", // Limit the max width to prevent layout from stretching too much on large screens
  },
  header: {
    fontSize: "1.5rem",
    fontWeight: "bold",
    marginBottom: "1rem",
    color: "#374151",
    textAlign: "center", // Center the header text
  },
  table: {
    border: "1px solid #e5e7eb",
    borderRadius: "0.5rem",
    padding: "1rem",
    backgroundColor: "#fff",
    minWidth: "200px",
    listStyle: "none",
    maxWidth: "100%", // Ensure table uses full width of its container
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
  },
  inputArea: {
    marginTop: "1rem",
    width: "100%", // Ensure the input area takes the full width of the container
  },
  input: {
    padding: "0.75rem",
    border: "1px solid #d1d5db",
    borderRadius: "0.5rem",
    width: "92%", // Set input width to 100% so it takes full container width
    marginBottom: "0.5rem",
    fontSize: "1rem",
  },
  addButton: {
    padding: "0.75rem",
    backgroundColor: "#3b82f6",
    color: "white",
    borderRadius: "0.5rem",
    width: "100%", // Set button width to 100% so it matches the input
    fontWeight: "500",
    border: "none",
    cursor: "pointer",
  },
};

// Media query for larger screens (optional)
if (window.innerWidth > 768) {
  styles.container.gridTemplateColumns = "1fr 1fr";
}
