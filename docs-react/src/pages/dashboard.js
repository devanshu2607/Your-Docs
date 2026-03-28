import { useEffect , useState} from 'react'
import { useNavigate } from 'react-router-dom'
import api from "../Auth/axios"
import './User.css'

export default function Dashboard(){
  
    const [docs , setDocs] = useState([]);
    const navigate = useNavigate()

    useEffect(()=>{
        fetchDocs();
    } , []);

    const fetchDocs = async() => {
        try{
            const res = await api.get("/user_docs");
             if(Array.isArray(res.data)){
                setDocs(res.data);
            console.log("API response:", res.data);
             }
             else{
                setDocs([]);
                console.log("Not an Array , error:" , res.data)
             }
        }
        catch(err){
            console.log(err);
        }
    };

    const handledeletedocs = async(id) => {
      try{
        await api.delete(`/delete_docs/${id}`)
        console.log("Docs Deleted SuccessFully")
        alert("Docs Deleted")
         setDocs(prev => prev.filter(doc => doc.id !== id)) ;
             }
      catch(err){
        console.log(err)
      }
    }

    
    return (
  <div className="page">

    {/* 🔥 NAVBAR */}
    <div className="navbar">
      <h2>PIKO  DOCS</h2>

      <button onClick={() => navigate("/create_docs")}>
        + New Docs
      </button>
    </div>

    {/* 🔥 DOC LIST */}
    <div className="docContainer">
  {docs.map((doc) => (
    <div
      key={doc.id}
      className="docRow"
    >
      {/* Click se open */}
      <div onClick={() => navigate(`/update/${doc.id}`)}>
        <h3>{doc.title}</h3>

        <p
          dangerouslySetInnerHTML={{
            __html: doc.content || ""
          }}
        />
      </div>

      {/* 🔥 DELETE BUTTON */}
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