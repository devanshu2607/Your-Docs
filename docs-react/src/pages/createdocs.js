import api from '../Auth/axios'
import {useState , useEffect} from 'react'
import {useNavigate } from 'react-router-dom'
import {useEditor , EditorContent} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit' 
import './User.css'

export default function CreateDocs(){
    const [error , SetError] = useState("")
    const navigate = useNavigate()
    const [ws, setWs] = useState(null)
    const [connected, setConnected] = useState(false)
    const [docId, setDocId] = useState(null)

    const [data , Setdata] = useState({
        title : "",
        content : ""
    })   

    const editor = useEditor({
        extensions: [StarterKit],
        content: "<p>Write your docs...</p>",
        onUpdate: ({ editor }) => {
            Setdata(prev => ({
                ...prev,
                content: editor.getHTML()
            }));
        }
    });

    const handlecreatedocs = async() => {
        try {
            const res = await api.post('create_docs' ,{
                title: data.title,
                content: data.content
            })
            setDocId(res.data.id)
        } catch(err){
            console.log(err.response?.data)
            SetError("docs not created")
        }
    };

    const handleConnect = () => {
        if (!docId) return alert("Create doc first")

        const token = localStorage.getItem("token")

        const socket = new WebSocket(
            `ws://localhost:8000/ws/${docId}?token=${token}`
        )

        socket.onopen = () => setConnected(true)

        socket.onmessage = (event) => {
            if (event.data !== editor.getHTML()) {
                editor.commands.setContent(event.data)
            }
        }

        setWs(socket)
    }

    useEffect(() => {
        if (!editor || !ws || !connected) return

        const handler = () => {
            ws.send(editor.getHTML())
        }

        editor.on("update", handler)
        return () => editor.off("update", handler)

    }, [editor, ws, connected])

    return (
        <section>
            <div className='docs'>
                <h1>Create Docs</h1>

                <div className='inputBox'>
                    <input
                        type="text"
                        placeholder='Enter title'
                        value={data.title}
                        onChange={(e) =>
                            Setdata({ ...data , title : e.target.value})
                        }
                    />
                </div>

                <div className='btn' onClick={handlecreatedocs}>
                    Create Doc
                </div>

                {/* 🔥 CODE SHOW */}
                {docId && (
                    <div>
                        <p>Share Code:</p>
                        <b>{docId}</b>
                    </div>
                )}

                <div className='btn' onClick={handleConnect}>
                    {connected ? "Connected ✅" : "Start Live Editing"}
                </div>

                <div className="toolbar">
                    <button onClick={() => editor.chain().focus().toggleBold().run()}>
                        Bold
                    </button>

                    <button onClick={() => editor.chain().focus().toggleItalic().run()}>
                        Italic
                    </button>
                </div>

                <div className="inputBox">  
                    <EditorContent editor={editor} />
                </div>

                {error && <p style={{ color: "red" }}>{error}</p>}
            </div>
        </section>
    )
}