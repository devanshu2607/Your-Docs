import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../Auth/axios'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import './User.css'

export default function Update() {
    const { id } = useParams()
    const navigate = useNavigate()

    const [error, setError] = useState("")
    const [data, setData] = useState({
        title: "",
        content: ""
    })

    const editor = useEditor({
        extensions: [StarterKit],
        content: "",
        onUpdate: ({ editor }) => {
            const html = editor.getHTML()
            setData(prev => ({
                ...prev,
                content: html
            }))
        }
    })

    // 🔥 Fetch existing doc
   useEffect(() => {
    if (!editor) return;

    const fetchDoc = async () => {
        try {
            const res = await api.get(`/docs/${id}`)

            console.log("Fetched doc:", res.data)

            setData({
                title: res.data.title,
                content: res.data.content
            })

            editor.commands.setContent(res.data.content)

        } catch (err) {
            console.log(err)
            setError("Failed to load document")
        }
    }

    fetchDoc()
}, [id, editor])

    // 🔥 Update doc
    const handleUpdateDocs = async () => {
    try {
        const html = editor.getHTML();  // 🔥 direct editor se

        const res = await api.put(`/update_docs/${id}`, {
            title: data.title,
            content: html
        })

        console.log("Updated:", res.data)
        navigate('/dashboard')

    } catch (err) {
        console.log(err.response?.data)
        setError('Docs not updated')
    }
}

    return (
        <section>
            <div className='docs'>
                <h1>Update Docs</h1>

                {/* Title Input */}
                <div className='inputBox'>
                    <input
                        type="text"
                        placeholder='Enter title'
                        value={data.title}
                        onChange={(e) =>
                            setData({ ...data, title: e.target.value })
                        }
                    />
                </div>

                {/* Toolbar */}
                <div className="toolbar">
                    <button onClick={() => editor?.chain().focus().toggleBold().run()}>
                        Bold
                    </button>

                    <button onClick={() => editor?.chain().focus().toggleItalic().run()}>
                        Italic
                    </button>
                </div>

                {/* Editor */}
                <div className="inputBox">
                    <EditorContent editor={editor} />
                </div>

                {/* Save Button */}
                <div className='btn' onClick={handleUpdateDocs}>
                    Update Docs
                </div>

                {error && <p style={{ color: "red" }}>{error}</p>}
            </div>
        </section>
    )
}