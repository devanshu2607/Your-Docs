import api from '../Auth/axios'
import { useState, useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import './User.css'

export default function CreateDocs() {
    const [error, SetError] = useState("")
    const [connected, setConnected] = useState(false)
    const [docId, setDocId] = useState(null)
    const [showCode, setShowCode] = useState(false)
    const wsRef = useRef(null)
    const editorRef = useRef(null)
    const isRemoteUpdate = useRef(false) // ✅ remote update flag

    const [data, Setdata] = useState({ title: "", content: "" })

    const editor = useEditor({
        extensions: [StarterKit],
        content: "<p>Write your docs...</p>",
        onUpdate: ({ editor }) => {
            if (isRemoteUpdate.current) return // ✅ remote update hai to send mat karo

            Setdata(prev => ({ ...prev, content: editor.getHTML() }))

            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(editor.getHTML())
            }
        }
    });

    useEffect(() => {
        editorRef.current = editor
    }, [editor])

    useEffect(() => {
        return () => {
            if (wsRef.current) {
                wsRef.current.close()
                wsRef.current = null
            }
        }
    },[])

    const handlecreatedocs = async () => {
        if (docId) return
        try {
            const res = await api.post('create_docs', {
                title: data.title,
                content: data.content
            })
            setDocId(res.data.id)
            setShowCode(false)
        } catch (err) {
            SetError("docs not created")
        }
    }

    const handleConnect = () => {
        if (!docId) return alert("Pehle Create Doc karo")

        const token = localStorage.getItem("token")
        const socket = new WebSocket(`ws://localhost:8000/ws/${docId}?token=${token}`)

        socket.onopen = () => {
            setConnected(true)
            setShowCode(true)
        }

        socket.onmessage = (event) => {
            const currentEditor = editorRef.current
            if (!currentEditor) return
            if (event.data === currentEditor.getHTML()) return // same content, skip

            // ✅ Cursor reset nahi hoga — transaction use karo
            isRemoteUpdate.current = true
            const { from, to } = currentEditor.state.selection
            currentEditor.commands.setContent(event.data, false)
            // cursor restore karo
            try {
                currentEditor.commands.setTextSelection({ from, to })
            } catch (_) {}
            isRemoteUpdate.current = false
        }

        socket.onerror = (e) => console.log("WebSocket error", e)
        socket.onclose = () => setConnected(false)

        wsRef.current = socket
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
                <h1>Create Docs</h1>

                <div className='inputBox'>
                    <input
                        type="text"
                        placeholder='Enter title'
                        value={data.title}
                        onChange={(e) => Setdata({ ...data, title: e.target.value })}
                    />
                </div>

                <div className='btn' onClick={handlecreatedocs}>Create Doc</div>

                {showCode && docId && (
                    <div>
                        <p style={{ color: "#1f2937" }}>Share Code:</p>
                        <b style={{ color: "#1f2937" }}>{docId}</b>
                    </div>
                )}

                {docId && !connected && (
                    <div className='btn' onClick={handleConnect}>Start Live Editing</div>
                )}

                {connected && (
    <div style={{ display: "flex", gap: "10px" }}>
        <div className='btn' style={{
            flex: 1,
            background: "linear-gradient(135deg, #a8edea, #fed6e3)"
        }}>
            Connected ✅
        </div>
        <div className='btn' style={{
            flex: 1,
            background: "linear-gradient(135deg, #ff6b6b, #ee0979)"
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

                {error && <p style={{ color: "red" }}>{error}</p>}
            </div>
        </section>
    )
}