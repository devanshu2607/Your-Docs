import api from '../Auth/axios'
import {useState } from 'react'
import {useNavigate} from 'react-router-dom'
import {useEditor , EditorContent} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit' 
import './User.css'


export default function CreateDocs(){
    const [error , SetError] = useState("")
    const navigate = useNavigate()
    const [data , Setdata] = useState({
        title : "",
        content : ""
    })   

    const editor = useEditor({
        extensions: [StarterKit],
        content: "<p>Write your docs...</p>",
        onUpdate: ({ editor }) => {
            const html = editor.getHTML();
            Setdata(prev => ({
                ...prev,
                content: html
            }));
        }
    });


    const handlecreatedocs = async() => {
        try {
            const res = await api.post('create_docs' ,{
                title: data.title,
                content: data.content   // 👈 yaha change
        })
            console.log(res.data)
            navigate('/dashboard')
        } catch(err){
            console.log(err.response?.data)
            SetError("docs not created")

        }
    };

    return (
        <section>
            <div className='docs'>
                <h1>Create Docs</h1>

                <div className='inputBox'>
                    <input type="text"  name= "title" placeholder='Enter title' value={data.title}
                    onChange={(e) => Setdata({ ...data , title : e.target.value})}/>
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
                
                <div className='btn' onClick={handlecreatedocs}>Save Docs</div>

                {error && <p style={{ color: "red" }}>{error}</p>}
            </div>
        </section>
    )
}