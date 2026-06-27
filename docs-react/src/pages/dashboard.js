import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from "../Auth/axios"
import './User.css'

const themes = [
    { bg: "#76e8b9", text: "#052e16", border: "rgba(5, 46, 22, 0.1)" }, // Mint
    { bg: "#f472b6", text: "#4c0519", border: "rgba(76, 5, 25, 0.1)" }, // Pink
    { bg: "#60a5fa", text: "#1e3a8a", border: "rgba(30, 58, 138, 0.1)" }, // Blue
    { bg: "#c084fc", text: "#3b0764", border: "rgba(59, 7, 100, 0.1)" }, // Purple
    { bg: "#fbbf24", text: "#451a03", border: "rgba(69, 26, 3, 0.1)" },  // Yellow
    { bg: "#2dd4bf", text: "#115e59", border: "rgba(17, 94, 89, 0.1)" }   // Teal
];

// Helper function to return a theme-appropriate image based on document title/content keywords
function getDocImage(title, content) {
    const text = ((title || "") + " " + (content || "")).toLowerCase();
    if (text.includes("code") || text.includes("develop") || text.includes("program") || text.includes("react") || text.includes("html") || text.includes("js")) {
        return "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=800&q=80"; // Coding screen
    }
    if (text.includes("design") || text.includes("css") || text.includes("ui") || text.includes("ux") || text.includes("art") || text.includes("style")) {
        return "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=800&q=80"; // UI design
    }
    if (text.includes("collab") || text.includes("team") || text.includes("meeting") || text.includes("chat") || text.includes("live")) {
        return "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80"; // Collaboration
    }
    if (text.includes("write") || text.includes("note") || text.includes("draft") || text.includes("book") || text.includes("story") || text.includes("content")) {
        return "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=800&q=80"; // Writing with pen
    }
    // Fallback collection
    const fallbacks = [
        "https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=800&q=80", // Books
        "https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?auto=format&fit=crop&w=800&q=80", // Typing on laptop
        "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=800&q=80", // Workspace coffee
        "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80"  // Tech connection
    ];
    // Seeded choice to ensure consistency for each document
    const seed = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) || 0;
    const index = Math.abs(seed) % fallbacks.length;
    return fallbacks[index];
}

// Clean Lexical/TipTap JSON structure or standard string to get plain text preview
function stripJson(content) {
    if (!content) return "";
    try {
        const parsed = JSON.parse(content);
        const extractText = (node) => {
            if (!node) return "";
            if (typeof node === 'string') return node;
            if (node.text) return node.text;
            if (node.root) return extractText(node.root);
            if (Array.isArray(node)) return node.map(extractText).join(" ");
            if (node.children) return extractText(node.children);
            if (node.content) return extractText(node.content);
            return "";
        };
        const extracted = extractText(parsed);
        if (extracted.trim()) return extracted.trim();
    } catch (e) {
        // Not JSON, fall back to regex
    }
    return String(content).replace(/[{}"\\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function Dashboard() {
    const [docs, setDocs]       = useState([])
    const [joinCode, setJoinCode] = useState("")
    const [isOpeningLatest, setIsOpeningLatest] = useState(false)
    const [isCreating, setIsCreating] = useState(false)
    const navigate = useNavigate()

    useEffect(() => { fetchDocs() }, [])

    const fetchDocs = async () => {
        try {
            const res = await api.post("/user_docs")
            setDocs(Array.isArray(res.data) ? res.data : [])
        } catch (err) {
            alert(err.response?.data?.detail || "Failed to load documents")
        }
    }

    const handleDeleteDocs = async (id) => {
        try {
            await api.delete(`/delete_docs/${id}`)
            await fetchDocs()
        } catch (err) {
            alert(err.response?.data?.detail || "Cannot delete")
        }
    }

    const handleLogout = async () => {
        try { await api.post('/logout') } catch { /* ignore */ }
        finally {
            localStorage.removeItem("token")
            navigate("/login")
        }
    }

    const [pinnedDocId, setPinnedDocId] = useState(localStorage.getItem("pinnedDocId") || null)
    const [activeMenuId, setActiveMenuId] = useState(null)

    useEffect(() => {
        const handleGlobalClick = () => {
            setActiveMenuId(null)
        }
        window.addEventListener("click", handleGlobalClick)
        return () => window.removeEventListener("click", handleGlobalClick)
    }, [])

    // Find pinned doc first, fallback to latest doc
    const pinnedDoc = docs.find(d => d.id === pinnedDocId);
    const heroDoc = pinnedDoc || (docs.length > 0 ? docs[0] : null);

    const handlePinDoc = (id) => {
        if (!id) {
            localStorage.removeItem("pinnedDocId");
            setPinnedDocId(null);
            return;
        }
        const currentPinned = localStorage.getItem("pinnedDocId");
        if (currentPinned === id) {
            localStorage.removeItem("pinnedDocId");
            setPinnedDocId(null);
        } else {
            localStorage.setItem("pinnedDocId", id);
            setPinnedDocId(id);
        }
    }

    const handleOpenLatest = (id) => {
        setIsOpeningLatest(true)
        setTimeout(() => {
            navigate(`/update/${id}`)
        }, 400)
    }

    const handleCreateNew = () => {
        setIsCreating(true)
        setTimeout(() => {
            navigate("/create_docs")
        }, 400)
    }

    return (
        <div className="page dashboard-page">
            {/* Navbar */}
            <div className="navbar">
                <h2 onClick={() => navigate("/")} style={{ cursor: 'pointer' }}>CLAY</h2>
                <div className="nav-actions">
                    <span className="nav-link" onClick={() => navigate("/create_docs")}>
                        Create
                    </span>

                    <div className="nav-join-group">
                        <input
                            placeholder="Enter Code"
                            value={joinCode}
                            onChange={e => setJoinCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                        />
                        <span className="nav-link" onClick={() => {
                            if (!joinCode) return alert("Enter code")
                            navigate(`/join/${joinCode}`)
                        }}>
                            Join
                        </span>
                    </div>

                    <span className="nav-link logout" onClick={handleLogout}>
                        Logout
                    </span>
                </div>
            </div>

            {/* Split layout for single-page viewport */}
            <div className="dashboard-main">
                {/* Left side: Hero Section */}
                <div className="dashboard-left">
                    {heroDoc ? (
                        <div className="dashboard-hero">
                            <div className="dashboard-hero-graphic">
                                <img 
                                    src={getDocImage(heroDoc.title, heroDoc.content)} 
                                    alt={heroDoc.title} 
                                />
                            </div>
                            <div className="dashboard-hero-content">
                                <div className="hero-badge">
                                    {pinnedDocId === heroDoc.id ? "📌 Pinned Document" : "Latest Document"}
                                </div>
                                <div className="hero-selector-bar" style={{ marginTop: '12px', marginBottom: '8px' }}>
                                    <label htmlFor="hero-doc-select" className="selector-label">Pin a Document</label>
                                    <select
                                        id="hero-doc-select"
                                        value={pinnedDocId || ""}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            handlePinDoc(val);
                                        }}
                                    >
                                        <option value="">-- No document pinned (showing latest) --</option>
                                        {docs.map(doc => (
                                            <option key={doc.id} value={doc.id}>
                                                {doc.title || "Untitled Document"}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <h1>
                                    {heroDoc.title}<span className="cursor"></span>
                                </h1>
                                <p>
                                    {stripJson(heroDoc.content).slice(0, 180) || "Empty document"}...
                                </p>
                                <div className="hero-btn-wrapper">
                                    <button 
                                        className={`btn ${isOpeningLatest ? 'animating' : ''}`} 
                                        onClick={() => handleOpenLatest(heroDoc.id)}
                                    >
                                        Open Document
                                        <span className="arrow-wrapper">
                                            <svg className="arrow-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="5" y1="12" x2="19" y2="12"></line>
                                                <polyline points="12 5 19 12 12 19"></polyline>
                                            </svg>
                                        </span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="dashboard-hero">
                            <div className="dashboard-hero-graphic">
                                <img 
                                    src="https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=800&q=80" 
                                    alt="Workspace" 
                                />
                            </div>
                            <div className="dashboard-hero-content">
                                <div className="hero-badge">Get Started</div>
                                <h1>
                                    Hi there!<br />
                                    Create your first<br />
                                    document<span className="cursor"></span>
                                </h1>
                                <p>
                                    Clay Docs is a minimalist, collaborative real-time editor. Start by creating a new document or joining a live session.
                                </p>
                                <div className="hero-btn-wrapper">
                                    <button 
                                        className={`btn ${isCreating ? 'animating' : ''}`} 
                                        onClick={handleCreateNew}
                                    >
                                        Create Document
                                        <span className="arrow-wrapper">
                                            <svg className="arrow-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="5" y1="12" x2="19" y2="12"></line>
                                                <polyline points="12 5 19 12 12 19"></polyline>
                                            </svg>
                                        </span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right side: Workspace list */}
                <div className="dashboard-right">
                    <h3 className="dashboard-section-title">Your Workspace</h3>
                    <div className="dashboard-grid-wrapper">
                        <div className="dashboard-grid">
                            {docs.length === 0 && (
                                <div className="emptyDocs" style={{ color: "#a0a5b0" }}>
                                    No documents yet. Create one!
                                </div>
                            )}
                            {docs.map((doc, idx) => {
                                const theme = themes[idx % themes.length];
                                return (
                                    <div 
                                        key={doc.id} 
                                        className="colored-doc-card"
                                        style={{ backgroundColor: theme.bg, color: theme.text }}
                                    >
                                        {/* Slanted Image mockup at top */}
                                        <div className="colored-doc-card-image">
                                            <img 
                                                src={getDocImage(doc.title, doc.content)} 
                                                alt={doc.title} 
                                                onClick={() => navigate(`/update/${doc.id}`)}
                                            />
                                        </div>
                                        
                                        {/* Card Body */}
                                        <div className="colored-doc-card-body">
                                            <div className="doc-card-main" onClick={() => navigate(`/update/${doc.id}`)}>
                                                <div className="colored-doc-card-header">
                                                    <svg 
                                                        className="go-icon" 
                                                        viewBox="0 0 24 24" 
                                                        width="20" 
                                                        height="20" 
                                                        fill="none" 
                                                        stroke="currentColor" 
                                                        strokeWidth="2.5" 
                                                        strokeLinecap="round" 
                                                        strokeLinejoin="round"
                                                    >
                                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                                        <polyline points="15 3 21 3 21 9"></polyline>
                                                        <line x1="10" y1="14" x2="21" y2="3"></line>
                                                    </svg>
                                                    <h3>{doc.title}</h3>
                                                </div>
                                                <p style={{ color: theme.text }}>
                                                    {stripJson(doc.content).slice(0, 140) || "Empty document"}
                                                </p>
                                            </div>
                                            
                                            {/* Card Footer */}
                                            <div className="colored-doc-card-footer" style={{ justifyContent: 'flex-end', position: 'relative' }}>
                                                <div className="card-menu-container">
                                                    <button 
                                                        className="card-menu-trigger"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setActiveMenuId(activeMenuId === doc.id ? null : doc.id);
                                                        }}
                                                        aria-label="Document options"
                                                        style={{ color: theme.text }}
                                                    >
                                                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <circle cx="12" cy="5" r="1.5"></circle>
                                                            <circle cx="12" cy="12" r="1.5"></circle>
                                                            <circle cx="12" cy="19" r="1.5"></circle>
                                                        </svg>
                                                    </button>
                                                    {activeMenuId === doc.id && (
                                                        <div className="card-menu-dropdown" onClick={(e) => e.stopPropagation()}>
                                                            <button 
                                                                className={`menu-item ${pinnedDocId === doc.id ? 'pinned' : ''}`}
                                                                onClick={() => {
                                                                    handlePinDoc(doc.id);
                                                                    setActiveMenuId(null);
                                                                }}
                                                            >
                                                                {pinnedDocId === doc.id ? "📌 Unpin" : "📍 Pin"}
                                                            </button>
                                                            <button 
                                                                className="menu-item delete"
                                                                onClick={() => {
                                                                    if (window.confirm("Are you sure you want to delete this document?")) {
                                                                        handleDeleteDocs(doc.id);
                                                                    }
                                                                    setActiveMenuId(null);
                                                                }}
                                                            >
                                                                🗑️ Delete
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
