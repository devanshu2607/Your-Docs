import api from '../Auth/axios'
import { useState, useEffect, useRef } from 'react'
import { useParams , useNavigate } from 'react-router-dom'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import './User.css'

export default function JoinDocs() {
    const { docId } = useParams()
    const navigate = useNavigate()
    const [joined, setJoined] = useState(false)
    const wsRef = useRef(null)
    const editorRef = useRef(null)
    const isRemoteUpdate = useRef(false) // ✅ remote update flag
    

    const editor = useEditor({
        extensions: [StarterKit],
        content: "<p>Connecting...</p>",
        editable: true,
        onUpdate: ({ editor }) => {
            if (isRemoteUpdate.current) return // ✅ remote update hai to send mat karo

            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(editor.getHTML())
            }
        }
    });

    useEffect(() => {
        editorRef.current = editor
    }, [editor])

    useEffect(() => {
        if (!docId) return

        const loadAndConnect = async () => {
              try {
        const res = await api.get(`/get_doc/${docId}`)
        const content = res.data.content || "<p></p>"
        const originalTitle = res.data.title || "Untitled"

        if (editorRef.current) {
            isRemoteUpdate.current = true
            editorRef.current.commands.setContent(content, false)
            isRemoteUpdate.current = false
        }

        // ✅ Sirf ek baar apni copy save karo
        const savedkey = `copied_${docId}`
        if(!localStorage.getItem(savedkey)){
            localStorage.getItem(savedkey , 'true')
              const copyRes  =   await api.post('create_docs', {
                    title: `Copy of ${originalTitle}`,
                    content: content
        })
        console.log("Copy created with ID:", copyRes.data.id)
    }

    } catch (err) {
        console.log("Doc fetch failed", err)
    }

            // WebSocket connect karo
            const token = localStorage.getItem("token")
            const socket = new WebSocket(`ws://localhost:8000/ws/${docId}?token=${token}`)

            socket.onopen = () => setJoined(true)

            socket.onmessage = (event) => {
                const currentEditor = editorRef.current
                if (!currentEditor) return
                if (event.data === currentEditor.getHTML()) return // same, skip

                // ✅ Cursor reset nahi hoga
                isRemoteUpdate.current = true
                const { from, to } = currentEditor.state.selection
                currentEditor.commands.setContent(event.data, false)
                try {
                    currentEditor.commands.setTextSelection({ from, to })
                } catch (_) {}
                isRemoteUpdate.current = false
            }

            socket.onerror = (e) => console.log("WS error", e)
            socket.onclose = (event) => {
                    setJoined(false)
                if (event.reason ==="Session ended by host") {
        alert("The host has ended this session.")
        navigate("/dashboard")
    }}

            wsRef.current = socket
        }

        loadAndConnect()

        return () => {
            if (wsRef.current) wsRef.current.close()
        }
    }, [docId , navigate]) 
    
     const handleLeaveSession = () => {
        if (wsRef.current) {
            wsRef.current.close()
            wsRef.current = null
        }
        setJoined(false)
        navigate("/dashboard")
    }

    return (
        <section>
            <div className='docs'>
                <h1>Live Doc</h1>
                {!joined ? (
                    <p style={{ color: "#1f2937" }}>Connecting...</p>
                ) : (
                    <>
                        <p style={{ color: "green" }}>Connected ✅</p>
                        <div className="toolbar">
                            <button onClick={() => editor?.chain().focus().toggleBold().run()}>Bold</button>
                            <button onClick={() => editor?.chain().focus().toggleItalic().run()}>Italic</button>
                        </div>
                        <div className="inputBox">
                            <EditorContent editor={editor} />
                        </div>
                        
                         <div style={{ display: "flex", gap: "10px" }}>
                           
                            {/* ✅ Leave Session */}
                            <div className='btn' style={{
                                flex: 1,
                                background: "linear-gradient(135deg, #ff6b6b, #ee0979)"
                            }}
                                onClick={handleLeaveSession}>
                                🚪 Leave Session
                            </div>
                        </div>
                    </>
                )}
            </div>
        </section>
    )
}