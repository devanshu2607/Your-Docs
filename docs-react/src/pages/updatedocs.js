import api from '../Auth/axios'
import { useState, useEffect, useRef     } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useEditor, EditorContent} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import './User.css'

export default function UpdateDocs() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [title, setTitle] = useState("")
    const [connected , setConnected] = useState(false )
    const [error, setError] = useState("")
    const [saved, setSaved] = useState(false)
    const [showCode , setShowCode] = useState(false)
    const [loading , setLoading] = useState(false)
    const [fetchedContent, setFetchedContent] = useState(null) // ✅ content store karo
    const editorRef = useRef(null)
    const wsRef = useRef(null)
    const isRmoteUpdate = useRef(false)

    const editor = useEditor({
        extensions: [StarterKit],
        content: "<p>Loading...</p>",
        onUpdate :({editor})=>{
            if (isRmoteUpdate.current) return 

            if(wsRef.current && wsRef.current.readyState === WebSocket.OPEN){
                wsRef.current.send(editor.getHTML())
            }
        }
    });

    // ✅ editor ref latest rakho
    useEffect(() => {
        editorRef.current = editor
    }, [editor])

    // ✅ Pehle data fetch karo, content state mein rakho
    useEffect(() => {
        if (!id) return

        const fetchDoc = async () => {
            try {
                const res = await api.get(`/get_doc/${id}`)
                setTitle(res.data.title || "")
                setFetchedContent(res.data.content || "<p></p>")
            } catch (err) {
                console.log("Doc load failed", err)
                setError("Doc load nahi hua")
            }
        }

        fetchDoc()
    }, [id])

    // ✅ Jab content aaye AUR editor ready ho — tab set karo
    useEffect(() => {
        if (editor && fetchedContent) {
            editor.commands.setContent(fetchedContent, false)
        }
    }, [editor, fetchedContent])

    useEffect(() => {
        return () => {
            if (wsRef.current){
                wsRef.current.close()
                wsRef.current = null
            }
        }
    },[])

    const handleUpdate = async () => {
        if (loading) return 
        setLoading(true)
        try {
            await api.put(`/update_docs/${id}`, {
                title: title,
                content: editorRef.current?.getHTML()
            })
            setSaved(true)
            setTimeout(() => navigate("/dashboard"), 1000)
        } catch (err) {
            setError("Update failed")
        }
    }

    const handleStartSession = () => {
        const token = localStorage.getItem("token")
        const scoket = new WebSocket(`ws://localhost:8000/ws/${id}?token=${token}`)
        
        scoket.onopen=()=>{
            setConnected(true)
            setShowCode(true)
        }
        scoket.onmessage = (event) => {
            const currenteditor = editorRef.current
            if (!currenteditor) return 
            if (event.data === currenteditor.getHTML()) return 

            isRmoteUpdate.current = true
            const {from , to } = currenteditor.state.selection 
            currenteditor.commands.setContent(event.data , false)
            try{
                currenteditor.commands.setTextSelection({from , to })
            }catch(_) {}
            isRmoteUpdate.current =false
        }
        scoket.onerror = (e) => console.log("Ws error" ,e )

        scoket.onclose = () => {
            setConnected(false)
            setShowCode(false)
        }
        wsRef.current = scoket
    }
    const handleEndSession = () => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({type : "END_SESSION"}))
        }
        setConnected(false)
        setShowCode(false)
    }

    return (
        <section>
            <div className='docs'>
                <h1>Edit Doc</h1>

                <div className='inputBox'>
                    <input
                        type="text"
                        placeholder='Title'
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                </div>
                {showCode && (
                    <div>
                        <p style={{ color: "#1f2937" }}>Share Code:</p>
                        <b style={{ color: "#1f2937" }}>{id}</b>
                    </div>
                )}

                {/* ✅ Connect button — sirf tab dikhega jab connected nahi */}
                {!connected ? (
                    <div className='btn' onClick={handleStartSession}>
                        🔴 Start Live Session
                    </div>
                ) : (
                    <div style={{ display: "flex", gap: "10px" }}>
                        <div className='btn' style={{
                            background: "linear-gradient(135deg, #a8edea, #fed6e3)",
                            flex: 1
                        }}>
                            Connected ✅
                        </div>
                        <div className='btn' style={{
                            background: "linear-gradient(135deg, #ff6b6b, #ee0979)",
                            flex: 1
                        }}
                            onClick={handleEndSession}>
                            🔴 End Session
                        </div>
                    </div>
                )}

                <div className="toolbar">
                    <button onClick={() => editor?.chain().focus().toggleBold().run()}>Bold</button>
                    <button onClick={() => editor?.chain().focus().toggleItalic().run()}>Italic</button>
                </div>

                <div className="inputBox">
                    <EditorContent editor={editor} />
                </div>

                <div className='btn' onClick={handleUpdate} style={{ opacity: loading ? 0.6 : 1 }}>
                    {loading ? "Saving..." : "Save Changes"}
                </div>

                {saved && <p style={{ color: "green" }}>Saved! Redirecting...</p>}
                {error && <p style={{ color: "red" }}>{error}</p>}
            </div>
        </section>
    )
}   