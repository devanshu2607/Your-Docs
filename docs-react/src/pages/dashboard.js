import { useEffect , useState} from 'react'
import { useNavigate } from 'react-router-dom'
import api from "../Auth/axios"
import './User.css'

export default function Dashboard(){
  
    const [docs , setDocs] = useState([])
    const [joinCode, setJoinCode] = useState("")
    const navigate = useNavigate()

    useEffect(()=>{
        fetchDocs()
    } , [])

    const fetchDocs = async() => {
        const res = await api.get("/user_docs")
        if (Array.isArray(res.data)) {
  setDocs(res.data)
} else if (Array.isArray(res.data.docs)) {
  setDocs(res.data.docs)
} else {
  setDocs([])
}
    }

    const handledeletedocs = async(id) => {
        await api.delete(`/delete_docs/${id}`)
        setDocs(prev => prev.filter(doc => doc.id !== id))
    }

    return (
        <div className="page">

            <div className="navbar">
                <h2>PIKO DOCS</h2>

                <button onClick={() => navigate("/create_docs")}>
                    + New Docs
                </button>

                {/* 🔥 JOIN LIVE */}
                <input
                    placeholder="Enter code"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                />

                <button onClick={() => {
                    if (!joinCode) return alert("Enter code")
                    navigate(`/update/${joinCode}`)
                }}>
                    Join Live 🔗
                </button>
            </div>

            <div className="docContainer">
                {docs.map((doc) => (
                    <div key={doc.id} className="docRow">

                        <div onClick={() => navigate(`/update/${doc.id}`)}>
                            <h3>{doc.title}</h3>

                            <p dangerouslySetInnerHTML={{
                                __html: doc.content || ""
                            }} />
                        </div>

                        <button
                            className="deleteBtn"
                            onClick={() => handledeletedocs(doc.id)}
                        >
                            Delete
                        </button>
                    </div>
                ))}
            </div>

        </div>
    )
}