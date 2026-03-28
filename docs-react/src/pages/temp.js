import {useState} from "react";
import api from "../Auth/axios";
import './User.css'
import {Link , useNavigate} from 'react-router-dom'

export default function SignUp(){
    const navigate = useNavigate()
    const [data , Setdata] = useState({
        name :"",
        gender : "",
        email : "" ,
        age : "",
        address : "",
        password : "",
    })

    const handlsignup = async() =>{
        try{
            const res = await api.post('/create_user' , data);
            console.log(res.data)
            alert("Signup successfull")
            navigate('/login')
        } catch(err){
            console.log(err)
            alert("signup unsuccessfull")
        }
    };
    
    return (
      <section>
          <div className="login">
            
                    <h1>Sign Up</h1>

                    <div className="inputBox">
                        <input className="text" placeholder="Name" 
                    onChange={(e) => Setdata({...data , name : e.target.value})}
                    />
                    </div>

                    <div className="inputBox">
                         <input className="text" placeholder="Gender" 
                    onChange={(e) => Setdata({...data , gender : e.target.value})}
                    />
                    </div>
                    <div className="inputBox">
                         <input className="email" placeholder="Email" 
                    onChange={(e) => Setdata({...data , email : e.target.value})}
                    />
                    </div>
                    <div className="inputBox">
                         <input className="number" placeholder="Age" 
                    onChange={(e) => Setdata({...data , age : e.target.value})}
                    />
                    </div>
                    <div className="inputBox">
                        
                    <input className="text" placeholder="Address" 
                    onChange={(e) => Setdata({...data , address : e.target.value})}
                    />
                    </div>
                    <div className="inputBox">
                        <input className="password" placeholder="Password" 
                    onChange={(e) => Setdata({...data , password : e.target.value})}
                    />
                    </div>

                    <div className="inputBox">
                    <button className="btn btn-primary" onClick={handlsignup}>Signup</button>
                </div>
               <p>
                        Already have Account ?
                        <Link to="/login">Login</Link>
                    </p>

                
            </div>
      </section>

    )
}