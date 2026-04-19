import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from "../Auth/axios"
import './User.css'

export default function Dashboard() {
    const [docs, setDocs]       = useState([])
    const [joinCode, setJoinCode] = useState("")
    const navigate = useNavigate()

    useEffect(() => { fetchDocs() }, [])

    const fetchDocs = async () => {
        const res = await api.get("/user_docs")
        setDocs(Array.isArray(res.data) ? res.data : [])
    }

    const handleDeleteDocs = async (id) => {
        try {
            await api.delete(`/delete_docs/${id}`)
            await fetchDocs()
        } catch (err) {
            // Backend returns 403 if not owner
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

    return (
        <div className="page">
            <div className="navbar">
  <h2>PIKO DOCS</h2>

  <div className="nav-actions">
    <button onClick={() => navigate("/create_docs")}>
      + New Docs
    </button>

    <input
      placeholder="Enter code"
      value={joinCode}
      onChange={e => setJoinCode(e.target.value)}
    />

    <button onClick={() => {
      if (!joinCode) return alert("Enter code")
      navigate(`/join/${joinCode}`)
    }}>
      Join Live 🔗
    </button>

    <button className="logout-btn" onClick={handleLogout}>
      Logout 🚪
    </button>
  </div>
</div>

            <div className="docContainer">
                {docs.length === 0 && (
                    <div className="emptyDocs">No documents yet. Create one!</div>
                )}
                {docs.map(doc => (
                    <div key={doc.id} className="docRow">
                        <div className="doc-card-main" onClick={() => navigate(`/update/${doc.id}`)}>
                            <h3>{doc.title}</h3>
                            {/* preview: strip JSON brackets for readability */}
                            <p>{String(doc.content || "").replace(/[{}"\\[\]]/g, '').slice(0, 120)}</p>
                        </div>

                        {/* 
                            Delete button is shown here for convenience.
                            Backend will reject with 403 if user is not owner.
                            The UpdateDocs page also shows delete only for owners.
                        */}
                        <button onClick={() => handleDeleteDocs(doc.id)}>Delete</button>
                    </div>
                ))}
            </div>
        </div>
    )
}
