import { useState , useRef} from "react";
import './User.css';
import api from '../Auth/axios'
import {Link , useNavigate} from "react-router-dom"



export default function Login(){
    const navigate = useNavigate()
    const passref = useRef();
    const [error, setError] = useState("");
    const [data , Setdata] = useState({
        username : "",
        password : ""
    });

    const handlelogin = async() => { 
        
        try{
            const formData = new URLSearchParams() ;

            formData.append("username" , data.username);
            formData.append("password" , data.password);

            const res = await api.post('login_user' , formData)
            console.log(res.data)
            // localStorage.setItem("token" , res.data.access_token)
            // navigate('/login');
            alert ("login successful")
        }catch(err){
            console.log(err.response?.data)

            const message = err.response?.data?.detail;

            if(message === "user Not registered"){
                alert("User not register")
                navigate('/')
            }
            else if(message === "password doest not match"){
                alert("Password does not match")
                Setdata({ ...data , password : ""});
                setError("Password is wrong")
                passref.current.focus();
            }
            else {
                setError("something went wrong")
            }
        }
    };

    return (
        <section>
            <div className="login">
                <h1>Login</h1>

                
                    <div className="inputBox">
                        <input className="email" placeholder="Email" 
                    onChange={(e) => Setdata({...data , username : e.target.value})}
                    />
                    </div>

                    <div className="inputBox">
                         <input className="password" placeholder="Password" 
                         ref={passref} value={data.password}
                    onChange={(e) => Setdata({...data , password : e.target.value})}
                    />
                    </div>

                    <div className="btn" onClick={handlelogin}>Login</div>
                    {error && <p style={{ color: "red" }}>{error}</p>}

                    <p>
                        Don't have an account? 
                        <Link to="/"> Signup</Link>
                    </p>

            </div>
        </section>
    )
}